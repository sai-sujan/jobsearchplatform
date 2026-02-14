#!/usr/bin/env python3
"""
Job Extraction Scheduler
Runs find_jobs.py every 3 hours between 9am-12am (midnight)
"""

import subprocess
import time
import os
from datetime import datetime
from pathlib import Path

from src.settings import settings

# Configuration
INTERVAL_HOURS = settings.SCHEDULE_INTERVAL_HOURS
INTERVAL_SECONDS = INTERVAL_HOURS * 3600
START_HOUR = settings.SCHEDULE_START_HOUR
END_HOUR = settings.SCHEDULE_END_HOUR

# Use absolute path to script directory
SCRIPT_DIR = settings.BASE_DIR
VENV_PYTHON = settings.VENV_PYTHON
LOG_FILE = settings.LOGS_DIR / "scheduler.log"


def log_message(message):
    """Log message to both console and file"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}"
    print(log_entry)

    with open(LOG_FILE, 'a') as f:
        f.write(log_entry + '\n')


def is_within_schedule():
    """Check if current time is within 9am-12am window"""
    current_hour = datetime.now().hour
    return START_HOUR <= current_hour < END_HOUR


def get_next_run_time():
    """Calculate next run time, respecting the 9am-12am window"""
    now = datetime.now()
    current_hour = now.hour

    if current_hour < START_HOUR:
        # Before 9am - wait until 9am
        next_run = now.replace(hour=START_HOUR, minute=0, second=0, microsecond=0)
        return next_run
    elif current_hour >= END_HOUR:
        # After midnight - wait until 9am tomorrow
        tomorrow = now.replace(hour=START_HOUR, minute=0, second=0, microsecond=0)
        tomorrow = tomorrow.replace(day=tomorrow.day + 1)
        return tomorrow
    else:
        # Within window - run in 3 hours (or at 9am tomorrow if that would be past midnight)
        next_run = now.timestamp() + INTERVAL_SECONDS
        next_run_dt = datetime.fromtimestamp(next_run)

        if next_run_dt.hour >= END_HOUR or next_run_dt.hour < START_HOUR:
            # Would be outside window, schedule for 9am next day
            next_day = now.replace(hour=START_HOUR, minute=0, second=0, microsecond=0)
            if now.hour >= START_HOUR:
                next_day = next_day.replace(day=next_day.day + 1)
            return next_day

        return next_run_dt


def run_job_extraction():
    """Execute find_jobs.py and capture result"""
    log_message("Starting job extraction...")

    try:
        # Use venv python
        python_cmd = str(VENV_PYTHON) if VENV_PYTHON.exists() else 'python3'

        result = subprocess.run(
            [python_cmd, 'find_jobs.py'],
            cwd=SCRIPT_DIR,
            capture_output=True,
            text=True,
            timeout=1800  # 30 minute timeout
        )

        if result.returncode == 0:
            log_message("Job extraction completed successfully")
            # Log key statistics from output
            for line in result.stdout.split('\n'):
                if any(kw in line for kw in ["Added", "STATISTICS", "matches", "Total", "SUCCESS"]):
                    log_message(f"  {line.strip()}")
        else:
            log_message(f"Job extraction failed with code {result.returncode}")
            if result.stderr:
                log_message(f"Error: {result.stderr[:500]}")

    except subprocess.TimeoutExpired:
        log_message("Job extraction timed out (30 min)")
    except Exception as e:
        log_message(f"Error running job extraction: {e}")


def main():
    log_message("=" * 70)
    log_message(f"Job Extraction Scheduler Started")
    log_message(f"Schedule: Every {INTERVAL_HOURS} hours between {START_HOUR}:00 - {END_HOUR}:00")
    log_message(f"Script directory: {SCRIPT_DIR}")
    log_message("=" * 70)
    log_message("Press Ctrl+C to stop")

    try:
        while True:
            if is_within_schedule():
                run_job_extraction()
            else:
                log_message(f"Outside schedule ({START_HOUR}:00-{END_HOUR}:00). Waiting...")

            next_run = get_next_run_time()
            sleep_seconds = (next_run - datetime.now()).total_seconds()

            if sleep_seconds > 0:
                log_message(f"Next run: {next_run.strftime('%Y-%m-%d %H:%M:%S')}")
                log_message(f"Sleeping for {sleep_seconds/3600:.1f} hours...")
                time.sleep(sleep_seconds)
            else:
                # Run immediately if somehow negative
                time.sleep(60)

    except KeyboardInterrupt:
        log_message("\nScheduler stopped by user")
    except Exception as e:
        log_message(f"\nScheduler crashed: {e}")
        import traceback
        log_message(traceback.format_exc())


if __name__ == "__main__":
    main()
