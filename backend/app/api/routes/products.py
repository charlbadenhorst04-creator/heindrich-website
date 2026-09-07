
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.models.product import Product
from app.schemas.product import ProductListResponse, ProductRead

router = APIRouter(prefix="/products", tags=["products"])


def list_products_query(q: str | None = None, category: str | None = None):
    """The ordered listing query, without paging applied.

    `id` breaks ties on created_at. Products created in one transaction all
    share a created_at (PostgreSQL's now() is transaction-scoped), and an
    ORDER BY over tied rows has no guaranteed order between queries - so a
    paginated listing could repeat one product on both pages and drop
    another entirely. The tiebreaker makes the ordering total.
    """
    stmt = select(Product).where(Product.is_active.is_(True)).options(selectinload(Product.category))

    if q:
        stmt = stmt.where(Product.name.ilike(f"%{q}%"))
    if category:
        stmt = stmt.where(Product.category.has(slug=category))

    return stmt.order_by(Product.created_at.desc(), Product.id)


@router.get("", response_model=ProductListResponse)
async def list_products(
    db: DbSession,
    q: str | None = Query(default=None, description="Search by product name"),
    category: str | None = Query(default=None, description="Filter by category slug"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
) -> ProductListResponse:
    stmt = list_products_query(q=q, category=category)

    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    products = (await db.execute(stmt)).scalars().all()

    return ProductListResponse(
        items=[ProductRead.model_validate(p) for p in products],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{slug}", response_model=ProductRead)
async def get_product(slug: str, db: DbSession) -> ProductRead:
    stmt = (
        select(Product)
        .where(Product.slug == slug, Product.is_active.is_(True))
        .options(selectinload(Product.category))
    )
    product = (await db.execute(stmt)).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductRead.model_validate(product)
