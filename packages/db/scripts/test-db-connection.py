"""Quick Postgres connectivity check (no secrets printed). Run from packages/db."""
from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urlparse


def load_database_url() -> str:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        s = line.strip()
        if s.startswith("DATABASE_URL"):
            return s.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL not found in packages/db/.env")


def main() -> None:
    url = load_database_url()
    parsed = urlparse(url)
    host = parsed.hostname or "?"
    port = parsed.port or 5432
    print(f"host={host} port={port} db={parsed.path.lstrip('/') or '?'}")

    try:
        import psycopg2
    except ImportError:
        print("Install psycopg2-binary: pip install psycopg2-binary")
        sys.exit(1)

    sep = "&" if "?" in url else "?"
    for label, test_url in [
        ("sslmode=require", f"{url}{sep}sslmode=require"),
        ("no_ssl", url),
    ]:
        try:
            conn = psycopg2.connect(test_url, connect_timeout=15)
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
            conn.close()
            print(f"{label}: OK")
            return
        except Exception as exc:
            print(f"{label}: FAIL ({type(exc).__name__}) {exc}")

    sys.exit(1)


if __name__ == "__main__":
    main()
