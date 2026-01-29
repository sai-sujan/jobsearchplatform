#!/bin/bash
# Scheduled Job Finder - Wrapper Script for LaunchAgent
# This script ensures proper environment setup before running find_jobs.py

# Set working directory
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications

# Log timestamp
echo ""
echo "=========================================="
echo "Job Search Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# Load environment variables from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo "[INFO] Loaded .env file"
fi

# Activate virtual environment and run
./venv/bin/python3 find_jobs.py

# Log completion
echo ""
echo "[DONE] Job Search Completed: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
