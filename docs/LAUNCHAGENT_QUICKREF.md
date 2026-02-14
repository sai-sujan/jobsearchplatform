# LaunchAgent Job Extractor - Quick Reference

## ✅ Status: ACTIVE
Your job extractor is now running automatically every 3 hours via macOS LaunchAgent.

---

## 📊 Check Status
```bash
launchctl list | grep jobextractor
```
**Expected output:** `-  [number]  com.jobextractor.scheduler`
- The `-` means it's waiting for next scheduled run
- A number means it's currently running

---

## 📝 View Logs
```bash
# Real-time log monitoring
tail -f ~/Desktop/internships_apply/clawdbot_automation/job-applications/launchd_output.log

# Check errors
tail -f ~/Desktop/internships_apply/clawdbot_automation/job-applications/launchd_error.log
```

---

## 🔄 Common Commands

### Restart the Agent
```bash
launchctl unload ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
launchctl load ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
```

### Stop the Agent
```bash
launchctl unload ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
```

### Start the Agent
```bash
launchctl load ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
```

### Trigger Manual Run (without waiting)
```bash
cd ~/Desktop/internships_apply/clawdbot_automation/job-applications
python3 find_jobs.py
```

---

## 🎯 What Happens Every 3 Hours

1. **Searches LinkedIn** for AI/ML/Data Science jobs
2. **Filters** out Senior roles & citizenship requirements
3. **Scores** based on your skills
4. **Appends** new jobs to `jobs_master.xlsx` (bottom of file)
5. **Logs** results to `launchd_output.log`

---

## 📁 Important Files

- **Excel Output**: `jobs_master.xlsx` (new jobs added to bottom with `✨ NEW`)
- **Logs**: `launchd_output.log` / `launchd_error.log`
- **Config**: `~/Library/LaunchAgents/com.jobextractor.scheduler.plist`

---

## ⚡ Next Steps

1. **Wait 3 hours** or run manually: `python3 find_jobs.py`
2. **Check logs** to verify it ran: `tail launchd_output.log`
3. **Open Excel** to see new jobs at the bottom
4. **Use Dashboard** to review: `cd dashboard && npm run dev`

---

## 🛑 Troubleshooting

**If not running:**
```bash
# Check if loaded
launchctl list | grep jobextractor

# Reload
launchctl unload ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
launchctl load ~/Library/LaunchAgents/com.jobextractor.scheduler.plist
```

**If errors:**
```bash
# Check error log
cat launchd_error.log
```
