from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from src.api.v1 import jobs, notifications
from src.database import init_db

app = FastAPI(
    title="Clawdbot Automation API",
    description="Backend API for Job Scraping and Resume Tailoring",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    # Initialize database tables
    init_db()

# Mount routers
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["Jobs"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "clawdbot-api"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
