import os


def _unique_email() -> str:
    return f"user-{os.urandom(6).hex()}@example.com"


async def test_register_and_login_roundtrip(client):
    email = _unique_email()
    register_resp = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "SecurePass123!", "full_name": "Test User"},
    )
    assert register_resp.status_code == 201
    user = register_resp.json()
    assert user["email"] == email
    assert "hashed_password" not in user

    login_resp = await client.post(
        "/api/auth/login", json={"email": email, "password": "SecurePass123!"}
    )
    assert login_resp.status_code == 200
    token_data = login_resp.json()
    assert token_data["token_type"] == "bearer"
    assert len(token_data["access_token"]) > 20


async def test_register_duplicate_email_rejected(client):
    email = _unique_email()
    payload = {"email": email, "password": "SecurePass123!"}
    first = await client.post("/api/auth/register", json=payload)
    assert first.status_code == 201

    second = await client.post("/api/auth/register", json=payload)
    assert second.status_code == 400


async def test_login_wrong_password_rejected(client):
    email = _unique_email()
    await client.post(
        "/api/auth/register", json={"email": email, "password": "SecurePass123!"}
    )
    resp = await client.post(
        "/api/auth/login", json={"email": email, "password": "WrongPassword!"}
    )
    assert resp.status_code == 401


async def test_login_nonexistent_user_rejected(client):
    resp = await client.post(
        "/api/auth/login", json={"email": _unique_email(), "password": "whatever123"}
    )
    assert resp.status_code == 401


async def test_register_rejects_short_password(client):
    resp = await client.post(
        "/api/auth/register", json={"email": _unique_email(), "password": "short"}
    )
    assert resp.status_code == 422


async def test_register_rejects_invalid_email(client):
    resp = await client.post(
        "/api/auth/register", json={"email": "not-an-email", "password": "SecurePass123!"}
    )
    assert resp.status_code == 422
