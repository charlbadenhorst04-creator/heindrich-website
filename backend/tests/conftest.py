import os

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("BACKEND_CORS_ORIGINS", "http://testserver")
# The account routes are unmounted in a default deployment; mount them here
# so the code behind them stays covered. test_security_defaults.py asserts
# the off-by-default behaviour itself.
os.environ.setdefault("ENABLE_ACCOUNTS", "true")
# The suite checks out far more often from one address than any shopper
# would, so the limiter is off here and tested directly in
# test_security_defaults.py instead.
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "0")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.database import Base, get_db
from app.main import app
from app.models.category import Category
from app.models.product import Product

TEST_DATABASE_URL = "postgresql+asyncpg://meravo:change-me@localhost:5432/meravo_test"

# NullPool (no connection reuse across calls) avoids "attached to a
# different loop" errors from asyncpg connections outliving the event loop
# they were opened on - the standard approach for testing async SQLAlchemy
# apps under pytest-asyncio, per SQLAlchemy's own testing docs.
test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


async def _override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _setup_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await test_engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture
async def seeded_products():
    """Insert one category and two products directly via the ORM, bypassing
    the API, so tests have known, isolated fixture data to work with."""
    async with TestSessionLocal() as db:
        suffix = os.urandom(4).hex()
        category = Category(name=f"Test Category {suffix}", slug=f"test-category-{suffix}")
        db.add(category)
        await db.flush()

        product_a = Product(
            name="Test Product A",
            slug=f"test-product-a-{os.urandom(4).hex()}",
            price=499.00,
            stock=10,
            category_id=category.id,
        )
        product_b = Product(
            name="Test Product B",
            slug=f"test-product-b-{os.urandom(4).hex()}",
            price=250.00,
            stock=10,
            category_id=category.id,
        )
        db.add_all([product_a, product_b])
        await db.commit()
        await db.refresh(product_a)
        await db.refresh(product_b)

        return {"category": category, "product_a": product_a, "product_b": product_b}


@pytest.fixture
def unique_session_key():
    return f"test-session-{os.urandom(8).hex()}"
