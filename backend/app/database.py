import re
import ssl
from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .settings import get_settings

settings = get_settings()


def _async_engine_args(url: str) -> tuple[str, dict]:
    """Strip sslmode from URL and return (clean_url, connect_args).

    asyncpg does not understand the sslmode URL parameter — it must be
    passed as an SSL context via connect_args instead.
    """
    connect_args: dict = {}
    if "sslmode=require" in url or "sslmode=prefer" in url:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = ctx
        url = re.sub(r"[?&]sslmode=[^&]*", "", url).rstrip("?&").rstrip("?")
    return url, connect_args


_async_url, _async_connect_args = _async_engine_args(settings.async_database_url)

async_engine = create_async_engine(_async_url, pool_pre_ping=True, connect_args=_async_connect_args)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)

# psycopg2 understands sslmode natively — no changes needed for sync engine
sync_engine = create_engine(settings.sync_database_url, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(bind=sync_engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
