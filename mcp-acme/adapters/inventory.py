import json, psycopg2, psycopg2.extras
from datetime import datetime, timedelta

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS certs(
  cert_id TEXT PRIMARY KEY,
  main_domain TEXT NOT NULL,
  san JSONB NOT NULL,
  provider TEXT NOT NULL,
  directory_url TEXT NOT NULL,
  not_before TEXT,
  not_after TEXT,
  path TEXT NOT NULL,
  key_secret_path TEXT,
  tags JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  deployed JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

class Inventory:
    def __init__(self, dsn: str):
        self.dsn = dsn
        self._init()

    def _conn(self): return psycopg2.connect(self.dsn)

    def _init(self):
        with self._conn() as c, c.cursor() as cur:
            cur.execute(SCHEMA_SQL); c.commit()

    def create(self, **kw):
        kw.setdefault("tags",[])
        kw.setdefault("status","pending")
        with self._conn() as c, c.cursor() as cur:
            cur.execute("""
INSERT INTO certs(cert_id, main_domain, san, provider, directory_url, not_before, not_after, path, tags, status, key_secret_path)
VALUES (%(cert_id)s, %(main_domain)s, %(san_json)s, %(provider)s, %(directory_url)s, %(not_before)s, %(not_after)s, %(path)s, %(tags_json)s, %(status)s, %(key_secret_path)s)
""", {
    "cert_id": kw["cert_id"],
    "main_domain": kw["main_domain"],
    "san_json": json.dumps(kw["san"]),
    "provider": kw["provider"],
    "directory_url": kw["directory_url"],
    "not_before": kw.get("not_before"),
    "not_after": kw.get("not_after"),
    "path": kw["path"],
    "tags_json": json.dumps(kw["tags"]),
    "status": kw.get("status","pending"),
    "key_secret_path": kw.get("key_secret_path")
})
            c.commit()

    def get(self, cert_id: str):
        with self._conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM certs WHERE cert_id=%s", (cert_id,))
            row = cur.fetchone()
            if not row: return None
            row["san"] = row["san"]
            row["tags"] = row["tags"]
            return row

    def update_dates(self, cert_id: str, nb: str, na: str):
        with self._conn() as c, c.cursor() as cur:
            cur.execute("UPDATE certs SET not_before=%s, not_after=%s, updated_at=NOW() WHERE cert_id=%s", (nb, na, cert_id))
            c.commit()

    def update_status(self, cert_id: str, status: str):
        with self._conn() as c, c.cursor() as cur:
            cur.execute("UPDATE certs SET status=%s, updated_at=NOW() WHERE cert_id=%s", (status, cert_id))
            c.commit()

    def store_challenges(self, cert_id: str, challenges: list[dict]):
        with self._conn() as c, c.cursor() as cur:
            cur.execute("UPDATE certs SET deployed = COALESCE(deployed,'{}'::jsonb) || %s::jsonb, updated_at=NOW() WHERE cert_id=%s",
                        (json.dumps({"http01_challenges":challenges}), cert_id))
            c.commit()

    def mark_deployed(self, cert_id: str, host: str, partition: str, profile: str, sni: str|None):
        with self._conn() as c, c.cursor() as cur:
            cur.execute("UPDATE certs SET deployed = COALESCE(deployed,'{}'::jsonb) || %s::jsonb, status='deployed', updated_at=NOW() WHERE cert_id=%s",
                        (json.dumps({"bigip":{"host":host,"partition":partition,"profile":profile,"sni":sni}}), cert_id))
            c.commit()

    def search(self, query: str|None, expiring_within_days: int, tag: str|None):
        cond="TRUE"; args=[]
        if query:
            cond+=" AND (main_domain ILIKE %s)"; args.append(f"%{query}%")
        if tag:
            cond+=" AND (tags::text ILIKE %s)"; args.append(f"%{tag}%")
        items=[]
        with self._conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f"SELECT * FROM certs WHERE {cond}", args)
            for r in cur.fetchall():
                # basic filter by exp window
                if r["not_after"]:
                    # naive compare
                    items.append({
                      "cert_id": r["cert_id"], "san": r["san"], "provider": r["provider"],
                      "not_after": r["not_after"], "status": r["status"], "tags": r["tags"]
                    })
        return items
