# mcp-acme/orchestrator.py
import os
import uuid
import shlex
import subprocess
import time
import threading
import re
from datetime import datetime
from adapters.inventory import Inventory
from adapters.vault import Vault
from adapters.bigip import BigIP

# Default ACME directory URLs (override via directory_url)
PROVIDERS = {
    "lets-encrypt": "https://acme-v02.api.letsencrypt.org/directory",
    "google":       "https://dv.acme-v02.api.pki.goog/directory",
    "zerossl":      "https://acme.zerossl.com/v2/DV90",
    "sectigo":      "custom",
    "digicert":     "custom",
}

class AcmeRateLimitError(RuntimeError):
    """Raised when the ACME provider rate-limits duplicate certificates for the same SAN set."""
    def __init__(self, next_retry_iso: str | None, directory_url: str | None, raw_out: str, raw_err: str):
        super().__init__("ACME_RATE_LIMIT")
        self.next_retry_iso = next_retry_iso
        self.directory_url = directory_url
        self.raw_out = raw_out
        self.raw_err = raw_err

class AcmeEabRequiredError(RuntimeError):
    """Raised when the ACME provider requires External Account Binding (EAB) for account registration."""
    def __init__(self, directory_url: str | None, raw_out: str, raw_err: str):
        super().__init__("ACME_EAB_REQUIRED")
        self.directory_url = directory_url
        self.raw_out = raw_out
        self.raw_err = raw_err

def _extract_retry_after_iso(acme_out_err_text: str) -> str | None:
    m = re.search(r"retry after\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}:[0-9]{2})\s+UTC", acme_out_err_text, re.I)
    if not m:
        return None
    ts = m.group(1)
    try:
        dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None

