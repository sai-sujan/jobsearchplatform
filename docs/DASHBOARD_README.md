# Job Search Dashboard - React App

## 🎯 Features

- **Auto-Refresh**: Automatically updates when `jobs_master.xlsx` changes (polls every 5 seconds)
- **Interactive Charts**: Skill score distribution and tier breakdown
- **Real-time Filters**: Filter by tier, minimum score, or search text
- **Beautiful UI**: Modern gradient design with smooth animations
- **Job Cards**: Shows matched skills, scores, and direct apply links

## 🚀 Quick Start

### 1. Start the Backend API

```bash
cd job-applications
python dashboard_api.py
```

The API will run on `http://localhost:8000`

### 2. Start the React App

Open a new terminal:

```bash
cd job-applications/dashboard
npm run dev
```

The dashboard will open on `http://localhost:5173`

### 3. View the Dashboard

Open your browser to `http://localhost:5173`

The dashboard will automatically load your jobs from `jobs_master.xlsx` and refresh whenever the file changes!

## 📊 How It Works

1. **Backend (FastAPI)**:
   - Reads `jobs_master.xlsx` 
   - Serves data via REST API at `/api/jobs`
   - Tracks file modification time
   
2. **Frontend (React)**:
   - Polls backend every 5 seconds
   - Detects when Excel file changes
   - Automatically refreshes data
   - No manual refresh needed!

## 🔄 Auto-Refresh

The dashboard automatically detects when you:
- Run `find_jobs.py` (adds new jobs)
- Run `rescore_jobs.py` (updates scores)
- Manually edit the Excel file

**No need to refresh the browser!** The UI updates automatically.

## 🎨 Features

### Statistics Cards
- Total Jobs
- Good Matches (70%+)
- Perfect Matches (90%+)
- Passed Filters

### Charts
- **Skill Score Distribution**: Bar chart showing score ranges
- **Jobs by Tier**: Doughnut chart showing 🟢🟡🟠🔴 distribution

### Filters
- **Tier Filter**: Show only Perfect/Good/Stretch/Skip jobs
- **Minimum Score**: Set a threshold (e.g., 70 for good matches)
- **Search**: Search by company, title, or skills

### Job Cards
- Color-coded by tier (green border = perfect, yellow = good, etc.)
- Shows skill score, matched skills, location
- ✨ badge for new jobs
- Direct link to apply

## 🛠️ Tech Stack

- **Backend**: FastAPI + Python
- **Frontend**: React + Vite
- **Charts**: Chart.js + react-chartjs-2
- **HTTP**: Axios
- **Styling**: Modern CSS with gradients

## 📝 API Endpoints

- `GET /api/jobs` - Get all jobs with stats
- `GET /api/health` - Health check

## 🔧 Development

### Install Dependencies

Backend:
```bash
pip install fastapi uvicorn pandas openpyxl
```

Frontend:
```bash
cd dashboard
npm install
```

### Run in Development

Terminal 1 (Backend):
```bash
python dashboard_api.py
```

Terminal 2 (Frontend):
```bash
cd dashboard
npm run dev
```

## 🎯 Usage Tips

1. **Keep both servers running** for auto-refresh to work
2. **Run `find_jobs.py`** to add new jobs - dashboard updates automatically
3. **Use filters** to focus on top matches
4. **Click job cards** to open LinkedIn and apply

Enjoy your automated job search! 🚀
