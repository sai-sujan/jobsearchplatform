FROM python:3.12-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gcc \
        g++ \
        git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt \
    && python -m playwright install --with-deps chromium \
    && python -m playwright install chrome

COPY . .

RUN chmod +x docker/start-backend.sh \
    && mkdir -p data/analysis_results data/job_descriptions data/resumes data/backups data/temp_latex data/ai_cache logs resume

EXPOSE 5001

CMD ["./docker/start-backend.sh"]
