# Job Application Tracker - Quick Guide

## 🎯 Problem Solved
The web dashboards are **read-only** and can't save "Applied" status back to Excel.

This script lets you **mark jobs as Applied** and **saves directly to Excel**.

---

## 🚀 How to Use

### Start the Tracker
```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications
python3 mark_applied.py
```

### Interactive Commands

**Mark jobs as Applied:**
```
👉 Your choice: 5,12,18
```
(Marks jobs #5, #12, and #18 as Applied)

**Show only high-quality matches:**
```
👉 Your choice: filter 90
```
(Shows only 90%+ matches)

**Show only new jobs:**
```
👉 Your choice: new
```
(Shows jobs marked with ✨ NEW)

**Save and exit:**
```
👉 Your choice: save
```

**Exit without saving:**
```
👉 Your choice: quit
```

---

## 💡 Features

✅ **Auto-saves** after each update  
✅ **Shows job details**: Score, Company, Title  
✅ **Filters**: By score (70%+, 90%+) or new jobs  
✅ **Confirmation** before marking  
✅ **Updates all Excel sheets** (All Jobs, Top Matches, Applied)

---

## 📊 Typical Workflow

1. **Run the tracker**: `python3 mark_applied.py`
2. **Review the list** of unapplied jobs
3. **Mark jobs** you've applied to: `5,12,18`
4. **Confirm** the changes
5. **Repeat** or type `save` to exit

The Excel file is updated immediately after each change!

---

## 🔄 Integration with Dashboard

After marking jobs as Applied:
1. **Refresh the web dashboard** (F5)
2. Jobs marked "Applied" will show in the "Applied" tab
3. They'll be filtered out from the main view (if configured)

---

## 📝 Example Session

```
📋 49 Jobs Available to Apply:

  0. [ 95%] 🟢 Excellent  Hydrogen Group              | AI/ML Engineer
  1. [ 93%] 🟢 Excellent  EvenUp                      | Machine Learning Engineer ✨
  5. [ 88%] 🟢 Excellent  Doppel                      | ML Engineer - Detection
...

👉 Your choice: 1,5

📝 Marking 2 jobs as Applied:
  ✓ EvenUp - Machine Learning Engineer
  ✓ Doppel - ML Engineer - Detection

Confirm? (y/n): y
✅ Marked 2 jobs as Applied!
✅ Excel file updated: jobs_master.xlsx
```

---

## 🆘 Troubleshooting

**Excel file is locked:**
- Close Excel before running the script

**Changes not showing in dashboard:**
- Refresh the browser (F5)

**Can't find jobs to mark:**
- Use `filter 90` to narrow down
- Use `new` to see only new jobs
