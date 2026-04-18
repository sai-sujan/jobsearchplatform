.PHONY: help setup install run clean test lint format dev-setup scheduler dashboard

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help:
	@echo "$(BLUE)ClawdBot - Job Automation$(NC)"
	@echo "$(YELLOW)Available commands:$(NC)"
	@echo "  $(GREEN)setup$(NC)           - Complete setup (venv + install)"
	@echo "  $(GREEN)install$(NC)         - Install dependencies"
	@echo "  $(GREEN)run$(NC)             - Run job search automation"
	@echo "  $(GREEN)search$(NC)          - Run quick job search"
	@echo "  $(GREEN)rescore$(NC)         - Re-score all jobs"
	@echo "  $(GREEN)analyze$(NC)         - Analyze job search results"
	@echo "  $(GREEN)clean-db$(NC)        - Clean & deduplicate Excel"
	@echo "  $(GREEN)scheduler$(NC)       - Start scheduled automation"
	@echo "  $(GREEN)dashboard$(NC)       - Start web dashboard"
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  $(GREEN)dev-setup$(NC)       - Setup dev environment (+ testing)"
	@echo "  $(GREEN)test$(NC)            - Run tests"
	@echo "  $(GREEN)lint$(NC)            - Run linters"
	@echo "  $(GREEN)format$(NC)          - Format code"
	@echo "  $(GREEN)check$(NC)           - Lint + type check"
	@echo ""
	@echo "$(YELLOW)Maintenance:$(NC)"
	@echo "  $(GREEN)clean$(NC)           - Clean temporary files"
	@echo "  $(GREEN)backup$(NC)          - Create Excel backup"
	@echo "  $(GREEN)logs$(NC)            - Show recent logs"

# Setup
setup: venv install
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "$(BLUE)Next steps:$(NC)"
	@echo "  1. Edit .env with your configuration"
	@echo "  2. Update resume/master_resume.txt"
	@echo "  3. Run: make run"

venv:
	@echo "$(YELLOW)Creating virtual environment...$(NC)"
	python3 -m venv venv
	@echo "$(GREEN)✓ Virtual environment created$(NC)"
	@echo "$(YELLOW)Activate with: source venv/bin/activate$(NC)"

install: venv
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	./venv/bin/pip install -q --upgrade pip
	./venv/bin/pip install -r requirements.txt
	./venv/bin/playwright install chromium
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

dev-setup: install
	@echo "$(YELLOW)Setting up development environment...$(NC)"
	./venv/bin/pip install pytest pytest-cov black flake8 mypy
	@echo "$(GREEN)✓ Dev tools installed$(NC)"

# Running Jobs
run:
	@echo "$(BLUE)Starting job search automation...$(NC)"
	./venv/bin/python main.py

search:
	@echo "$(BLUE)Starting quick job search...$(NC)"
	./venv/bin/python find_jobs.py

batch:
	@echo "$(BLUE)Starting batch automation...$(NC)"
	./venv/bin/python run_automation.py

scheduler:
	@echo "$(BLUE)Starting scheduled automation...$(NC)"
	./venv/bin/python scheduler.py

# Maintenance Tasks
rescore:
	@echo "$(YELLOW)Re-scoring all jobs...$(NC)"
	./venv/bin/python scripts/maintenance/rescore_jobs.py

analyze:
	@echo "$(YELLOW)Analyzing results...$(NC)"
	./venv/bin/python scripts/analysis/analyze_batch.py

clean-db:
	@echo "$(YELLOW)Cleaning master Excel...$(NC)"
	./venv/bin/python scripts/maintenance/clean_master_excel.py

mark:
	@echo "$(YELLOW)Marking jobs...$(NC)"
	./venv/bin/python scripts/maintenance/mark_applied.py

backup:
	@echo "$(YELLOW)Creating backup...$(NC)"
	cp data/jobs_master.xlsx data/backups/jobs_master_backup_$$(date +%s).xlsx
	@echo "$(GREEN)✓ Backup created$(NC)"

logs:
	@tail -f logs/scraper.log

# Development
test:
	@echo "$(YELLOW)Running tests...$(NC)"
	./venv/bin/pytest -v

test-cov:
	@echo "$(YELLOW)Running tests with coverage...$(NC)"
	./venv/bin/pytest --cov=src --cov-report=html

lint:
	@echo "$(YELLOW)Running linters...$(NC)"
	./venv/bin/flake8 src/ --max-line-length=100 --ignore=E203,E266,E501,W503
	@echo "$(GREEN)✓ Linting complete$(NC)"

format:
	@echo "$(YELLOW)Formatting code...$(NC)"
	./venv/bin/black src/ --line-length=100
	@echo "$(GREEN)✓ Code formatted$(NC)"

check: lint
	@echo "$(YELLOW)Type checking...$(NC)"
	./venv/bin/mypy src/ --ignore-missing-imports
	@echo "$(GREEN)✓ Type check complete$(NC)"

# Dashboard
dashboard:
	@echo "$(BLUE)Starting dashboard...$(NC)"
	cd dashboard && npm install && npm run dev

# Cleaning
clean:
	@echo "$(YELLOW)Cleaning up...$(NC)"
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name htmlcov -exec rm -rf {} + 2>/dev/null || true
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: clean
	@echo "$(YELLOW)Removing virtual environment...$(NC)"
	rm -rf venv/
	@echo "$(GREEN)✓ Full cleanup complete$(NC)"

# Check environment
check-env:
	@echo "$(YELLOW)Checking environment...$(NC)"
	@which python3 > /dev/null && echo "$(GREEN)✓ Python3 installed$(NC)" || echo "$(RED)✗ Python3 not found$(NC)"
	@test -f .env && echo "$(GREEN)✓ .env configured$(NC)" || echo "$(RED)✗ .env not found$(NC)"
	@test -f resume/master_resume.txt && echo "$(GREEN)✓ Resume configured$(NC)" || echo "$(RED)✗ Resume not found$(NC)"
	@test -d venv && echo "$(GREEN)✓ Virtual environment exists$(NC)" || echo "$(YELLOW)→ Run: make setup$(NC)"

# Default
.DEFAULT_GOAL := help
