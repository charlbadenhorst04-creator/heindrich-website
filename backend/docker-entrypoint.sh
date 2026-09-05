#!/bin/sh
set -e

echo "Waiting for database..."
python - <<'PYEOF'
import asyncio
import sys

from app.core.database import engine
from sqlalchemy import text


async def wait_for_db():
    last_error = None
    for attempt in range(30):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return
        # Deliberately broad: a not-yet-ready Postgres can surface as
        # sqlalchemy.exc.OperationalError, but just as often as a raw
        # ConnectionRefusedError/OSError before SQLAlchemy gets a chance
        # to wrap it (confirmed by actually stopping Postgres and
        # inspecting the exception mid-development - it is NOT always
        # OperationalError). This loop's only job is "retry until
        # reachable or give up", so catching broadly here is correct.
        except Exception as e:
            last_error = e
            await asyncio.sleep(1)
    print(f"Database never became available: {last_error}", file=sys.stderr)
    sys.exit(1)


asyncio.run(wait_for_db())
PYEOF

echo "Running migrations..."
alembic upgrade head

echo "Seeding initial data..."
python -m app.seed

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
