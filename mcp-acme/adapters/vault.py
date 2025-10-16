# adapters/vault.py
import os
import requests

def _normalize_kv2(path: str) -> str:
    """
    Normalize user-provided KVv2 paths so that:
      input: "tls/mpwlabs.com"                  -> "tls/mpwlabs.com"
      input: "/secret/data/tls/mpwlabs.com"     -> "tls/mpwlabs.com"
      input: "v1/secret/data/tls/mpwlabs.com"   -> "tls/mpwlabs.com"
      input: "/v1/secret/data/tls/mpwlabs.com"  -> "tls/mpwlabs.com"
    """
    p = (path or "").strip().lstrip("/")
    # Strip optional v1/
    if p.startswith("v1/"):
        p = p[3:]
    # Strip "secret/data/" prefix if present
    if p.startswith("secret/data/"):
        p = p[len("secret/data/"):]
    return p

class Vault:
    """
    Simple Vault KV v2 adapter.

    Honors:
      - VAULT_ADDR   (e.g., http://vault:8200 or https://vault:8200)
      - VAULT_TOKEN
      - VAULT_CACERT (path to PEM bundle)  -> requests.verify = <path>
        (If unset, verify=True to use system CAs)
    """
    def __init__(self, base_url: str | None = None, token: str | None = None):
        self.base = base_url or os.getenv("VAULT_ADDR", "http://vault:8200")
        self.token = token or os.getenv("VAULT_TOKEN")
        cacert = os.getenv("VAULT_CACERT")
        self.verify = cacert if cacert else True
        self.sess = requests.Session()

    def _hdr(self):
        hdr = {"Content-Type": "application/json"}
        if self.token:
            hdr["X-Vault-Token"] = self.token
        return hdr

    def write(self, path: str, body: dict):
        # KV v2 write: POST /v1/secret/data/<path> with {"data": {...}}
        leaf = _normalize_kv2(path)
        url = f"{self.base}/v1/secret/data/{leaf}"
        try:
            r = self.sess.post(url, headers=self._hdr(), json={"data": body},
                               timeout=15, verify=self.verify)
            r.raise_for_status()
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Vault write failed to {url}: {e}") from e

    def read(self, path: str) -> dict:
        # KV v2 read:  GET /v1/secret/data/<path>
        leaf = _normalize_kv2(path)
        url = f"{self.base}/v1/secret/data/{leaf}"
        try:
            r = self.sess.get(url, headers=self._hdr(), timeout=15, verify=self.verify)
            r.raise_for_status()
            j = r.json()
            return (j.get("data") or {}).get("data") or {}
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Vault read failed from {url}: {e}") from e
