#!/usr/bin/env python3
"""
Job Extraction Scheduler
Runs find_jobs.py at fixed times: 9:00 AM and 4:00 PM daily
"""

import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

from src.settings import settings

# Fixed run times (24h format)
RUN_TIMES = [(9, 0), (16, 0)]  # 9:00 AM and 4:00 PM

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


def get_next_run_time():
    """Find the next scheduled run time from RUN_TIMES."""
    now = datetime.now()

    # Check each run time today
    for hour, minute in sorted(RUN_TIMES):
        candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate > now:
            return candidate

    # All times today have passed — use first time tomorrow
    first_hour, first_minute = sorted(RUN_TIMES)[0]
    tomorrow = now + timedelta(days=1)
    return tomorrow.replace(hour=first_hour, minute=first_minute, second=0, microsecond=0)


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
    schedule_str = ", ".join(f"{h}:{m:02d}" for h, m in sorted(RUN_TIMES))
    log_message("=" * 70)
    log_message("Job Extraction Scheduler Started")
    log_message(f"Schedule: Daily at {schedule_str}")
    log_message(f"Script directory: {SCRIPT_DIR}")
    log_message("=" * 70)
    log_message("Press Ctrl+C to stop")

    try:
        while True:
            next_run = get_next_run_time()
            sleep_seconds = (next_run - datetime.now()).total_seconds()

            if sleep_seconds > 0:
                log_message(f"Next run: {next_run.strftime('%Y-%m-%d %H:%M:%S')}")
                log_message(f"Sleeping for {sleep_seconds/3600:.1f} hours...")
                time.sleep(sleep_seconds)

            run_job_extraction()

    except KeyboardInterrupt:
        log_message("\nScheduler stopped by user")
    except Exception as e:
        log_message(f"\nScheduler crashed: {e}")
        import traceback
        log_message(traceback.format_exc())


if __name__ == "__main__":
    main()
