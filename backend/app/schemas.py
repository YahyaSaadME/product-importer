from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ProductBase(BaseModel):
    sku: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=160)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class ProductRead(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductPage(BaseModel):
    items: list[ProductRead]
    total: int
    page: int
    page_size: int


class ImportJobRead(BaseModel):
    id: str
    filename: str
    status: str
    stage: str
    total_rows: int
    processed_rows: int
    error: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WebhookBase(BaseModel):
    url: HttpUrl
    events: list[str] = Field(default_factory=lambda: ["products.imported"])
    enabled: bool = True


class WebhookCreate(WebhookBase):
    pass


class WebhookUpdate(BaseModel):
    url: HttpUrl | None = None
    events: list[str] | None = None
    enabled: bool | None = None


class WebhookRead(BaseModel):
    id: int
    url: str
    events: list[str]
    enabled: bool
    last_status_code: int | None
    last_response_ms: int | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WebhookTestResult(BaseModel):
    status_code: int | None
    response_ms: int
    ok: bool
    error: str | None = None
