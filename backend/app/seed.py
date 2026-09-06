"""Idempotent seed data for local development / first boot.

Run with: python -m app.seed

Product photos live in frontend/public/images/products/ and are served
by the frontend's nginx as static files. Products without a photo yet
fall back to a picsum.photos placeholder.
"""

import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, engine, Base
from app.models.category import Category
from app.models.product import Product

CATEGORIES = [
    {"name": "Tools & Hardware", "slug": "tools-hardware"},
    {"name": "Automotive", "slug": "automotive"},
    {"name": "Kids & Toys", "slug": "kids-toys"},
    {"name": "Home & Care", "slug": "home-care"},
]

PRODUCTS = [
    {
        "name": "101-Piece Magnetic Precision Screwdriver Set",
        "slug": "101-piece-magnetic-precision-screwdriver-set",
        "description": "A complete 101-piece precision screwdriver set with magnetic bits and a "
        "sturdy storage rack - built for electronics, appliance and everyday repairs.",
        "price": 499.00,
        "category_slug": "tools-hardware",
        "stock": 50,
        "image_url": "/images/products/101-piece-magnetic-precision-screwdriver-set.png",
    },
    {
        "name": "Car Vacuum Cleaner",
        "slug": "car-vacuum-cleaner",
        "description": "Compact, strong-suction handheld vacuum cleaner designed for quick "
        "interior car cleanups - crumbs, dust and debris, gone in minutes.",
        "price": 499.00,
        "category_slug": "automotive",
        "stock": 40,
        "image_url": "/images/products/car-vacuum-cleaner.png",
    },
    {
        "name": "Interactive Plush Lion Hand Puppet",
        "slug": "interactive-plush-lion-hand-puppet",
        "description": "A soft, huggable lion hand puppet that brings storytime to life - "
        "perfect for imaginative play and bonding time with little ones.",
        "price": 129.00,
        "category_slug": "kids-toys",
        "stock": 80,
        "image_url": "/images/products/interactive-plush-lion-hand-puppet.png",
    },
    {
        "name": "Kids Drawing Tablet",
        "slug": "kids-drawing-tablet",
        "description": "An LCD writing and drawing tablet for kids - screen-free, reusable, "
        "and great for sparking creativity on the go.",
        "price": 299.00,
        "category_slug": "kids-toys",
        "stock": 60,
        "image_url": "/images/products/kids-drawing-tablet.png",
    },
    {
        "name": "Kids Hobby Horse or Unicorn with Galloping Neighing Sounds",
        "slug": "kids-hobby-horse-unicorn-galloping-sounds",
        "description": "A playful hobby horse with realistic galloping and neighing sounds - "
        "hours of active, imaginative outdoor or indoor play.",
        "price": 349.00,
        "category_slug": "kids-toys",
        "stock": 35,
    },
    {
        "name": "Kids Mountain Bike Seat with Dual Handle",
        "slug": "kids-mountain-bike-seat-dual-handle",
        "description": "A secure, comfortable rear bike seat with dual handles, so little "
        "riders can safely join the family adventure on the trail.",
        "price": 1199.00,
        "category_slug": "kids-toys",
        "stock": 20,
        "image_url": "/images/products/kids-mountain-bike-seat-dual-handle.png",
    },
    {
        "name": "White Shoe Cleaner - Restore. Refresh. Shine.",
        "slug": "white-shoe-cleaner-restore-refresh-shine",
        "description": "A dedicated whitening cream for sneakers and white shoes - restores, "
        "refreshes and shines in just a few wipes.",
        "price": 92.00,
        "category_slug": "home-care",
        "stock": 100,
        "image_url": "/images/products/white-shoe-cleaner-restore-refresh-shine.png",
    },
]


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        slug_to_category: dict[str, Category] = {}
        for cat in CATEGORIES:
            existing = (
                await db.execute(select(Category).where(Category.slug == cat["slug"]))
            ).scalar_one_or_none()
            if existing is None:
                existing = Category(name=cat["name"], slug=cat["slug"])
                db.add(existing)
                await db.flush()
            slug_to_category[cat["slug"]] = existing

        for prod in PRODUCTS:
            image_url = prod.get(
                "image_url", f"https://picsum.photos/seed/{prod['slug']}/600/600"
            )
            existing = (
                await db.execute(select(Product).where(Product.slug == prod["slug"]))
            ).scalar_one_or_none()
            if existing is not None:
                # Keep photos in sync on re-seed, without touching stock/price
                # that may have since been changed via the app.
                if existing.image_url != image_url:
                    existing.image_url = image_url
                continue

            db.add(
                Product(
                    name=prod["name"],
                    slug=prod["slug"],
                    description=prod["description"],
                    price=prod["price"],
                    stock=prod["stock"],
                    image_url=image_url,
                    category_id=slug_to_category[prod["category_slug"]].id,
                )
            )

        await db.commit()

    print(f"Seeded {len(CATEGORIES)} categories and {len(PRODUCTS)} products.")


if __name__ == "__main__":
    asyncio.run(seed())