class Orchestrator:
    def __init__(self, inv: Inventory, vault: Vault, bigip: BigIP,
                 allow_key_export: bool = False, default_key_type: str = "EC256"):
        self.inv = inv
        self.vault = vault
        self.bigip = bigip
        self.allow_key_export = allow_key_export
        self.default_key_type = default_key_type
        self.acme_sh = "/usr/local/bin/acme.sh"
        self.work = "/work"
        self.acme_home = os.getenv("ACME_HOME", "/opt/acme")
        self.acme_debug = os.getenv("ACME_DEBUG", "0")

    # ------------------ subprocess helpers ------------------
    def _acme(self, *args: str) -> list[str]:
        argv = [self.acme_sh, "--home", self.acme_home, *args]
        if str(self.acme_debug).lower() in ("1", "true", "yes"):
            argv += ["--debug", "2"]
        return argv

    def _dir_for(self, cert_id: str) -> str:
        return f"{self.work}/{cert_id}"

    # ------------------ ISSUE (watcher-first + wait/preflight + provider switch + EAB + rate-limit) ------------------
    def request_certificate(self, p: dict):
        cert_id = str(uuid.uuid4())

        domains = p.get("domains") or []
        if not domains:
            raise ValueError("At least one domain is required")

        provider = p.get("provider", "lets-encrypt")
        directory = p.get("directory_url") or PROVIDERS.get(provider, "custom")
        if directory == "custom" and not p.get("directory_url"):
            raise ValueError("Custom provider requires directory_url")
        directory_url = directory if directory != "custom" else p["directory_url"]

        key_type = p.get("key_type") or self.default_key_type
        eab_secret = p.get("eab_secret")
        contact = p.get("contact_emails", [])
        tags = p.get("tags", [])
        key_secret_path = p.get("key_secret_path")
        if not key_secret_path:
            raise ValueError("key_secret_path (Vault KV v2) is required")

        bigip_host = p.get("bigip_host")
        bigip_partition = p.get("bigip_partition", "/Common")
        datagroup_name = p.get("datagroup_name", "acme_challenge_dg")

        wdir = self._dir_for(cert_id)
        os.makedirs(wdir, exist_ok=True)
        main = domains[0]

        key_type_map = {"EC256": "ec-256", "EC384": "ec-384",
                        "RSA2048": "2048", "RSA3072": "3072", "RSA4096": "4096"}
        acme_keylen = key_type_map.get(key_type, "ec-256")

        webroot = f"{wdir}/webroot"
        os.makedirs(webroot, exist_ok=True)

        # Build acme.sh --issue (pair each -d with -w <webroot>, pass server + account emails + EAB if provided)
        base_issue = ["--issue", "--server", directory_url, "--keylength", acme_keylen]
        cmd_issue = self._acme(*base_issue)
        for d in domains:
            cmd_issue += ["-d", d, "-w", webroot]
        for email in contact:
            cmd_issue += ["--accountemail", email]
        if eab_secret:
            eab_data = self.vault.read(eab_secret)  # expects {"kid":"...","hmac_key":"..."}
            kid = (eab_data or {}).get("kid"); hmk = (eab_data or {}).get("hmac_key")
            if not (kid and hmk):
                raise ValueError("EAB secret missing kid/hmac_key fields")
            cmd_issue += ["--eab-kid", kid, "--eab-hmac-key", hmk]

        # Watcher first → token publish to BIG-IP
        if bigip_host:
            watcher = threading.Thread(
                target=self._auto_publish_tokens_from_webroot,
                kwargs=dict(webroot=webroot, bigip_host=bigip_host,
                            partition=bigip_partition, dg_name=datagroup_name,
                            timeout_sec=120, poll_every=0.05),
                daemon=True
            )
            watcher.start()

        # --- Attempt #1: normal issue
        proc, cmd_for_log = _run_bg(cmd_issue)
        had_files, rc0, out0, err0 = _wait_for_challenge_files_or_proc(
            proc, webroot, timeout_sec=120, interval=0.1, finish_on_exit=True
        )

        def _raise_for_known_errors(txt: str):
            if ("acme:error:rateLimited" in txt) or ("too many certificates" in txt):
                raise AcmeRateLimitError(_extract_retry_after_iso(txt), directory_url, out0 or "", err0 or "")
            if "externalAccountRequired" in txt:
                raise AcmeEabRequiredError(directory_url, out0 or "", err0 or "")

        if not had_files:
            # Success without new challenges? (reused validation)
            if rc0 == 0 and _acme_likely_succeeded(out0):
                pass
            else:
                txt = (err0 or "") + (out0 or "")
                _raise_for_known_errors(txt)
                # Cert exists/skip → force-issue with selected provider (and EAB if provided)
                if "Skipping. Next renewal time is:" in (out0 or "") or "Domains not changed." in (out0 or ""):
                    force_issue = self._acme(*base_issue, "--force")
                    for d in domains:
                        force_issue += ["-d", d, "-w", webroot]
                    for email in contact:
                        force_issue += ["--accountemail", email]
                    if eab_secret:
                        force_issue += ["--eab-kid", kid, "--eab-hmac-key", hmk]
                    proc2, cmd2 = _run_bg(force_issue)
                    had_files2, rc1, out1, err1 = _wait_for_challenge_files_or_proc(
                        proc2, webroot, timeout_sec=120, interval=0.1, finish_on_exit=True
                    )
                    if not had_files2 and not (rc1 == 0 and _acme_likely_succeeded(out1)):
                        txt2 = (err1 or "") + (out1 or "")
                        if ("acme:error:rateLimited" in txt2) or ("too many certificates" in txt2):
                            raise AcmeRateLimitError(_extract_retry_after_iso(txt2), directory_url, out1 or "", err1 or "")
                        if "externalAccountRequired" in txt2:
                            raise AcmeEabRequiredError(directory_url, out1 or "", err1 or "")
                        raise RuntimeError(
                            "acme.sh force-issue did not produce HTTP-01 files and did not succeed.\n"
                            f"--- stdout ---\n{out1}\n--- stderr ---\n{err1}"
                        )
                    # Preflight token(s) if present
                    if had_files2 and bigip_host:
                        for ch in _collect_http01_challenges(webroot):
                            tok = ch["path"].rsplit("/", 1)[-1]
                            ka  = ch["keyAuthorization"]
                            _wait_public_token(domains[0], tok, ka, timeout_sec=45, interval=0.5)
                    rc2, out2, err2 = _finish(proc2)
                    if rc2 != 0:
                        txt2 = (err2 or "") + (out2 or "")
                        if ("acme:error:rateLimited" in txt2) or ("too many certificates" in txt2):
                            raise AcmeRateLimitError(_extract_retry_after_iso(txt2), directory_url, out2 or "", err2 or "")
                        if "externalAccountRequired" in txt2:
                            raise AcmeEabRequiredError(directory_url, out2 or "", err2 or "")
                        raise RuntimeError(f"acme.sh force-issue failed:\n{cmd2}\n--- stdout ---\n{out2}\n--- stderr ---\n{err2}")
                else:
                    # Hard failure (not rate-limit, not skip)
                    raise RuntimeError(
                        "acme.sh produced no HTTP-01 token files.\n"
                        f"Exit code: {rc0}\n--- stdout ---\n{out0}\n--- stderr ---\n{err0}"
                    )
        else:
            # Preflight public URL(s) before allowing ACME to finish
            if bigip_host:
                for ch in _collect_http01_challenges(webroot):
                    tok = ch["path"].rsplit("/", 1)[-1]
                    ka  = ch["keyAuthorization"]
                    _wait_public_token(domains[0], tok, ka, timeout_sec=45, interval=0.5)
            rc2, out2, err2 = _finish(proc)
            if rc2 != 0:
                txt = (err2 or "") + (out2 or "")
                if ("acme:error:rateLimited" in txt) or ("too many certificates" in txt):
                    raise AcmeRateLimitError(_extract_retry_after_iso(txt), directory_url, out2 or "", err2 or "")
                if "externalAccountRequired" in txt:
                    raise AcmeEabRequiredError(directory_url, out2 or "", err2 or "")
                raise RuntimeError(
                    f"acme.sh cmd failed:\n{cmd_for_log}\n--- stdout ---\n{out2}\n--- stderr ---\n{err2}"
                )

        # Normalize/install outputs
        cert_pem = f"{wdir}/cert.pem"
        fullchain_pem = f"{wdir}/fullchain.pem"
        key_pem = f"{wdir}/privkey.pem"
        _run(self._acme("--install-cert", "-d", main,
                        "--key-file", key_pem,
                        "--fullchain-file", fullchain_pem,
                        "--cert-file", cert_pem))

        with open(key_pem, "r", encoding="utf-8") as f:
            key_text = f.read()
        self.vault.write(key_secret_path, {"private_key_pem": key_text})
        try:
            os.remove(key_pem)
        except Exception:
            pass

        not_before, not_after = _parse_dates(cert_pem)
        self.inv.create(
            cert_id=cert_id, main_domain=main, san=domains, provider=provider,
            directory_url=directory_url, not_before=not_before, not_after=not_after,
            path=wdir, tags=tags, status="issued", key_secret_path=key_secret_path,
        )

        challenges = _collect_http01_challenges(webroot)
        if challenges:
            self.inv.store_challenges(cert_id, [{"token": c["path"].rsplit("/",1)[-1],
                                                 "keyAuthorization": c["keyAuthorization"]} for c in challenges])

        return {
            "cert_id": cert_id,
            "status": "issued",
            "not_before": not_before,
            "not_after": not_after,
            "san": domains,
            "provider": provider,
            "directory_url": directory_url,
            "challenge": {"type": "HTTP-01", "http01_files": challenges},
        }

    # ------------------ RENEW (migrate CA if GUI changed provider, pass EAB if needed) ------------------
    def renew_certificate(self, cert_id: str, *, bigip_host: str | None = None,
                          partition: str = "/Common", dg_name: str = "acme_challenge_dg",
                          provider: str | None = None, directory_url: str | None = None,
                          account_emails: list[str] | None = None,
                          eab_secret: str | None = None):
        rec = self.inv.get(cert_id)
        if not rec:
            raise ValueError("Unknown cert_id")
        main = rec["main_domain"]
        san = rec.get("san") or [main]

        prev_dir = (rec.get("directory_url") or "").strip()
        if not directory_url:
            directory_url = prev_dir or PROVIDERS.get((provider or "lets-encrypt"), "custom")
            if directory_url == "custom":
                directory_url = prev_dir  # best effort

        migrate_ca = bool(directory_url and prev_dir and directory_url != prev_dir)

        webroot = os.path.join(rec["path"], "webroot")
        os.makedirs(webroot, exist_ok=True)

        if bigip_host:
            watcher = threading.Thread(
                target=self._auto_publish_tokens_from_webroot,
                kwargs=dict(webroot=webroot, bigip_host=bigip_host,
                            partition=partition, dg_name=dg_name,
                            timeout_sec=120, poll_every=0.05),
                daemon=True
            )
            watcher.start()

        # Build cmd (migrate via issue OR normal renew), always pass --server and emails; include EAB if provided
        eab_args = []
        if eab_secret:
            eab_data = self.vault.read(eab_secret)  # expects {"kid":"...","hmac_key":"..."}
            kid = (eab_data or {}).get("kid"); hmk = (eab_data or {}).get("hmac_key")
            if not (kid and hmk):
                raise ValueError("EAB secret missing kid/hmac_key fields")
            eab_args = ["--eab-kid", kid, "--eab-hmac-key", hmk]

        if migrate_ca:
            cmd = self._acme("--issue", "--server", directory_url, "--keylength", "ec-256", *eab_args)
            for d in san:
                cmd += ["-d", d, "-w", webroot]
        else:
            base = []
            if directory_url:
                base += ["--server", directory_url]
            base += ["--renew", "-d", main, "--force", "-w", webroot]
            cmd = self._acme(*base, *eab_args)

        for email in (account_emails or []):
            cmd += ["--accountemail", email]

        proc, cmd_for_log = _run_bg(cmd)

        # Wait for token files OR acme exit (collect logs on exit)
        had_files, rc0, out0, err0 = _wait_for_challenge_files_or_proc(
            proc, webroot, timeout_sec=120, interval=0.1, finish_on_exit=True
        )

        txt0 = (err0 or "") + (out0 or "")
        if "externalAccountRequired" in txt0:
            raise AcmeEabRequiredError(directory_url, out0 or "", err0 or "")

        if not had_files:
            if rc0 == 0 and _acme_likely_succeeded(out0):
                pass
            else:
                if ("acme:error:rateLimited" in txt0) or ("too many certificates" in txt0):
                    raise AcmeRateLimitError(_extract_retry_after_iso(txt0), directory_url, out0 or "", err0 or "")
                raise RuntimeError(
                    "acme.sh produced no HTTP-01 token files during renew.\n"
                    f"Exit code: {rc0}\n--- stdout ---\n{out0}\n--- stderr ---\n{err0}"
                )
        else:
            if bigip_host:
                for ch in _collect_http01_challenges(webroot):
                    tok = ch["path"].rsplit("/",1)[-1]
                    ka  = ch["keyAuthorization"]
                    _wait_public_token(main, tok, ka, timeout_sec=45, interval=0.5)

        rc, out, err = _finish(proc)
        txt = (err or "") + (out or "")
        if rc != 0:
            if ("acme:error:rateLimited" in txt) or ("too many certificates" in txt):
                raise AcmeRateLimitError(_extract_retry_after_iso(txt), directory_url, out or "", err or "")
            if "externalAccountRequired" in txt:
                raise AcmeEabRequiredError(directory_url, out or "", err or "")
            if "is not an issued domain" in txt:
                raise RuntimeError("ACME_NOT_MANAGED")
            raise RuntimeError(f"acme.sh cmd failed:\n{cmd_for_log}\n--- stdout ---\n{out}\n--- stderr ---\n{err}")

        # Normalize/install outputs
        cert_pem = f'{rec["path"]}/cert.pem'
        fullchain_pem = f'{rec["path"]}/fullchain.pem'
        _run(self._acme("--install-cert", "-d", main,
                        "--key-file", f'{rec["path"]}/privkey.pem',
                        "--fullchain-file", fullchain_pem,
                        "--cert-file", cert_pem))
        try:
            os.remove(f'{rec["path"]}/privkey.pem')
        except Exception:
            pass

        nb, na = _parse_dates(cert_pem)
        self.inv.update_dates(cert_id, nb, na)
        return {"cert_id": cert_id, "status": "issued", "not_after": na, "directory_url": directory_url}

    # ------------------ GET/REVOKE/LIST/DEPLOY ------------------
    def finalize_order(self, cert_id: str, wait_seconds: int = 60):
        rec = self.inv.get(cert_id)
        if not rec:
            raise ValueError("Unknown cert_id")
        if wait_seconds > 0:
            time.sleep(min(wait_seconds, 120))
        return {"cert_id": cert_id, "status": rec["status"],
                "not_before": rec["not_before"], "not_after": rec["not_after"]}

    def get_bundle(self, cert_id: str, include_key: bool = False):
        rec = self.inv.get(cert_id)
        if not rec:
            raise ValueError("Unknown cert_id")
        with open(f'{rec["path"]}/cert.pem', "r", encoding="utf-8") as f:
            cert_pem = f.read()
        with open(f'{rec["path"]}/fullchain.pem', "r", encoding="utf-8") as f:
            fullchain_pem = f.read()

        resp = {"cert_id": cert_id, "cert_pem": cert_pem, "chain_pem": fullchain_pem,
                "not_before": rec["not_before"], "not_after": rec["not_after"], "san": rec["san"]}
        if include_key:
            if not self.allow_key_export:
                raise PermissionError("Key export disabled by policy.")
            keyobj = self.vault.read(rec["key_secret_path"])
            resp["private_key_pem"] = keyobj.get("private_key_pem", "")
        return resp

    def revoke_certificate(self, cert_id: str, reason: str):
        rec = self.inv.get(cert_id)
        if not rec:
            raise ValueError("Unknown cert_id")
        _run(self._acme("--revoke", "-d", rec["main_domain"]))
        self.inv.update_status(cert_id, "revoked")
        return {"cert_id": cert_id, "status": "revoked"}

    def list_certificates(self, query: str | None, days: int, tag: str | None):
        return {"items": self.inv.search(query, days, tag)}

    def publish_http01_challenges(self, cert_id: str, challenges: list[dict],
                                  bigip_host: str, partition: str = "/Common",
                                  dg_name: str = "acme_challenge_dg"):
        if not challenges:
            raise ValueError("challenges array is empty")
        token_map = {}
        for ch in challenges:
            path = ch.get("path", ""); keyauth = ch.get("keyAuthorization", "")
            if path and keyauth:
                tok = path.rsplit("/", 1)[-1]
                token_map[tok] = keyauth
        if not token_map:
            raise ValueError("No valid token/keyAuthorization pairs found in challenges")
        b = BigIP(bigip_host, self.bigip.user, self.bigip.password)
        upserted = b.upsert_http01_records(partition, dg_name, token_map)
        self.inv.store_challenges(cert_id, [{"token": t, "keyAuthorization": v} for t, v in token_map.items()])
        return {"cert_id": cert_id, "bigip": bigip_host, "partition": partition, "datagroup": dg_name, "upserted": upserted}

    def deploy_to_bigip(self, cert_id: str, host: str, partition: str,
                        clientssl: str | None, sni_name: str | None,
                        create_profile: bool = True, virtual_server: str | None = None):
        rec = self.inv.get(cert_id)
        if not rec:
            raise ValueError("Unknown cert_id")

        with open(f'{rec["path"]}/cert.pem', "r", encoding="utf-8") as f:
            cert_pem = f.read()
        with open(f'{rec["path"]}/fullchain.pem', "r", encoding="utf-8") as f:
            full_pem = f.read()
        keyobj = self.vault.read(rec["key_secret_path"]); key_pem = keyobj.get("private_key_pem")
        if not key_pem:
            raise ValueError(f"Private key not found in Vault at {rec['key_secret_path']}")

        b = BigIP(host, self.bigip.user, self.bigip.password)

        namesafe = rec["main_domain"].replace("*", "wildcard").replace(".", "_")
        base = f"{namesafe}_{cert_id[:8]}"
        keyname, certname, chainname = f"{base}.key", f"{base}.crt", f"{base}_chain.crt"

        b.upload_and_install(partition, keyname, key_pem, certname, cert_pem, chainname, full_pem)

        if not clientssl:
            clientssl = f"clientssl_{namesafe}"

        prof_full = f"/{partition.strip('/')}/{clientssl}"
        if create_profile:
            prof_full = b.ensure_clientssl_profile(partition, clientssl, defaults_from="/Common/clientssl")

        b.attach_to_clientssl(partition, clientssl, keyname, certname, chainname, sni_name)

        if virtual_server:
            b.attach_profile_to_virtual(virtual_server, prof_full)

        self.inv.mark_deployed(cert_id, host, partition, clientssl, sni_name)
        return {"cert_id": cert_id, "bigip": host, "profile": prof_full, "sni": sni_name, "attached_to_vs": virtual_server or None}

    # ------------------ internals ------------------
    def _auto_publish_tokens_from_webroot(self, webroot: str, bigip_host: str,
                                          partition: str, dg_name: str,
                                          timeout_sec: int = 120, poll_every: float = 0.05) -> int:
        seen = set(); start = time.time(); published_total = 0
        b = BigIP(bigip_host, self.bigip.user, self.bigip.password)
        path = os.path.join(webroot, ".well-known", "acme-challenge")
        os.makedirs(path, exist_ok=True)
        while time.time() - start < timeout_sec:
            try:
                files = [f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))]
            except FileNotFoundError:
                files = []
            new_tokens = [f for f in files if f not in seen]
            if new_tokens:
                token_map = {}
                for tok in new_tokens:
                    with open(os.path.join(path, tok), "r", encoding="utf-8") as fh:
                        ka = fh.read().strip()
                    token_map[tok] = ka
                if token_map:
                    b.upsert_http01_records(partition, dg_name, token_map)
                    published_total += len(token_map)
                seen.update(new_tokens)
                time.sleep(0.1)
            time.sleep(poll_every)
        return published_total

