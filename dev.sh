#!/bin/bash

# Clawdbot SaaS - Modern Unified Dev Server
# Starts both the FastAPI Backend and the Vite Frontend

echo "🚀 Starting Clawdbot Development Environment..."
echo ""

# 1. Environment Checks
if [ ! -d "venv" ]; then
    echo "❌ Error: Virtual environment (venv) not found."
    echo "Please run: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "⚠️ Warning: .env file not found. Falling back to defaults."
fi

# 2. Start Backend API
echo "📡 Launching Backend API (Port 8000)..."
source venv/bin/activate
# Run in background
python3 -m uvicorn src.main:app --reload --port 8000 &
BACKEND_PID=$!

# 3. Start Frontend Dashboard
echo "🎨 Launching React Dashboard (Port 5174)..."
cd dashboard
npm run dev -- --port 5174 &
FRONTEND_PID=$!

echo ""
echo "✅ System is powering up!"
echo "   - Backend:  http://localhost:8000/health"
echo "   - Frontend: http://localhost:5174"
echo ""
echo "Press Ctrl+C to shut down both servers."

# Keep script running; trap Ctrl+C to kill children
trap "kill $BACKEND_PID $FRONTEND_PID; echo -e '\n🛑 Servers stopped.'; exit" INT
wait
