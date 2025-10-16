# mcp-acme/adapters/sessions.py
import uuid, json
import psycopg2, psycopg2.extras
from typing import Optional, Dict, Any

DDL = """
CREATE TABLE IF NOT EXISTS guided_sessions (
  session_id        uuid PRIMARY KEY,
  mode              text NOT NULL,
  template_id       uuid,
  slots             jsonb NOT NULL DEFAULT '{}'::jsonb,
  pending_question  text,
  status            text NOT NULL DEFAULT 'collecting',
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
"""

class SessionsDAO:
    def __init__(self, dsn: str):
        self.dsn = dsn
        with psycopg2.connect(dsn) as c, c.cursor() as cur:
            cur.execute(DDL); c.commit()

    def _conn(self):
        return psycopg2.connect(self.dsn)

    def create(self, mode: str, template_id: str|None, slots: Dict[str,Any]) -> str:
        sid = str(uuid.uuid4())
        with self._conn() as c, c.cursor() as cur:
            cur.execute("""INSERT INTO guided_sessions(session_id, mode, template_id, slots, pending_question, status)
                           VALUES(%s,%s,%s,%s,%s,%s)""",
                        (sid, mode, template_id, json.dumps(slots), None, 'collecting'))
            c.commit()
        return sid

    def get(self, session_id: str) -> Optional[Dict[str,Any]]:
        with self._conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM guided_sessions WHERE session_id=%s", (session_id,))
            r = cur.fetchone()
            return dict(r) if r else None

    def update(self, session_id: str, slots: Dict[str,Any], pending_question: str|None, status: str):
        with self._conn() as c, c.cursor() as cur:
            cur.execute("""UPDATE guided_sessions
                           SET slots=%s, pending_question=%s, status=%s, updated_at=now()
                           WHERE session_id=%s""",
                        (json.dumps(slots), pending_question, status, session_id))
            c.commit()

    def set_error(self, session_id: str, msg: str):
        with self._conn() as c, c.cursor() as cur:
            cur.execute("""UPDATE guided_sessions
                           SET status='error', last_error=%s, updated_at=now()
                           WHERE session_id=%s""", (msg, session_id))
            c.commit()