# ------------------ module-level helpers ------------------
def _run(args):
    if isinstance(args, list):
        p = subprocess.run(args, capture_output=True, text=True, shell=False)
        cmd = " ".join(shlex.quote(a) for a in args)
    else:
        p = subprocess.run(args, capture_output=True, text=True, shell=True)
        cmd = args
    if p.returncode != 0:
        raise RuntimeError(f"acme.sh cmd failed:\n{cmd}\n--- stdout ---\n{p.stdout}\n--- stderr ---\n{p.stderr}")
    return p.stdout

def _run_bg(args):
    if not isinstance(args, list):
        raise ValueError("Background run requires argv list")
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    cmd_for_log = " ".join(shlex.quote(a) for a in args)
    return proc, cmd_for_log

def _finish(proc: subprocess.Popen):
    out, err = proc.communicate()
    return proc.returncode, out or "", err or ""

def _parse_dates(cert_path: str):
    out = _run(['openssl', 'x509', '-in', cert_path, '-noout', '-dates'])
    nb, na = None, None
    for line in out.splitlines():
        if line.startswith("notBefore="): nb = _to_iso(line.split("=", 1)[1].strip())
        if line.startswith("notAfter="):  na = _to_iso(line.split("=", 1)[1].strip())
    return nb, na

def _to_iso(openssl_dt: str):
    return datetime.strptime(openssl_dt, "%b %d %H:%M:%S %Y %Z").isoformat() + "Z"

