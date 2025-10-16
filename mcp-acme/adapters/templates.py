# mcp-acme/adapters/templates.py
import uuid
import psycopg2, psycopg2.extras
from typing import Optional, Dict, Any, List

DDL = """
CREATE TABLE IF NOT EXISTS acme_templates (
  template_id       uuid PRIMARY KEY,
  name              text UNIQUE NOT NULL,
  provider          text NOT NULL,
  directory_url     text,
  challenge_type    text NOT NULL DEFAULT 'HTTP-01',
  contact_emails    text[] NOT NULL DEFAULT '{}',
  key_type          text NOT NULL DEFAULT 'EC256',
  bigip_host        text,
  bigip_partition   text NOT NULL DEFAULT '/Common',
  clientssl_profile text,
  virtual_server    text,
  key_secret_path   text,
  eab_secret        text,
  tags              text[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
"""

class TemplatesDAO:
    def __init__(self, dsn: str):
        self.dsn = dsn
        with psycopg2.connect(dsn) as c, c.cursor() as cur:
            cur.execute(DDL); c.commit()

    def _conn(self):
        return psycopg2.connect(self.dsn)

    def upsert(self, name: str, payload: Dict[str, Any]) -> str:
        tid = payload.get("template_id") or str(uuid.uuid4())
        cols = ["template_id","name","provider","directory_url","challenge_type","contact_emails",
                "key_type","bigip_host","bigip_partition","clientssl_profile","virtual_server",
                "key_secret_path","eab_secret","tags"]
        vals = {k: payload.get(k) for k in cols}
        vals["template_id"] = tid
        vals["name"] = name
        if not vals.get("provider"):
            raise ValueError("provider is required")
        with self._conn() as c, c.cursor() as cur:
            cur.execute("""
INSERT INTO acme_templates ({cols})
VALUES ({place})
ON CONFLICT (name) DO UPDATE SET
  provider=EXCLUDED.provider,
  directory_url=EXCLUDED.directory_url,
  challenge_type=EXCLUDED.challenge_type,
  contact_emails=EXCLUDED.contact_emails,
  key_type=EXCLUDED.key_type,
  bigip_host=EXCLUDED.bigip_host,
  bigip_partition=EXCLUDED.bigip_partition,
  clientssl_profile=EXCLUDED.clientssl_profile,
  virtual_server=EXCLUDED.virtual_server,
  key_secret_path=EXCLUDED.key_secret_path,
  eab_secret=EXCLUDED.eab_secret,
  tags=EXCLUDED.tags,
  updated_at=now()
RETURNING template_id
""".format(
    cols=",".join(cols),
    place=",".join(["%({})s".format(k) for k in cols])
), vals)
            tid = cur.fetchone()[0]; c.commit()
        return str(tid)

    def list(self) -> List[Dict[str, Any]]:
        with self._conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT name, provider, challenge_type, bigip_host, bigip_partition, clientssl_profile, virtual_server, key_type, contact_emails, tags FROM acme_templates ORDER BY name ASC")
            return [dict(r) for r in cur.fetchall()]

    def get_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        with self._conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM acme_templates WHERE name=%s", (name,))
            r = cur.fetchone()
            return dict(r) if r else None
