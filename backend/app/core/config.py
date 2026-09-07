from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Values shipped in the source default and in .env.example. They are public,
# so anything signed with them can be forged by anyone reading the repo.
PLACEHOLDER_SECRETS = {
    "insecure-dev-secret-change-me",
    "change-me-to-a-long-random-string",
}


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

    @model_validator(mode="after")
    def _reject_placeholder_secret_in_live_mode(self) -> "Settings":
        """Refuse to start a live store with a secret key anyone can read.

        Deliberately scoped to live mode so local and sandbox work stays
        zero-config; going live is the moment this has to be real.
        """
        if self.PAYFAST_MODE == "live" and self.SECRET_KEY in PLACEHOLDER_SECRETS:
            raise ValueError(
                "SECRET_KEY is still set to a placeholder value while "
                "PAYFAST_MODE=live. Set SECRET_KEY in your .env to a long "
                "random string before going live - for example, the output "
                'of: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
