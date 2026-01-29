#!/bin/bash
# Job Applications Automation - Setup Script
# Run this script to set up the project

set -e

echo "========================================"
echo "Job Applications Automation Setup"
echo "========================================"

# Check Python version
echo ""
echo "[1/5] Checking Python version..."
python3 --version || { echo "Python 3 is required. Please install it first."; exit 1; }

# Create virtual environment
echo ""
echo "[2/5] Creating virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created."
else
    echo "Virtual environment already exists."
fi

# Activate virtual environment
echo ""
echo "[3/5] Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo ""
echo "[4/5] Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Install Playwright browsers
echo ""
echo "[5/5] Installing Playwright browsers..."
playwright install chromium

# Create .env if it doesn't exist
echo ""
if [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Edit .env with your configuration:"
    echo "  - CHROME_PROFILE_PATH: Your Chrome profile path"
    echo "  - OPENAI_API_KEY: Your OpenAI API key"
    echo ""
    echo "To find your Chrome profile path:"
    echo "  1. Open Chrome"
    echo "  2. Go to chrome://version/"
    echo "  3. Copy the 'Profile Path' value"
else
    echo ".env file already exists."
fi

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your configuration"
echo "  2. Update resume/master_resume.txt with your resume"
echo "  3. Run: source venv/bin/activate && python main.py"
echo ""
