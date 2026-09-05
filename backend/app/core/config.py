from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "MERAVO"
    API_V1_PREFIX: str = "/api"

    DATABASE_URL: str = "postgresql+asyncpg://meravo:meravo@db:5432/meravo"

    SECRET_KEY: str = "insecure-dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    BACKEND_CORS_ORIGINS: str = "http://localhost:5173"

    PAYFAST_MODE: str = "sandbox"
    PAYFAST_MERCHANT_ID: str = ""
    PAYFAST_MERCHANT_KEY: str = ""
    PAYFAST_PASSPHRASE: str = ""
    PAYFAST_RETURN_URL: str = "http://localhost:5173/order-success"
    PAYFAST_CANCEL_URL: str = "http://localhost:5173/cart"
    PAYFAST_NOTIFY_URL: str = "http://localhost:8000/api/payments/payfast/notify"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def payfast_host(self) -> str:
        return (
            "https://www.payfast.co.za"
            if self.PAYFAST_MODE == "live"
            else "https://sandbox.payfast.co.za"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
