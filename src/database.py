"""
Database Configuration and Setup
---------------------------------
SQLAlchemy ORM configuration for SQLite database.
All models should extend Base (imported below).

Usage:
    from src.database import SessionLocal, Base, engine
    db = SessionLocal()
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from src.settings import settings

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={'check_same_thread': False},  # SQLite requirement
    echo=False,  # Set to True for SQL query logging
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()


def init_db():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        inspector = inspect(connection)
        if 'users' in inspector.get_table_names():
            user_columns = {column["name"] for column in inspector.get_columns('users')}
            if 'full_name' not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(120)"))
        if 'user_profiles' in inspector.get_table_names():
            profile_columns = {column["name"] for column in inspector.get_columns('user_profiles')}
            if 'quality_filters' not in profile_columns:
                connection.execute(text("ALTER TABLE user_profiles ADD COLUMN quality_filters JSON"))
        if 'matched_jobs' in inspector.get_table_names():
            matched_columns = {column["name"] for column in inspector.get_columns('matched_jobs')}
            if 'ai_match_score' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN ai_match_score FLOAT"))
            if 'ai_match_confidence' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN ai_match_confidence VARCHAR(20)"))
            if 'ai_match_summary' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN ai_match_summary TEXT"))
            if 'ai_match_reasons' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN ai_match_reasons JSON"))
            if 'ai_match_cache_key' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN ai_match_cache_key VARCHAR(80)"))
            if 'ai_match_updated_at' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN ai_match_updated_at DATETIME"))


def get_db():
    """Dependency for FastAPI to inject DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
