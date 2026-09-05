from app.services.payfast import build_signature


def test_signature_is_deterministic():
    fields = {"merchant_id": "10000100", "amount": "199.99", "item_name": "Test"}
    sig1 = build_signature(fields)
    sig2 = build_signature(fields)
    assert sig1 == sig2
    assert len(sig1) == 32  # md5 hex digest


def test_signature_changes_with_passphrase():
    fields = {"merchant_id": "10000100", "amount": "199.99"}
    assert build_signature(fields) != build_signature(fields, passphrase="secret")


def test_signature_skips_empty_fields():
    fields = {"merchant_id": "10000100", "name_last": ""}
    fields_without_empty = {"merchant_id": "10000100"}
    assert build_signature(fields) == build_signature(fields_without_empty)
