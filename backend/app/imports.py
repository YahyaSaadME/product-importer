import csv
from collections.abc import Iterator
from pathlib import Path


def normalize_sku(value: str | None) -> str:
    return (value or "").strip().casefold()


def count_csv_rows(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return max(sum(1 for _ in handle) - 1, 0)


def _clean_bool(value: str | None, default: bool = True) -> bool:
    if value is None or str(value).strip() == "":
        return default
    return str(value).strip().casefold() in {"1", "true", "yes", "y", "active"}


def _read_field(row: dict[str, str | None], *names: str) -> str:
    normalized = {key.strip().casefold(): value for key, value in row.items() if key is not None}
    for name in names:
        if name in normalized and normalized[name] is not None:
            return str(normalized[name]).strip()
    return ""


def read_product_batches(path: Path, batch_size: int) -> Iterator[list[dict[str, object]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        batch: dict[str, dict[str, object]] = {}

        for row_number, row in enumerate(reader, start=2):
            sku = _read_field(row, "sku")
            sku_normalized = normalize_sku(sku)
            if not sku_normalized:
                raise ValueError(f"CSV row {row_number} is missing required SKU")

            name = _read_field(row, "name", "product_name") or sku
            batch[sku_normalized] = {
                "sku": sku,
                "sku_normalized": sku_normalized,
                "name": name,
                "description": _read_field(row, "description", "desc"),
                "is_active": _clean_bool(_read_field(row, "is_active", "active", "status"), True),
            }

            if len(batch) >= batch_size:
                yield list(batch.values())
                batch = {}

        if batch:
            yield list(batch.values())
