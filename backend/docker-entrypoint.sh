#!/bin/sh
set -e

echo "Waiting for database..."
python - <<'PYEOF'
import asyncio
import sys
import time

from sqlalchemy.exc import OperationalError
from app.core.database import engine
from sqlalchemy import text


async def wait_for_db():
    for attempt in range(30):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return
        except OperationalError:
            time.sleep(1)
    print("Database never became available", file=sys.stderr)
    sys.exit(1)


asyncio.run(wait_for_db())
PYEOF

echo "Running migrations..."
alembic upgrade head

echo "Seeding initial data..."
python -m app.seed

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
