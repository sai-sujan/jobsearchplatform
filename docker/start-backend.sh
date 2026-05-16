#!/usr/bin/env sh
set -eu

mkdir -p \
  /app/data/analysis_results \
  /app/data/job_descriptions \
  /app/data/resumes \
  /app/data/backups \
  /app/data/temp_latex \
  /app/data/ai_cache \
  /app/logs \
  /app/resume

if [ ! -f /app/resume/master_resume.txt ]; then
  cat > /app/resume/master_resume.txt <<'EOF'
Replace this file with your resume text.
EOF
fi

exec uvicorn api.server:app --host "${API_HOST:-0.0.0.0}" --port "${API_PORT:-5001}"
