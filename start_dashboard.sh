#!/bin/bash

# Job Dashboard Startup Script
# Runs both backend API and React frontend
export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:/opt/anaconda3/bin

echo "🚀 Starting Job Dashboard..."
echo ""

# Check if we're in the right directory
if [ ! -d "api" ]; then
    echo "❌ Error: api/ directory not found"
    echo "Please run this script from the job-applications directory"
    exit 1
fi

# Start backend API in background
source venv/bin/activate
echo "📡 Starting Backend API on port 5001..."
python -m api.server &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start React frontend
echo "🎨 Starting React Dashboard on port 5173..."
cd dashboard
npm run dev

# When React stops, kill backend too
kill $BACKEND_PID
