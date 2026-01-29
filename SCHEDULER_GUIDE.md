# Job Extraction Scheduler - Setup Guide

## You Have Two Options:

### **Option 1: Simple Python Scheduler** (Recommended for Testing)
**Pros:** Easy to start/stop, see output immediately
**Cons:** Stops when terminal closes

**To Start:**
```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications
python3 scheduler.py
```

**To Run in Background:**
```bash
nohup python3 scheduler.py > scheduler_output.log 2>&1 &
```

**To Stop:**
- If running in foreground: Press `Ctrl+C`
- If running in background: `pkill -f scheduler.py`

**Check Status:**
```bash
tail -f scheduler.log
```

---

### **Option 2: macOS LaunchAgent** (Production-Ready)
**Pros:** Survives restarts, proper system integration
**Cons:** Slightly more setup

**To Install:**
```bash
# Copy the plist to LaunchAgents folder
cp com.jobextractor.scheduler.plist ~/Library/LaunchAgents/

# Load the agent
launchctl load ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
```

**To Check Status:**
```bash
launchctl list | grep jobextractor
```

**To View Logs:**
```bash
tail -f launchd_output.log
tail -f launchd_error.log
```

**To Stop:**
```bash
launchctl unload ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
```

**To Restart:**
```bash
launchctl unload ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
launchctl load ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
```

---

## Current Settings:
- **Interval:** Every 3 hours (10,800 seconds)
- **Search Queries:** AI Engineer, ML Engineer, Data Scientist
- **Max Jobs per Query:** 10
- **Output:** `jobs_master.xlsx` (new jobs appended to bottom)

## Files Created:
- `scheduler.py` - Simple Python scheduler
- `com.jobextractor.scheduler.plist` - macOS LaunchAgent config
- `scheduler.log` - Execution log (Option 1)
- `launchd_output.log` / `launchd_error.log` - Logs (Option 2)

## Important Notes:
- New jobs are added to the **bottom** of `jobs_master.xlsx` to preserve row indices of your 34 analyzed jobs
- The '✨ NEW' marker shows newly found jobs
- Duplicate jobs (by URL) are automatically skipped
