"""Browser account identity is a DB lock boundary; browser credentials stay local."""
from datetime import datetime
from sqlalchemy import String,Boolean,DateTime,JSON,Integer
from sqlalchemy.orm import Mapped,mapped_column
from app.core.db import Base
from app.models.base import TimestampMixin

class WebGenerationAccount(Base,TimestampMixin):
    """One row per isolated platform session; claims lock this row across workers."""
    __tablename__='web_generation_accounts'
    id:Mapped[str]=mapped_column(String(64),primary_key=True)
    platform:Mapped[str]=mapped_column(String(32),nullable=False)
    display_name:Mapped[str]=mapped_column(String(120),nullable=False)
    enabled:Mapped[bool]=mapped_column(Boolean,nullable=False,default=False)
    active_task_id:Mapped[str|None]=mapped_column(String(64),nullable=True)
    session_state:Mapped[str]=mapped_column(String(32),nullable=False,default='needs_login')
    supported_models:Mapped[list]=mapped_column(JSON,nullable=False,default=list)
    heartbeat_at:Mapped[datetime|None]=mapped_column(DateTime,nullable=True)
    last_assigned_at:Mapped[datetime|None]=mapped_column(DateTime,nullable=True)
    profile_key:Mapped[str|None]=mapped_column(String(64),nullable=True,unique=True)


class WebModelCatalog(Base, TimestampMixin):
    """Versioned website model policy, separate from API models and browser evidence."""
    __tablename__ = 'web_model_catalogs'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    entries: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
