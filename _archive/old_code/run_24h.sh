#!/bin/bash

# Wrapper for 24h Job Update (Run by LaunchAgent)

# 1. CD to project dir
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications

# 2. Activate Python Env
source venv/bin/activate

# 3. Run Script & Append Log
echo "--- Starting Job Update: $(date) ---" >> update_24h.log
python3 run_job_search.py >> update_24h.log 2>&1
echo "--- Finished: $(date) ---" >> update_24h.log
