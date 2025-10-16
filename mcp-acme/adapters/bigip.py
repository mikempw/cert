import requests
from urllib.parse import quote

class BigIP:
    """
    iControl REST adapter:
      - Chunked uploads to /mgmt/shared/file-transfer/uploads/<name>
      - Install ssl-key / ssl-cert from /var/config/rest/downloads/<name>
      - Create/update client-ssl profiles
      - Attach certs to client-ssl profiles
      - Attach client-ssl profiles to Virtual Servers (clientside)
      - Manage ACME HTTP-01 token datagroup
    """
    def __init__(self, host: str, user: str, password: str):
        self.host = host
        self.user = user
        self.password = password
        self.base = f"https://{host}"
        self.s = requests.Session()
        self.s.verify = False
        self.s.auth = (user, password)

    # ---------- HTTP helpers ----------
    def _u(self, p: str) -> str:
        return f"{self.base}{p}"

    def _get(self, p: str):
        r = self.s.get(self._u(p))
        r.raise_for_status()
        return r.json()

    def _post(self, p: str, body: dict):
        r = self.s.post(self._u(p), json=body)
        r.raise_for_status()
        return r.json() if r.text else {}

    def _patch(self, p: str, body: dict):
        r = self.s.patch(self._u(p), json=body)
        r.raise_for_status()
        return r.json() if r.text else {}

    # ---------- Chunked upload (required by BIG-IP) ----------
    def _upload_octets(self, name: str, content: bytes, chunk_size: int = 1024 * 1024) -> str:
        """
        Upload bytes to /mgmt/shared/file-transfer/uploads/<name> in chunks.
        BIG-IP expects Content-Range WITHOUT the 'bytes ' prefix: 'start-end/total', end inclusive.
        Returns absolute path under /var/config/rest/downloads/<name>.
        """
        total = len(content)
        if total == 0:
            raise ValueError("empty content for upload")

        enc_name = quote(name, safe="")
        url = self._u(f"/mgmt/shared/file-transfer/uploads/{enc_name}")

        offset = 0
        while offset < total:
            end = min(offset + chunk_size, total)
            chunk = content[offset:end]
            headers = {
                "Content-Type": "application/octet-stream",
                "Content-Range": f"{offset}-{end - 1}/{total}",
                "Content-Length": str(len(chunk)),
            }
            r = self.s.post(url, data=chunk, headers=headers)
            if r.status_code not in (200, 201):
                raise requests.HTTPError(f"Upload failed {r.status_code}: {r.text}", response=r)
            offset = end

        return f"/var/config/rest/downloads/{name}"

    # ---------- SSL object installs ----------
    def _install_key(self, partition: str, name: str, source: str):
        payload = {"name": name, "partition": partition.strip("/"), "source-path": f"file:{source}"}
        self._post("/mgmt/tm/sys/file/ssl-key", payload)

    def _install_cert(self, partition: str, name: str, source: str):
        payload = {"name": name, "partition": partition.strip("/"), "source-path": f"file:{source}"}
        self._post("/mgmt/tm/sys/file/ssl-cert", payload)

    def upload_and_install(self, partition: str, keyname: str, key_pem: str,
                           certname: str, cert_pem: str, chainname: str, chain_pem: str):
        keysrc   = self._upload_octets(keyname,  key_pem.encode("utf-8"))
        certsrc  = self._upload_octets(certname, cert_pem.encode("utf-8"))
        chainsrc = self._upload_octets(chainname, chain_pem.encode("utf-8"))
        self._install_key(partition, keyname, keysrc)
        self._install_cert(partition, certname, certsrc)
        self._install_cert(partition, chainname, chainsrc)

    # ---------- Client-SSL profile management ----------
    def ensure_clientssl_profile(self, partition: str, name: str, defaults_from: str = "/Common/clientssl"):
        """
        Ensure a client-ssl profile exists at /<partition>/<name>. Creates it if missing.
        Returns the full path (/Partition/Name).
        """
        prof = f"/{partition.strip('/')}/{name}"
        path = f"/mgmt/tm/ltm/profile/client-ssl/{prof.replace('/','~')}"
        try:
            self._get(path)  # exists
            return prof
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                body = {"name": name, "partition": partition.strip("/"), "defaultsFrom": defaults_from}
                self._post("/mgmt/tm/ltm/profile/client-ssl", body)
                return prof
            raise

    def attach_to_clientssl(self, partition: str, profile: str,
                            keyname: str, certname: str, chainname: str, sni_name: str | None):
        """
        Attach key/cert/chain to an existing client-ssl profile.
        Uses REST, with fallback to tmsh for quirky versions.
        """
        import requests as _rq

        prof = profile if profile.startswith("/") else f"{partition}/{profile}"
        path = f"/mgmt/tm/ltm/profile/client-ssl/{prof.replace('/','~')}"

        part = f"/{partition.strip('/')}"
        key_fq   = f"{part}/{keyname}"
        cert_fq  = f"{part}/{certname}"
        chain_fq = f"{part}/{chainname}"

        payload = {"certKeyChain": [{"name": "default", "key": key_fq, "cert": cert_fq, "chain": chain_fq}]}

        try:
            self._patch(path, payload)
            return
        except _rq.HTTPError:
            cmd = (
                "tmsh modify ltm profile client-ssl "
                f"{prof} cert-key-chain replace-all-with "
                f"{{ default {{ key {key_fq} cert {cert_fq} chain {chain_fq} }} }}"
            )
            self._post("/mgmt/tm/util/bash", {"command": "run", "utilCmdArgs": f"-c '{cmd}'"})

    def attach_profile_to_virtual(self, virtual_fullpath: str, profile_fullpath: str):
        """
        Add a client-ssl profile to a Virtual Server (clientside) via tmsh.
        """
        cmd = (
            "tmsh modify ltm virtual {vs} profiles add {{ {prof} {{ context clientside }} }}".format(
                vs=virtual_fullpath, prof=profile_fullpath
            )
        )
        self._post("/mgmt/tm/util/bash", {"command": "run", "utilCmdArgs": f"-c '{cmd}'"})

    # ---------- ACME HTTP-01 token datagroup ----------
    def _dg_path(self, partition: str, name: str) -> str:
        return f"/mgmt/tm/ltm/data-group/internal/~{partition.strip('/') }~{name}"

    def ensure_string_dg(self, partition: str, name: str):
        try:
            self._get(self._dg_path(partition, name))
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                payload = {"name": name, "partition": partition.strip("/"), "type": "string", "records": []}
                self._post("/mgmt/tm/ltm/data-group/internal", payload)
            else:
                raise

    def read_dg_records(self, partition: str, name: str) -> list[dict]:
        obj = self._get(self._dg_path(partition, name))
        return obj.get("records", []) or []

    def write_dg_records(self, partition: str, name: str, records: list[dict]):
        self._patch(self._dg_path(partition, name), {"records": records})

    def upsert_http01_records(self, partition: str, name: str, token_to_keyauth: dict[str, str]) -> int:
        self.ensure_string_dg(partition, name)
        existing = {r["name"]: r.get("data", "") for r in self.read_dg_records(partition, name)}
        changed = False
        for tok, ka in token_to_keyauth.items():
            if existing.get(tok) != ka:
                existing[tok] = ka
                changed = True
        if changed:
            new_records = [{"name": k, "data": v} for k, v in sorted(existing.items())]
            self.write_dg_records(partition, name, new_records)
        return len(token_to_keyauth)

    def delete_http01_tokens(self, partition: str, name: str, tokens: list[str]) -> int:
        self.ensure_string_dg(partition, name)
        cur = {r["name"]: r.get("data","") for r in self.read_dg_records(partition, name)}
        changed = False
        for t in tokens:
            if t in cur:
                del cur[t]
                changed = True
        if changed:
            new_records = [{"name": k, "data": v} for k, v in sorted(cur.items())]
            self.write_dg_records(partition, name, new_records)
        return len(tokens)
