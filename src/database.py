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

# Create PostgreSQL database engine with connection pooling
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,          # Standard pool size for FastAPI workers
    max_overflow=20,       # Max extended connections during spikes
    pool_pre_ping=True,    # Test connections before using (defends against dropped connections)
    echo=False,            # Set to True for SQL query logging
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
            if 'delivery_origin' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN delivery_origin VARCHAR(30) DEFAULT 'legacy_sync'"))
            if 'workspace_location' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN workspace_location VARCHAR(255)"))
            if 'workspace_ats_score' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN workspace_ats_score FLOAT"))
            if 'workspace_matched_skills' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN workspace_matched_skills JSON"))
            if 'workspace_analysis' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN workspace_analysis JSON"))
            if 'workspace_resume_path' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN workspace_resume_path VARCHAR(500)"))
            if 'freshness_score' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN freshness_score FLOAT"))
            if 'freshness_label' not in matched_columns:
                connection.execute(text("ALTER TABLE matched_jobs ADD COLUMN freshness_label VARCHAR(120)"))
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
            matched_indexes = {index["name"] for index in inspector.get_indexes('matched_jobs')}
            if 'ix_matched_jobs_user_origin_status' not in matched_indexes:
                connection.execute(
                    text(
                        "CREATE INDEX ix_matched_jobs_user_origin_status "
                        "ON matched_jobs (user_id, delivery_origin, delivery_status)"
                    )
                )


def get_db():
    """Dependency for FastAPI to inject DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
