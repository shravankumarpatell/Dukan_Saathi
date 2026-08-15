"""GSTIN format + checksum unit tests."""

from app.shops.router import _validate_gst_fields, _gstin_checksum_char
from app.common.errors import ValidationError
import pytest


def test_known_gstin_checksum():
    # Central Warehousing Corporation — published example
    assert _gstin_checksum_char("33AAACC1206D1Z") == "N"
    assert _validate_gst_fields(True, "33AAACC1206D1ZN") == "33AAACC1206D1ZN"


def test_bad_checksum_rejected():
    with pytest.raises(ValidationError, match="check digit"):
        _validate_gst_fields(True, "33AAACC1206D1ZM")


def test_gst_off_allows_empty():
    assert _validate_gst_fields(False, "") == ""


def test_gst_on_requires_value():
    with pytest.raises(ValidationError, match="zaroori"):
        _validate_gst_fields(True, "")
