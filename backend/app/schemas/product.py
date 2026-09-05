import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.category import CategoryRead


class ProductBase(BaseModel):
    name: str
    slug: str
    description: str = ""
    price: float = Field(gt=0)
    image_url: str = ""
    stock: int = Field(ge=0, default=0)
    is_active: bool = True


class ProductCreate(ProductBase):
    category_id: uuid.UUID


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = Field(default=None, gt=0)
    image_url: str | None = None
    stock: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    category_id: uuid.UUID | None = None


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: CategoryRead


class ProductListResponse(BaseModel):
    items: list[ProductRead]
    total: int
    page: int
    page_size: int
