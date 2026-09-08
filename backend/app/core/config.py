from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Values shipped in the source default and in .env.example. They are public,
# so anything signed with them can be forged by anyone reading the repo.
PLACEHOLDER_SECRETS = {
    "insecure-dev-secret-change-me",
    "change-me-to-a-long-random-string",
}

# Shipped in .env.example and the compose defaults, so equally public.
PLACEHOLDER_DB_PASSWORDS = {"change-me", "meravo", "postgres", "password"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "MERAVO"
    API_V1_PREFIX: str = "/api"

    DATABASE_URL: str = "postgresql+asyncpg://meravo:meravo@db:5432/meravo"

    SECRET_KEY: str = "insecure-dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    BACKEND_CORS_ORIGINS: str = "http://localhost:5173"

    # Swagger/ReDoc publish a complete map of the API, including every
    # request shape. Off by default so a public deployment does not hand
    # that out; turn it on locally when you want to browse the API.
    ENABLE_API_DOCS: bool = False

    # Registration and login exist but no part of the storefront uses them
    # (shopping is guest-only). Leaving the routes unmounted keeps a public
    # write endpoint off the internet until accounts are actually wanted.
    ENABLE_ACCOUNTS: bool = False

    # Scales the per-IP limits in app/core/ratelimit.py, which apply only to
    # checkout and the account routes. 0 turns limiting off. Browsing and
    # cart traffic are never limited (shared mobile IPs would collide), and
    # the Payfast callback is always exempt.
    RATE_LIMIT_PER_MINUTE: int = 60

    PAYFAST_MODE: str = "sandbox"
    PAYFAST_MERCHANT_ID: str = ""
    PAYFAST_MERCHANT_KEY: str = ""
    PAYFAST_PASSPHRASE: str = ""
    PAYFAST_RETURN_URL: str = "http://localhost:5173/order-success"
    PAYFAST_CANCEL_URL: str = "http://localhost:5173/cart"
    PAYFAST_NOTIFY_URL: str = "http://localhost:8000/api/payments/payfast/notify"

    # Order notification email. Leaving SMTP_HOST empty disables sending
    # entirely (nothing breaks, a line is logged instead), so local and
    # sandbox work needs no mail server.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    MAIL_FROM: str = ""
    MAIL_FROM_NAME: str = "MERAVO"
    SHOP_OWNER_EMAIL: str = "Heinrichcdoman@gmail.com"
    SHOP_CONTACT_PHONE: str = "067 157 2670"
    STORE_URL: str = "http://localhost:8090"

    # WhatsApp order confirmation. Empty WHATSAPP_PROVIDER disables it.
    # "meta"   - WhatsApp Cloud API, direct from Meta
    # "twilio" - Twilio's WhatsApp API
    WHATSAPP_PROVIDER: str = ""
    # Local numbers are typed without a country code ("082 123 4567"), so
    # this is what a leading 0 is replaced with. 27 = South Africa.
    WHATSAPP_COUNTRY_CODE: str = "27"

    # Meta WhatsApp Cloud API
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_API_VERSION: str = "v21.0"
    # Business-initiated messages must use a template Meta has approved;
    # free-form text is only allowed inside a 24-hour reply window, which an
    # order confirmation is not.
    WHATSAPP_TEMPLATE_NAME: str = "order_confirmation"
    WHATSAPP_TEMPLATE_LANGUAGE: str = "en"

    # Twilio
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""
    # Twilio's approved template ("content") id. Left empty, the message is
    # sent as plain text, which only works in the Twilio sandbox.
    TWILIO_CONTENT_SID: str = ""

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

    @property
    def email_enabled(self) -> bool:
        return bool(self.SMTP_HOST)

    @property
    def whatsapp_enabled(self) -> bool:
        return self.WHATSAPP_PROVIDER.strip().lower() in {"meta", "twilio"}

    @property
    def mail_from_address(self) -> str:
        """Falls back to the SMTP username, which for Gmail is the address
        mail is sent from anyway - one less thing to configure wrongly."""
        return self.MAIL_FROM or self.SMTP_USERNAME

    @model_validator(mode="after")
    def _reject_placeholder_secret_in_live_mode(self) -> "Settings":
        """Refuse to start a live store with a secret key anyone can read.

        Deliberately scoped to live mode so local and sandbox work stays
        zero-config; going live is the moment this has to be real.
        """
        if self.PAYFAST_MODE != "live":
            return self

        if self.SECRET_KEY in PLACEHOLDER_SECRETS:
            raise ValueError(
                "SECRET_KEY is still set to a placeholder value while "
                "PAYFAST_MODE=live. Set SECRET_KEY in your .env to a long "
                "random string before going live - for example, the output "
                'of: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )

        # The password sits in the DATABASE_URL, which is the only place the
        # app sees it.
        if any(f":{placeholder}@" in self.DATABASE_URL for placeholder in PLACEHOLDER_DB_PASSWORDS):
            raise ValueError(
                "POSTGRES_PASSWORD is still a placeholder while "
                "PAYFAST_MODE=live. Set a strong POSTGRES_PASSWORD in your "
                ".env (and the matching DATABASE_URL) before going live."
            )

        if any(
            origin.startswith("http://") and "localhost" not in origin and "127.0.0.1" not in origin
            for origin in self.cors_origins
        ):
            raise ValueError(
                "BACKEND_CORS_ORIGINS contains a plain http:// domain while "
                "PAYFAST_MODE=live. A live store must be served over https."
            )

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
