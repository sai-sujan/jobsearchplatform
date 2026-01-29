#!/usr/bin/env python3
"""
Job Extraction Scheduler
Runs find_jobs.py every 3 hours automatically
"""

import subprocess
import time
import os
from datetime import datetime
from pathlib import Path

# Configuration
INTERVAL_HOURS = 3
INTERVAL_SECONDS = INTERVAL_HOURS * 3600
LOG_FILE = "scheduler.log"

def log_message(message):
    """Log message to both console and file"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}"
    print(log_entry)
    
    with open(LOG_FILE, 'a') as f:
        f.write(log_entry + '\n')

def run_job_extraction():
    """Execute find_jobs.py and capture result"""
    log_message("Starting job extraction...")
    
    try:
        # Run find_jobs.py
        result = subprocess.run(
            ['python3', 'find_jobs.py'],
            cwd=Path(__file__).parent,
            capture_output=True,
            text=True,
            timeout=1800  # 30 minute timeout
        )
        
        if result.returncode == 0:
            log_message("✅ Job extraction completed successfully")
            # Log key statistics from output
            if "Added" in result.stdout:
                for line in result.stdout.split('\n'):
                    if "Added" in line or "STATISTICS" in line or "matches" in line:
                        log_message(f"  {line.strip()}")
        else:
            log_message(f"❌ Job extraction failed with code {result.returncode}")
            log_message(f"Error: {result.stderr[:500]}")
    
    except subprocess.TimeoutExpired:
        log_message("⏱️  Job extraction timed out (30 min)")
    except Exception as e:
        log_message(f"❌ Error running job extraction: {e}")

def main():
    log_message("="*70)
    log_message(f"🤖 Job Extraction Scheduler Started (Every {INTERVAL_HOURS} hours)")
    log_message("="*70)
    log_message("Press Ctrl+C to stop")
    
    try:
        while True:
            run_job_extraction()
            
            next_run = datetime.now().timestamp() + INTERVAL_SECONDS
            next_run_time = datetime.fromtimestamp(next_run).strftime("%Y-%m-%d %H:%M:%S")
            
            log_message(f"⏰ Next run scheduled at: {next_run_time}")
            log_message(f"Sleeping for {INTERVAL_HOURS} hours...")
            
            time.sleep(INTERVAL_SECONDS)
    
    except KeyboardInterrupt:
        log_message("\n👋 Scheduler stopped by user")
    except Exception as e:
        log_message(f"\n💥 Scheduler crashed: {e}")

if __name__ == "__main__":
    main()
