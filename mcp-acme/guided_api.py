# mcp-acme/guided_api.py
from typing import Optional, Dict, Any, List, Tuple
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from adapters.templates import TemplatesDAO
from adapters.sessions import SessionsDAO
from adapters.bigip import BigIP
from orchestrator import Orchestrator, AcmeRateLimitError, AcmeEabRequiredError
import re

def get_router(dsn: str, orc: Orchestrator, bigip_user: str, bigip_pass: str):
    """
    Guided/template API router for Issue & Renew.
    - Honors provider/directory_url and eab_secret for both issue and renew.
    - Friendly 429 on ACME rate limit with 'retry_after' and 'directory_url'.
    - Friendly 400 when EAB is required (directory_url included).
    """
    router = APIRouter()
    tdao = TemplatesDAO(dsn)
    sdao = SessionsDAO(dsn)

    _BIGIP_USER = bigip_user or getattr(getattr(orc, "bigip", None), "user", None) or ""
    _BIGIP_PASS = bigip_pass or getattr(getattr(orc, "bigip", None), "password", None) or ""

    # ---------- Pydantic models ----------
    class TemplateCreate(BaseModel):
        name: str
        provider: str
        directory_url: Optional[str] = None
        challenge_type: str = "HTTP-01"
        contact_emails: List[str] = []
        key_type: str = "EC256"
        bigip_host: Optional[str] = None
        bigip_partition: str = "/Common"
        clientssl_profile: Optional[str] = None
        virtual_server: Optional[str] = None
        key_secret_path: Optional[str] = None
        eab_secret: Optional[str] = None
        tags: List[str] = []

    class GuidedStart(BaseModel):
        mode: str = Field(pattern="^(issue|renew)$")
        template_name: Optional[str] = None
        slots: Dict[str, Any] = {}

    class GuidedAnswer(BaseModel):
        session_id: str
        question_id: str
        value: Any

    class GuidedCommit(BaseModel):
        session_id: str
        replace_existing_clientssl: bool = False

    class VSCheck(BaseModel):
        bigip_host: str
        virtual_server: str
        partition: str = "/Common"

    # ---------- helpers ----------
    def _normalize_slots(slots: Dict[str,Any]) -> Dict[str,Any]:
        s = dict(slots or {})
        for k,v in list(s.items()):
            if isinstance(v,str): s[k] = v.strip()
        if "domains" in s and isinstance(s["domains"], str):
            s["domains"] = [d.strip() for d in s["domains"].split(",") if d.strip()]
        return s

    def _first_missing(slots: Dict[str,Any]) -> Optional[str]:
        mode = (slots.get("mode") or "").lower()
        core_http01 = ["mode","domains","bigip_host","bigip_partition","clientssl_profile","virtual_server","key_secret_path"]
        if mode == "renew":
            required = core_http01
        else:
            required = ["mode","domains","provider","contact_emails","key_type","challenge_type"] + core_http01
        # EAB is optional unless the provider requires it; we detect that later and return 400 with guidance
        for q in required:
            # Allow empty strings for both clientssl_profile and virtual_server
            if q in ["clientssl_profile", "virtual_server"] and slots.get(q, "") == "":
                continue
            if not slots.get(q):
                return q
        return None

    def _validate_now_or_raise(slots: Dict[str,Any]):
        # Wildcards -> DNS-01 only (not supported here)
        if any(isinstance(d,str) and d.startswith("*.") for d in slots.get("domains", [])):
            raise HTTPException(400, "Wildcard domains require DNS-01; HTTP-01 only right now.")
        # FQDN sanity
        fq = re.compile(r"^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
        for d in slots.get("domains", []):
            if not isinstance(d,str) or not fq.match(d):
                raise HTTPException(400, f"Invalid domain: {d}")
        # provider custom needs directory_url
        if (slots.get("mode") or "").lower() != "renew":
            if slots.get("provider") == "custom" and not slots.get("directory_url"):
                raise HTTPException(400, "provider=custom requires directory_url")

    # ---------- Templates ----------
    @router.post("/templates/create")
    def templates_create(req: TemplateCreate):
        if req.provider == "custom" and not req.directory_url:
            raise HTTPException(400, "directory_url required for custom provider")
        tid = tdao.upsert(req.name, req.dict())
        return {"ok": True, "template_id": tid}

    @router.post("/templates/list")
    def templates_list():
        return {"items": tdao.list()}

    @router.post("/templates/get")
    def templates_get(name: str):
        t = tdao.get_by_name(name)
        if not t:
            raise HTTPException(404, "template not found")
        return t

    # ---------- Guided flow ----------
    @router.post("/guided/start")
    def guided_start(req: GuidedStart):
        slots = _normalize_slots(req.slots)
        # apply template defaults
        if req.template_name:
            t = tdao.get_by_name(req.template_name)
            if not t:
                raise HTTPException(404, "template not found")
            for k,v in t.items():
                if k in ("template_id","name","created_at","updated_at"): continue
                if slots.get(k) in (None,"",[],{}):
                    slots[k] = v
        slots["mode"] = req.mode
        _validate_now_or_raise(slots)
        pending = _first_missing(slots)
        sid = sdao.create(req.mode, None, slots)
        sdao.update(sid, slots, pending, "collecting" if pending else "ready")
        return {"session_id": sid, "next_question": pending, "slots": slots}

    @router.post("/guided/answer")
    def guided_answer(req: GuidedAnswer):
        sess = sdao.get(req.session_id)
        if not sess:
            raise HTTPException(404, "session not found")
        slots = _normalize_slots(sess["slots"])

        slots[req.question_id] = req.value
        _validate_now_or_raise(slots)

        vs_check = None
        if req.question_id == "virtual_server" and slots.get("bigip_host") and slots.get("virtual_server"):
            b = BigIP(slots["bigip_host"], _BIGIP_USER, _BIGIP_PASS)
            vs_path = slots["virtual_server"]
            try:
                obj = b._get(f"/mgmt/tm/ltm/virtual/{vs_path.replace('/','~')}")
                profs = []
                for it in obj.get("profilesReference",{}).get("items",[]):
                    if it.get("context")=="clientside" and "client-ssl" in it.get("fullPath",""):
                        profs.append(it["fullPath"])
                vs_check = {"exists": True, "clientssl_profiles": profs}
            except Exception:
                vs_check = {"exists": False, "clientssl_profiles": []}

        pending = _first_missing(slots)
        sdao.update(req.session_id, slots, pending, "collecting" if pending else "ready")
        return {"session_id": req.session_id, "next_question": pending, "slots": slots,
                "virtual_server_check": vs_check}

    @router.post("/guided/commit")
    def guided_commit(req: GuidedCommit):
        """
        Commit Issue/Renew and deploy.
        - Honors provider/directory_url and eab_secret from GUI for both paths.
        - On ACME rate limit → HTTP 429 (friendly).
        - On EAB required → HTTP 400 (friendly, with instructions).
        """
        sess = sdao.get(req.session_id)
        if not sess:
            raise HTTPException(404, "session not found")
        slots = _normalize_slots(sess["slots"])

        missing = _first_missing(slots)
        if missing:
            raise HTTPException(400, f"not ready—missing field: {missing}")
        _validate_now_or_raise(slots)

        # If VS provided, optionally replace existing client-ssl profiles
        if slots.get("virtual_server"):
            b = BigIP(slots["bigip_host"], _BIGIP_USER, _BIGIP_PASS)
            vs_path = slots["virtual_server"]
            try:
                obj = b._get(f"/mgmt/tm/ltm/virtual/{vs_path.replace('/','~')}")
            except Exception:
                raise HTTPException(400, f"virtual server not found: {vs_path}")
            if req.replace_existing_clientssl:
                existing = []
                for it in obj.get("profilesReference",{}).get("items",[]):
                    if it.get("context")=="clientside" and "client-ssl" in it.get("fullPath",""):
                        existing.append(it["fullPath"])
                if existing:
                    delset = " ".join(existing)
                    b._post("/mgmt/tm/util/bash", {
                        "command":"run",
                        "utilCmdArgs": f"-c 'tmsh modify ltm virtual {vs_path} profiles delete {{ {delset} }}'"
                    })

        mode = (slots.get("mode") or "").lower()
        res_issue_or_renew = None

        try:
            if mode == "issue":
                res_issue_or_renew = orc.request_certificate({
                    "domains": slots["domains"],
                    "provider": slots.get("provider","lets-encrypt"),
                    "directory_url": slots.get("directory_url"),
                    "eab_secret": slots.get("eab_secret"),                 # NEW: pass EAB to issue
                    "challenge_type": "HTTP-01",
                    "contact_emails": slots.get("contact_emails",[]),
                    "key_type": slots.get("key_type","EC256"),
                    "tags": slots.get("tags",[]),
                    "bigip_host": slots.get("bigip_host"),
                    "bigip_partition": slots.get("bigip_partition","/Common"),
                    "clientssl_profile": slots.get("clientssl_profile"),
                    "sni_name": slots["domains"][0],
                    "key_secret_path": slots["key_secret_path"]
                })
                cert_id = res_issue_or_renew["cert_id"]
            else:
                # renew → find cert_id by domain if not supplied
                cert_id = slots.get("cert_id")
                if not cert_id:
                    inv = orc.inv
                    items = inv.search(slots["domains"][0], 9999, None)
                    if not items:
                        raise HTTPException(404, "no existing cert found to renew")
                    cert_id = items[0]["cert_id"]
                res_issue_or_renew = orc.renew_certificate(
                    cert_id,
                    bigip_host=slots.get("bigip_host"),
                    partition=slots.get("bigip_partition","/Common"),
                    dg_name="acme_challenge_dg",
                    provider=slots.get("provider"),
                    directory_url=slots.get("directory_url"),
                    account_emails=slots.get("contact_emails", []),
                    eab_secret=slots.get("eab_secret"),                     # NEW: pass EAB to renew/migrate
                )

        except AcmeEabRequiredError as e:
            # Friendly 400 for UI: tell user to provide an EAB secret (kid/hmac_key) for this provider
            return JSONResponse(
                status_code=400,
                content={
                    "status": "error",
                    "reason": "acme_eab_required",
                    "message": (
                        "This ACME provider requires External Account Binding (EAB) to register a new account. "
                        "Please supply an EAB secret (Vault path containing {\"kid\",\"hmac_key\"}) and try again."
                    ),
                    "directory_url": e.directory_url,
                    "fields_needed": ["eab_secret"],  # UI can highlight this
                    "action_suggestion": "Store {kid,hmac_key} in Vault (KV v2) and put its path in 'EAB Secret'."
                },
            )
        except AcmeRateLimitError as e:
            # Friendly 429 for the UI transcript (provider-agnostic)
            return JSONResponse(
                status_code=429,
                content={
                    "status": "error",
                    "reason": "acme_rate_limited",
                    "message": (
                        "ACME provider rate limit reached for this exact domain set."
                        + (f" You can try again after {e.next_retry_iso}." if e.next_retry_iso else " Please try again later.")
                    ),
                    "retry_after": e.next_retry_iso,
                    "directory_url": e.directory_url,
                    "action_suggestion": "Use the provider's staging directory for tests, or retry later."
                },
            )

        # Deploy (create/update per-host profile, optionally attach to VS)
        deploy_res = orc.deploy_to_bigip(
            cert_id=cert_id,
            host=slots["bigip_host"],
            partition=slots.get("bigip_partition","/Common"),
            clientssl=slots.get("clientssl_profile"),
            sni_name=slots["domains"][0],
            create_profile=True,
            virtual_server=slots.get("virtual_server")
        )

        sdao.update(req.session_id, slots, None, "done")
        return {"result": "ok", "cert": res_issue_or_renew, "deploy": deploy_res}

    # ---------- VS existence helper ----------
    @router.post("/bigip/virtual_server/check")
    def vs_check(req: VSCheck):
        b = BigIP(req.bigip_host, _BIGIP_USER, _BIGIP_PASS)
        try:
            obj = b._get(f"/mgmt/tm/ltm/virtual/{req.virtual_server.replace('/','~')}")
            profs = []
            for it in obj.get("profilesReference",{}).get("items",[]):
                if it.get("context")=="clientside" and "client-ssl" in it.get("fullPath",""):
                    profs.append(it["fullPath"])
            return {"exists": True, "clientssl_profiles": profs}
        except Exception:
            return {"exists": False, "clientssl_profiles": []}

    return router
