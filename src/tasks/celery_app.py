from celery import Celery
import os
from dotenv import load_dotenv

load_dotenv()

# Use Upstash Redis or local redis from env
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "clawdbot_workers",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["src.tasks.job_tasks"]
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Operational constraints for AI tasks (high visibility timeout for Groq/Scraping)
    broker_transport_options={
        "visibility_timeout": 3600  # 1 hour
    }
)

if __name__ == "__main__":
    app.start()
