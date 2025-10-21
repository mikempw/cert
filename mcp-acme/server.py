import os, time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from adapters.inventory import Inventory
from adapters.vault import Vault
from adapters.bigip import BigIP
from orchestrator import Orchestrator
from guided_api import get_router as guided_router_factory

app = FastAPI(title="MCP ACME v2", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=None,
#    allow_origin_regex=r"^http://(?:localhost|127\.0\.0\.1|192\.168\.100\.53):(?:5173|5174)$",
#    allow_origins=["http://localhost:5173", "http://192.168.100.53:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- universal preflight handler (safety net) ---
@app.options("/{rest_of_path:path}")
def options_cors_preflight(rest_of_path: str):
    return Response(status_code=200)

inv: Optional[Inventory] = None
vault: Optional[Vault] = None
bigip_defaults: Optional[BigIP] = None
orc: Optional[Orchestrator] = None

@app.on_event("startup")
def _startup():
    global inv, vault, bigip_defaults, orc

    # ---- Inventory (Postgres) with retry ----
    dsn = os.getenv("DB_DSN")
    if not dsn:
        raise RuntimeError("DB_DSN is not set")
    last_err = None
    for _ in range(30):
        try:
            inv = Inventory(dsn)   # also creates schema
            last_err = None
            break
        except Exception as e:
            last_err = e
            time.sleep(2)
    if inv is None:
        raise RuntimeError(f"Could not connect to Postgres: {last_err}")

    # ---- Vault/OpenBao ----
    vault_addr = os.getenv("VAULT_ADDR", "http://vault:8200")
    vault_token = os.getenv("VAULT_TOKEN", "")
    vault = Vault(vault_addr, vault_token)

    # ---- BIG-IP default creds (host is per-call; user/pass kept here) ----
    bigip_defaults = BigIP(
        os.getenv("BIGIP_HOST", "") or "0.0.0.0",  # not used for per-call host
        os.getenv("BIGIP_USER", "") or "admin",
        os.getenv("BIGIP_PASS", "") or ""
    )

    # ---- Orchestrator ----
    orc = Orchestrator(
        inv=inv,
        vault=vault,
        bigip=bigip_defaults,
        allow_key_export=os.getenv("ALLOW_KEY_EXPORT", "false").lower() == "true",
        default_key_type=os.getenv("DEFAULT_KEY_TYPE", "EC256")
    )

    # ---- Guided/templates API (mount extra routes) ----
    app.include_router(guided_router_factory(
        dsn=dsn,
        orc=orc,
        bigip_user=os.getenv("BIGIP_USER", "admin"),
        bigip_pass=os.getenv("BIGIP_PASS", "")
    ))


# ---------- Models ----------
class StartGuidedInput(BaseModel):
    template_id: Optional[str] = None

class RequestCertInput(BaseModel):
    domains: List[str]
    provider: str = Field(default="lets-encrypt")
    directory_url: Optional[str] = None
    eab_secret: Optional[str] = None
    challenge_type: str = Field(default="HTTP-01")
    contact_emails: List[str] = Field(default_factory=list)
    key_type: str = Field(default="EC256")
    tags: List[str] = Field(default_factory=list)
    bigip_host: Optional[str] = None
    bigip_partition: Optional[str] = None
    clientssl_profile: Optional[str] = None
    sni_name: Optional[str] = None
    key_secret_path: str

class FinalizeInput(BaseModel):
    cert_id: str
    wait_seconds: int = 60

class GetBundleInput(BaseModel):
    cert_id: str
    include_private_key: bool = False

class RenewInput(BaseModel):
    cert_id: str

class RevokeInput(BaseModel):
    cert_id: str
    reason: str

class ListInput(BaseModel):
    query: Optional[str] = None
    expiring_within_days: int = 30
    tag: Optional[str] = None

class PublishInput(BaseModel):
    cert_id: str
    challenges: List[Dict[str, Any]]
    bigip_host: str
    bigip_partition: str = "/Common"
    datagroup_name: str = "acme_challenge_dg"

class DeployInput(BaseModel):
    cert_id: str
    bigip_host: str
    partition: str = "/Common"
    clientssl_profile: Optional[str] = None      # if None, auto-create clientssl_<hostname>
    sni_name: Optional[str] = None
    create_profile: bool = True
    virtual_server: Optional[str] = None         # e.g., "/Common/https_vs"

# ---------- Startup ----------
@app.on_event("startup")
def _startup():
    global inv, vault, bigip_defaults, orc
    dsn = os.getenv("DB_DSN")
    if not dsn:
        raise RuntimeError("DB_DSN is not set")

    last_err = None
    for _ in range(30):
        try:
            inv = Inventory(dsn)
            last_err = None
            break
        except Exception as e:
            last_err = e
            time.sleep(2)
    if inv is None:
        raise RuntimeError(f"Could not connect to Postgres: {last_err}")

    vault_addr = os.getenv("VAULT_ADDR", "http://vault:8200")
    vault_token = os.getenv("VAULT_TOKEN", "")
    vault = Vault(vault_addr, vault_token)

    bigip_defaults = BigIP(
        os.getenv("BIGIP_HOST", "") or "0.0.0.0",
        os.getenv("BIGIP_USER", "") or "admin",
        os.getenv("BIGIP_PASS", "") or ""
    )

    orc = Orchestrator(
        inv=inv,
        vault=vault,
        bigip=bigip_defaults,
        allow_key_export=os.getenv("ALLOW_KEY_EXPORT", "false").lower() == "true",
        default_key_type=os.getenv("DEFAULT_KEY_TYPE", "EC256")
    )

# ---------- Health ----------
@app.get("/readyz")
def readyz():
    try:
        _ = inv.get("__nonexistent__")  # type: ignore
        return {"ok": True}
    except Exception as e:
        raise HTTPException(503, f"db not ready: {e}")

# ---------- MCP Tool discovery ----------
@app.get("/mcp/tools")
def mcp_tools():
    return {"tools": [
        {"name": "acme.start_guided_session"},
        {"name": "acme.request_certificate"},
        {"name": "acme.finalize_order"},
        {"name": "acme.get_certificate_bundle"},
        {"name": "acme.renew_certificate"},
        {"name": "acme.revoke_certificate"},
        {"name": "acme.list_certificates"},
        {"name": "bigip.publish_http01_challenges"},
        {"name": "bigip.deploy_certificate"},
    ]}

# ---------- ACME tools ----------
@app.post("/acme/start_guided_session")
def start_guided_session(inp: StartGuidedInput):
    questions = [
        {"id": "domains", "prompt": "Which domains (comma-separated)?"},
        {"id": "provider", "prompt": "Provider? (lets-encrypt|google|sectigo|digicert|zerossl|custom)", "default": "lets-encrypt"},
        {"id": "directory_url", "prompt": "Custom ACME directory URL (if provider=custom), else blank.", "default": ""},
        {"id": "eab_secret", "prompt": "Vault path for EAB creds (if required), else blank.", "default": ""},
        {"id": "challenge_type", "prompt": "Challenge type? (HTTP-01 for now)", "default": "HTTP-01"},
        {"id": "contact_emails", "prompt": "Contact email(s) (comma-separated)", "default": ""},
        {"id": "key_type", "prompt": "Key type? (EC256|EC384|RSA2048|RSA3072|RSA4096)", "default": "EC256"},
        {"id": "tags", "prompt": "Tags (comma-separated)", "default": ""},
        {"id": "bigip_host", "prompt": "BIG-IP host (mgmt IP/hostname) for auto-publish? (optional)", "default": ""},
        {"id": "bigip_partition", "prompt": "BIG-IP partition? (e.g., /Common)", "default": "/Common"},
        {"id": "clientssl_profile", "prompt": "Client-SSL profile name (leave empty to auto-create per host)", "default": ""},
        {"id": "sni_name", "prompt": "SNI server name (leave empty if not using SNI)", "default": ""},
        {"id": "key_secret_path", "prompt": "Vault path to store private key (KV v2), e.g., secret/data/tls/example.com", "default": ""}
    ]
    return {"template_id": inp.template_id, "questions": questions}

@app.get("/acme/start_guided_session")
def start_guided_session_get():
    return start_guided_session(StartGuidedInput(template_id=None))

@app.post("/acme/request_certificate")
def request_certificate(inp: RequestCertInput):
    try:
        return orc.request_certificate(inp.dict())  # type: ignore
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/acme/finalize_order")
def finalize_order(inp: FinalizeInput):
    try:
        return orc.finalize_order(inp.cert_id, wait_seconds=inp.wait_seconds)  # type: ignore
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/acme/get_certificate_bundle")
def get_bundle(inp: GetBundleInput):
    try:
        return orc.get_bundle(inp.cert_id, include_key=inp.include_private_key)  # type: ignore
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/acme/renew_certificate")
def renew_certificate(inp: RenewInput):
    try:
        return orc.renew_certificate(inp.cert_id)  # type: ignore
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/acme/revoke_certificate")
def revoke_certificate(inp: RevokeInput):
    try:
        return orc.revoke_certificate(inp.cert_id, inp.reason)  # type: ignore
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/acme/list_certificates")
def list_certificates(inp: ListInput):
    try:
        return orc.list_certificates(inp.query, inp.expiring_within_days, inp.tag)  # type: ignore
    except Exception as e:
        raise HTTPException(400, str(e))

# ---------- BIG-IP helpers ----------
@app.post("/bigip/publish_http01_challenges")
def publish_http01_challenges(inp: PublishInput):
    try:
        return orc.publish_http01_challenges(  # type: ignore
            cert_id=inp.cert_id,
            challenges=inp.challenges,
            bigip_host=inp.bigip_host,
            partition=inp.bigip_partition,
            dg_name=inp.datagroup_name
        )
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/bigip/deploy_certificate")
def deploy_certificate(inp: DeployInput):
    try:
        return orc.deploy_to_bigip(  # type: ignore
            cert_id=inp.cert_id,
            host=inp.bigip_host,
            partition=inp.partition,
            clientssl=inp.clientssl_profile,
            sni_name=inp.sni_name,
            create_profile=inp.create_profile,
            virtual_server=inp.virtual_server
        )
    except Exception as e:
        raise HTTPException(400, str(e))
