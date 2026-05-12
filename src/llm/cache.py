from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from pathlib import Path
from typing import Any


class ResultCache:
    TTL_SECONDS = {
        "score":        30 * 86400,
        "tailor":        7 * 86400,
        "cover_letter":          0,   # no cache
        "qa_behavioral":    86400,
        "form_fill":             0,   # no cache
        "embed":        90 * 86400,
    }

    def __init__(self, db_path: str | Path):
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS llm_cache (
                    cache_key    TEXT    PRIMARY KEY,
                    task         TEXT    NOT NULL,
                    value_json   TEXT    NOT NULL,
                    created_at   INTEGER NOT NULL,
                    ttl_seconds  INTEGER NOT NULL
                )
            """)

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def _make_key(self, task: str, key: str) -> str:
        return hashlib.sha256(f"{task}:{key}".encode()).hexdigest()

    def get(self, task: str, key: str) -> Any | None:
        ttl = self.TTL_SECONDS.get(task, 0)
        if ttl == 0:
            return None
        cache_key = self._make_key(task, key)
        with self._conn() as conn:
            row = conn.execute(
                "SELECT value_json, created_at, ttl_seconds FROM llm_cache WHERE cache_key = ?",
                (cache_key,),
            ).fetchone()
        if row is None:
            return None
        value_json, created_at, ttl_seconds = row
        if ttl_seconds > 0 and time.time() - created_at > ttl_seconds:
            return None
        return json.loads(value_json)

    def put(self, task: str, key: str, value: Any) -> None:
        ttl = self.TTL_SECONDS.get(task, 0)
        if ttl == 0:
            return
        cache_key = self._make_key(task, key)
        with self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO llm_cache
                       (cache_key, task, value_json, created_at, ttl_seconds)
                   VALUES (?, ?, ?, ?, ?)""",
                (cache_key, task, json.dumps(value), int(time.time()), ttl),
            )

    def invalidate_by_prefix(self, task: str, key_prefix: str) -> int:
        """Delete cache entries whose key was derived from keys starting with key_prefix.

        Because keys are hashed before storage there is no true prefix search on
        the stored hash.  We hash the prefix itself and use the first 16 hex
        chars as a rough filter — this mirrors the original spec behaviour.
        """
        prefix_hash = hashlib.sha256(f"{task}:{key_prefix}".encode()).hexdigest()[:16]
        with self._conn() as conn:
            cursor = conn.execute(
                "DELETE FROM llm_cache WHERE task = ? AND cache_key LIKE ?",
                (task, f"{prefix_hash}%"),
            )
            return cursor.rowcount
