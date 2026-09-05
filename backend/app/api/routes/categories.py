from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DbSession
from app.models.category import Category
from app.schemas.category import CategoryRead

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
async def list_categories(db: DbSession) -> list[CategoryRead]:
    stmt = select(Category).order_by(Category.name)
    categories = (await db.execute(stmt)).scalars().all()
    return [CategoryRead.model_validate(c) for c in categories]
