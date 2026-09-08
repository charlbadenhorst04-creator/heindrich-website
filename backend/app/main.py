from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, cart, categories, orders, payments, products, shipping
from app.core.config import settings
from app.core.ratelimit import RateLimitMiddleware


def create_app() -> FastAPI:
    # Swagger, ReDoc and the OpenAPI schema publish a complete map of the
    # API. Off unless ENABLE_API_DOCS is set, so a public deployment does
    # not serve one by default.
    docs = (
        {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}
        if settings.ENABLE_API_DOCS
        else {"docs_url": None, "redoc_url": None, "openapi_url": None}
    )

    app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0", **docs)

    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in (
        products.router,
        categories.router,
        cart.router,
        orders.router,
        payments.router,
        shipping.router,
    ):
        app.include_router(router, prefix=settings.API_V1_PREFIX)

    # Nothing in the storefront signs in - shopping is guest-only via a
    # session key - so these stay unmounted unless accounts are explicitly
    # turned on, rather than leaving a public registration endpoint on the
    # internet for nothing.
    if settings.ENABLE_ACCOUNTS:
        app.include_router(auth.router, prefix=settings.API_V1_PREFIX)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