def _collect_http01_challenges(webroot: str):
    root = os.path.join(webroot, ".well-known", "acme-challenge")
    results = []
    if not os.path.isdir(root): return results
    for f in os.listdir(root):
        p = os.path.join(root, f)
        if os.path.isfile(p):
            try:
                content = open(p, "r", encoding="utf-8").read().strip()
                results.append({"path": f"/.well-known/acme-challenge/{f}", "keyAuthorization": content})
            except Exception:
                pass
    return results

def _wait_for_challenge_files_or_proc(proc: subprocess.Popen, webroot: str,
                                      timeout_sec: int = 120, interval: float = 0.1,
                                      finish_on_exit: bool = False):
    """
    Returns (had_files: bool, exit_code, stdout, stderr).
    If acme.sh exits early and finish_on_exit=True, collects its stdout/stderr.
    """
    import time as _t, os as _os
    out_txt, err_txt, rc = "", "", None
    root = _os.path.join(webroot, ".well-known", "acme-challenge")
    deadline = _t.time() + timeout_sec
    while _t.time() < deadline:
        if _os.path.isdir(root):
            try:
                files = [f for f in _os.listdir(root) if _os.path.isfile(_os.path.join(root, f))]
                if files:
                    return True, rc if rc is not None else None, out_txt, err_txt
            except FileNotFoundError:
                pass
        if proc.poll() is not None:
            rc = proc.returncode
            if finish_on_exit:
                out_txt, err_txt = proc.communicate()
            return False, rc, out_txt, err_txt
        _t.sleep(interval)
    return False, rc if rc is not None else None, out_txt, err_txt

def _wait_public_token(hostname: str, token: str, expected: str,
                       timeout_sec: int = 45, interval: float = 0.5):
    """Poll http://<hostname>/.well-known/acme-challenge/<token> until body equals 'expected', or timeout."""
    import requests, time as _t
    url = f"http://{hostname}/.well-known/acme-challenge/{token}"
    deadline = _t.time() + timeout_sec
    while _t.time() < deadline:
        try:
            r = requests.get(url, timeout=3)
            if r.status_code == 200:
                last = (r.text or "").strip()
                if last == expected:
                    return
        except Exception:
            pass
        _t.sleep(interval)
    raise RuntimeError(f"Preflight failed: {url} did not return expected body within {timeout_sec}s")

def _acme_likely_succeeded(out: str | None) -> bool:
    if not out:
        return False
    needles = [
        "is already verified, skipping http-01.",
        "Verification finished, beginning signing.",
        "Downloading cert.",
        "Cert success.",
        "Installing cert to:",
        "Your cert is in:",
        "full-chain cert is in:",
    ]
    s = out or ""
    return any(n in s for n in needles)
