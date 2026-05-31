from pathlib import Path

import pytest

from app.imports import normalize_sku, read_product_batches


def test_normalize_sku_is_case_insensitive_and_trims_spaces():
    assert normalize_sku("  AbC-123  ") == "abc-123"


def test_read_product_batches_uses_later_duplicate_row_case_insensitively(tmp_path: Path):
    csv_path = tmp_path / "products.csv"
    csv_path.write_text(
        "sku,name,description\n"
        "ABC-1,Old name,Old description\n"
        "abc-1,New name,New description\n"
        "XYZ-2,Second,Other\n",
        encoding="utf-8",
    )

    batches = list(read_product_batches(csv_path, batch_size=10))

    assert len(batches) == 1
    assert batches[0] == [
        {
            "sku": "abc-1",
            "sku_normalized": "abc-1",
            "name": "New name",
            "description": "New description",
            "is_active": True,
        },
        {
            "sku": "XYZ-2",
            "sku_normalized": "xyz-2",
            "name": "Second",
            "description": "Other",
            "is_active": True,
        },
    ]


def test_read_product_batches_rejects_rows_without_sku(tmp_path: Path):
    csv_path = tmp_path / "products.csv"
    csv_path.write_text("sku,name\n,Missing\n", encoding="utf-8")

    with pytest.raises(ValueError, match="row 2"):
        list(read_product_batches(csv_path, batch_size=10))
