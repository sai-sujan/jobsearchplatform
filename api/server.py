"""
FastAPI Backend for Job Dashboard
Watches jobs_master.xlsx and serves data via REST API
"""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pandas as pd
import json
import hashlib
from datetime import datetime
from pathlib import Path
import os
import shutil

from src.settings import settings
from src.utils import sanitize_job_title
from src.database import init_db
from api.auth import router as auth_router
from api.deps import get_current_user, require_csrf
from api.internal import router as internal_router
from api.jobs import router as jobs_router
from api.onboarding import router as onboarding_router
from src.models import User

# Initialize database
init_db()

app = FastAPI()

# Include routers
app.include_router(auth_router)
app.include_router(internal_router)
app.include_router(onboarding_router)
app.include_router(jobs_router)

# Enable CORS for React frontend (all localhost ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EXCEL_FILE = str(settings.MASTER_EXCEL)


def reject_legacy_endpoint(_user: User = Depends(get_current_user)):
    """Block deprecated legacy endpoints from the new user-facing product."""
    raise HTTPException(status_code=410, detail="Legacy endpoint retired. Use the user web app APIs instead.")


def build_job_id(job: dict, fallback_index: int) -> str:
    """Build a stable-ish identifier from immutable job fields."""
    source = "|".join([
        str(job.get("Job_Link", "") or ""),
        str(job.get("Company", "") or ""),
        sanitize_job_title(str(job.get("Job_Title", "") or "")),
        str(job.get("Posting_Date", "") or ""),
        str(job.get("Date_Added", "") or ""),
        str(fallback_index),
    ])
    digest = hashlib.sha1(source.encode("utf-8")).hexdigest()[:16]
    return f"job_{digest}"


def infer_job_source(job_link: str) -> str:
    link = (job_link or "").lower()
    if "linkedin." in link:
        return "LinkedIn"
    if "indeed." in link:
        return "Indeed"
    if "glassdoor." in link:
        return "Glassdoor"
    return "Web"

def cleanup_duplicates():
    """Auto-cleanup duplicate jobs from Excel on startup"""
    if not os.path.exists(EXCEL_FILE):
        return

    try:
        # Use first sheet (index 0) to be safe
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)
        original_count = len(df)

        # Create dedup key: use Link if available, else Company-Title
        df['_DedupKey'] = df.apply(
            lambda x: x['Job_Link'] if pd.notna(x.get('Job_Link')) and str(x.get('Job_Link')).strip() != ''
            else f"{x.get('Company', '')}-{x.get('Job_Title', '')}",
            axis=1
        )

        # Remove duplicates, keep first
        df_clean = df.drop_duplicates(subset=['_DedupKey'], keep='first')
        df_clean = df_clean.drop(columns=['_DedupKey'])

        removed = original_count - len(df_clean)
        if removed > 0:
            df_clean.to_excel(EXCEL_FILE, sheet_name=settings.SHEET_NAME, index=False)
            print(f"[CLEANUP] Removed {removed} duplicate jobs. Now: {len(df_clean)} unique jobs.")
        else:
            print(f"[CLEANUP] No duplicates found. {len(df_clean)} jobs.")
    except Exception as e:
        print(f"[CLEANUP ERROR] {e}")

# Run cleanup on startup
cleanup_duplicates()

def get_file_modified_time():
    """Get last modified time of Excel file"""
    if os.path.exists(EXCEL_FILE):
        return os.path.getmtime(EXCEL_FILE)
    return None

@app.get("/api/legacy/jobs")
def get_legacy_jobs(_legacy_block: None = Depends(reject_legacy_endpoint)):
    """Get all jobs from Excel file"""
    try:
        if not os.path.exists(EXCEL_FILE):
            return JSONResponse(
                status_code=404,
                content={"error": "jobs_master.xlsx not found. Run find_jobs.py first."}
            )
        
        # Read Excel file
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)
        
        # Clean job titles and remove common LinkedIn duplication artifacts.
        if 'Job_Title' in df.columns:
            df['Job_Title'] = df['Job_Title'].fillna('').map(sanitize_job_title)
        
        # Remove exact duplicate jobs (same Link)
        # Remove exact duplicate jobs (same Link, or same Company+Title)
        # Handle missing links by checking Company+Title
        df['DedupKey'] = df.apply(lambda x: x['Job_Link'] if pd.notna(x.get('Job_Link')) and str(x.get('Job_Link')).strip() != '' else f"{x.get('Company')}-{x.get('Job_Title')}", axis=1)
        df = df.drop_duplicates(subset=['DedupKey'], keep='first')
        
        # Convert to dict and handle NaN values
        jobs = df.to_dict('records')
        
        # Add row index to each job for tracking
        for idx, job in enumerate(jobs):
            job['_rowIndex'] = idx
            job['job_id'] = build_job_id(job, idx)
            job['Source'] = infer_job_source(job.get('Job_Link', ''))
            
            # Load analysis data from file if available
            analysis_path = job.get('Analysis_File')
            if pd.notna(analysis_path) and isinstance(analysis_path, str) and analysis_path.strip():
                # Resolve relative paths against analysis_results directory
                if not os.path.isabs(analysis_path):
                    analysis_path = os.path.join(str(settings.DATA_DIR), 'analysis_results', analysis_path)
                
                if os.path.exists(analysis_path):
                    try:
                        with open(analysis_path, 'r') as f:
                            analysis_data = json.load(f)
                            job['Analysis Data'] = analysis_data
                            job['ats_score'] = analysis_data.get('ats_score', 'N/A')
                    except (json.JSONDecodeError, IOError):
                        job['Analysis Data'] = None
                else:
                    job['Analysis Data'] = None
        
        # Clean up data
        # Clean up data and map to frontend expectations
        for job in jobs:
            # Map standardized fields to Frontend fields
            job['Title'] = job.get('Job_Title', '')
            job['Company'] = job.get('Company', '')
            job['Link'] = job.get('Job_Link', '')
            job['Location'] = job.get('Location', '')
            job['Date Found'] = job.get('Date_Added', '')
            job['Search Query'] = job.get('Search_Query', '')
            job['Source'] = job.get('Source', 'Web')
            
            # Map Score
            score = job.get('Keywords_Matching_Score', 0)
            if pd.isna(score): score = 0
            job['Skill Score'] = int(score)
            
            # Compute Tier
            if score >= 90:
                job['Tier'] = '🟢 Perfect Match'
            elif score >= 70:
                job['Tier'] = '🟡 Good Match'
            elif score >= 50:
                job['Tier'] = '🟠 Stretch Goal'
            else:
                job['Tier'] = '🔴 Skip'
                
            # Compute New Status - job is NEW if it doesn't have analysis data
            has_analysis = job.get('Analysis Data') is not None
            analysis_file = job.get('Analysis_File', '')
            has_analysis_file = pd.notna(analysis_file) and str(analysis_file).strip() != ''

            if not has_analysis and not has_analysis_file:
                job['New'] = '✨ NEW'
            else:
                job['New'] = ''
            
            # Extract Matched Skills from Analysis Data
            matched_skills = []
            if job.get('Analysis Data'):
                 tech_stack = job['Analysis Data'].get('tech_stack', {})
                 # Flatten values
                 for cat, skills in tech_stack.items():
                     if isinstance(skills, list):
                         matched_skills.extend(skills)
            
            job['Matched Skills'] = ', '.join(matched_skills[:5]) # Top 5 skills
            
            # Map Description for Sidebar
            job['Job Description'] = job.get('Job_Description', '')
            
            # Map Resume Path
            job['Resume Path'] = job.get('Resume Path', '')
            
            # Map Special Interest and Notes
            val = job.get('Special_Interest', False)
            job['Special Interest'] = bool(val) if pd.notna(val) else False
            
            notes = job.get('Notes', '')
            job['Notes'] = str(notes) if pd.notna(notes) else ''
            
            # Legacy/Fallback keys for safety (though Resume Path is main one)
            if 'Resume Path' in job and pd.notna(job['Resume Path']):
                 job['pdf_path'] = job['Resume Path']

            for key, value in job.items():
                if pd.isna(value):
                    job[key] = '' if isinstance(value, str) else 0
        
        # Calculate statistics
        total_jobs = len(jobs)
        yes_jobs = len([j for j in jobs if j.get('Verdict') == 'YES'])
        good_matches = len([j for j in jobs if 70 <= j.get('Keywords_Matching_Score', 0) < 90])
        perfect_matches = len([j for j in jobs if j.get('Keywords_Matching_Score', 0) >= 90])
        
        return {
            'jobs': jobs,
            'stats': {
                'total': total_jobs,
                'yes_verdict': yes_jobs,
                'good_matches': good_matches,
                'perfect_matches': perfect_matches,
                'last_updated': datetime.fromtimestamp(get_file_modified_time()).strftime('%Y-%m-%d %H:%M:%S')
            },
            'last_modified': get_file_modified_time()
        }
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "excel_exists": os.path.exists(EXCEL_FILE),
        "last_modified": get_file_modified_time()
    }

# Request model for updating analysis
class UpdateAnalysisRequest(BaseModel):
    row_index: int
    ats_score: int = None
    location: str
    tech_stack: dict
    suggested_tech_stack: dict = {}
    points: list

@app.post("/api/update-analysis")
def update_analysis(request: UpdateAnalysisRequest):
    """Update analysis JSON for a specific job"""
    try:
        # Read Excel file
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)

        if request.row_index >= len(df):
            raise HTTPException(status_code=400, detail="Invalid row index")

        # Get analysis file path
        if 'Analysis_File' not in df.columns:
             df['Analysis_File'] = ''
             
        analysis_file = df.at[request.row_index, 'Analysis_File']

        # Determine safe company name
        company = df.at[request.row_index, 'Company']
        if pd.isna(company):
            company = "Unknown"
        import re
        safe_company = re.sub(r'[^\w\s-]', '', str(company)).replace(' ', '_')

        # Resolve relative paths against analysis_results directory
        if pd.notna(analysis_file) and isinstance(analysis_file, str) and str(analysis_file).strip():
            if not os.path.isabs(analysis_file):
                analysis_file = os.path.join(str(settings.DATA_DIR), 'analysis_results', analysis_file)
        else:
            # Generate a new filename if it's completely missing
            new_filename = f"{request.row_index}_{safe_company}.json"
            analysis_file = os.path.join(str(settings.DATA_DIR), 'analysis_results', new_filename)
            # Update Excel with the new filename (relative path to maintain consistency)
            df.at[request.row_index, 'Analysis_File'] = new_filename
            df.to_excel(EXCEL_FILE, sheet_name=settings.SHEET_NAME, index=False)

        # If file doesn't exist on disk yet, initialize it with default structure
        if not os.path.exists(analysis_file):
            os.makedirs(os.path.dirname(analysis_file), exist_ok=True)
            analysis_data = {}
        else:
            # Read current analysis from file
            with open(analysis_file, 'r') as f:
                analysis_data = json.load(f)

            # Backup original if not already backed up
            analysis_path = Path(analysis_file)
            backup_file = analysis_path.with_suffix('.original.json')
            if not backup_file.exists():
                shutil.copy2(analysis_file, backup_file)

        # Update fields
        if hasattr(request, 'ats_score') and request.ats_score is not None:
             analysis_data['ats_score'] = request.ats_score
        analysis_data['location'] = request.location
        analysis_data['tech_stack'] = request.tech_stack
        analysis_data['suggested_tech_stack'] = request.suggested_tech_stack
        analysis_data['points'] = request.points

        # Save updated analysis back to file
        with open(analysis_file, 'w') as f:
            json.dump(analysis_data, f, indent=2)

        # No need to update Excel - the file path stays the same
        
        return {"success": True, "message": "Analysis updated successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AITailorRequest(BaseModel):
    job_description: str
    current_location: str
    current_tech_stack: dict
    current_points: list

import random
from groq import Groq

def get_groq_client():
    if not settings.GROQ_API_KEYS:
        raise HTTPException(status_code=500, detail="GROQ_API_KEYS not configured in .env")
    # Randomly select an API key to load balance requests
    api_key = random.choice(settings.GROQ_API_KEYS)
    return Groq(api_key=api_key)

@app.post("/api/ai-tailor-resume")
def ai_tailor_resume(request: AITailorRequest):
    """Use Groq LLM to intelligently tailor location, tech stack, and resume points based on the JD."""
    if not settings.GROQ_API_KEYS:
        raise HTTPException(status_code=500, detail="GROQ_API_KEYS not configured in .env")
        
    from src.evaluation.tailor_service import generate_tailored_resume_data, TailorServiceError
    
    try:
        tailored_data = generate_tailored_resume_data(request.job_description)
        return {
            "success": True, 
            "tailored_data": tailored_data
        }
    except TailorServiceError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Request model for updating status
class UpdateStatusRequest(BaseModel):
    row_index: int
    status: str

@app.post("/api/update-status", dependencies=[Depends(require_csrf)])
def update_status(request: UpdateStatusRequest, _legacy_block: None = Depends(reject_legacy_endpoint)):
    """Update job status in Excel"""
    try:
        # Read Excel file
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)

        if request.row_index >= len(df):
            raise HTTPException(status_code=400, detail="Invalid row index")
        
        # Add Status column if missing
        if 'Status' not in df.columns:
            df['Status'] = 'not_applied'

        # Update status
        df.at[request.row_index, 'Status'] = request.status

        # Save back to Excel
        df.to_excel(EXCEL_FILE, sheet_name=settings.SHEET_NAME, index=False)

        return {"success": True, "message": "Status updated successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateSpecialInterestRequest(BaseModel):
    row_index: int
    special_interest: bool

@app.post("/api/update-special-interest", dependencies=[Depends(require_csrf)])
def update_special_interest(request: UpdateSpecialInterestRequest, _legacy_block: None = Depends(reject_legacy_endpoint)):
    """Update job special interest flag in Excel"""
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)
        if request.row_index >= len(df):
            raise HTTPException(status_code=400, detail="Invalid row index")
        
        if 'Special_Interest' not in df.columns:
            df['Special_Interest'] = False

        df.at[request.row_index, 'Special_Interest'] = request.special_interest
        df.to_excel(EXCEL_FILE, sheet_name=settings.SHEET_NAME, index=False)
        return {"success": True, "message": "Special Interest updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateNotesRequest(BaseModel):
    row_index: int
    notes: str

@app.post("/api/update-notes", dependencies=[Depends(require_csrf)])
def update_notes(request: UpdateNotesRequest, _legacy_block: None = Depends(reject_legacy_endpoint)):
    """Update job notes in Excel"""
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)
        if request.row_index >= len(df):
            raise HTTPException(status_code=400, detail="Invalid row index")
        
        if 'Notes' not in df.columns:
            df['Notes'] = ''

        df.at[request.row_index, 'Notes'] = request.notes
        df.to_excel(EXCEL_FILE, sheet_name=settings.SHEET_NAME, index=False)
        return {"success": True, "message": "Notes updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GenerateResumeRequest(BaseModel):
    row_index: int
    company_name: str
    location: str
    tech_stack: dict
    points: list

@app.post("/api/generate-resume")
def generate_resume(request: GenerateResumeRequest):
    """Generate a tailored resume PDF"""
    try:
        import subprocess
        import tempfile
        
        # Sanitize function to fix LaTeX special characters
        def sanitize_latex_string(text):
            """Replace problematic Unicode characters with LaTeX-safe alternatives"""
            if not isinstance(text, str):
                return text
            # Replace en-dash and em-dash with hyphen
            text = text.replace('–', '-').replace('—', '-')
            # Replace curly quotes with straight quotes
            text = text.replace('“', '"').replace('”', '"')
            text = text.replace('‘', "'").replace('’', "'")
            # Handle LaTeX special characters safely if they aren't already handled
            import re
            text = text.replace('…', '...')
            text = text.replace('~', r'\textasciitilde{}')
            text = re.sub(r'(?<!\\)%', r'\\%', text)
            
            return text
        
        def sanitize_data(data):
            """Recursively sanitize all strings in data structure"""
            if isinstance(data, dict):
                return {k: sanitize_data(v) for k, v in data.items()}
            elif isinstance(data, list):
                return [sanitize_data(item) for item in data]
            elif isinstance(data, str):
                return sanitize_latex_string(data)
            return data
        
        # Create temp JSON with sanitized resume data
        resume_data = {
            "location": request.location,
            "tech_stack": request.tech_stack,
            "points": request.points
        }
        
        # Sanitize all data
        resume_data = sanitize_data(resume_data)
        
        # Write to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(resume_data, f, indent=2)
            temp_json_path = f.name
        
        # Run Python resume generator script
        script_path = settings.BASE_DIR / 'src' / 'resume' / 'single_generator.py'
        if not script_path.exists():
            raise HTTPException(status_code=404, detail="Resume generator script not found")

        # Use venv Python
        venv_python = settings.VENV_PYTHON
        if not venv_python.exists():
            venv_python = 'python3'  # Fallback to system Python
        
        # Prepare environment with extended PATH
        import os as os_module
        env = os_module.environ.copy()
        # Add common locations where tectonic might be installed
        additional_paths = [
            '/opt/homebrew/bin',
            '/usr/local/bin',
            os_module.path.expanduser('~/.cargo/bin'),
            '/opt/anaconda3/bin'
        ]
        env['PATH'] = ':'.join(additional_paths) + ':' + env.get('PATH', '')
        
        # Execute script with extended PATH
        result = subprocess.run(
            [str(venv_python), str(script_path), temp_json_path, request.company_name],
            capture_output=True,
            text=True,
            timeout=60,
            env=env
        )
        
        # Clean up temp file
        Path(temp_json_path).unlink()
        
        # Log the result for debugging
        print(f"[DEBUG] Script returncode: {result.returncode}")
        print(f"[DEBUG] Script stdout: {result.stdout}")
        print(f"[DEBUG] Script stderr: {result.stderr}")
        
        if result.returncode != 0:
            error_msg = result.stderr if result.stderr else result.stdout
            raise HTTPException(
                status_code=500, 
                detail=f"Resume generation failed (code {result.returncode}): {error_msg}"
            )
        
        # Determine PDF filename with timestamp versioning
        from datetime import datetime
        import re
        # Match the same sanitization as single_resume_generator.py
        safe_company = re.sub(r'[^\w\s-]', '', request.company_name).replace(' ', '_')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        pdf_filename = f"SujanDora_resume_{safe_company}_v{timestamp}.pdf"

        # The script generates without timestamp, so we need to rename it
        original_pdf = settings.RESUMES_DIR / f"SujanDora_resume_{safe_company}.pdf"
        versioned_pdf = settings.RESUMES_DIR / pdf_filename
        
        if not original_pdf.exists():
            raise HTTPException(status_code=500, detail="PDF was not generated")
        
        # Rename to versioned filename
        original_pdf.rename(versioned_pdf)
        
        # Update Excel with PDF path
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)

        # Add Resume Path column if it doesn't exist
        if 'Resume Path' not in df.columns:
            df['Resume Path'] = ''

        # Store versioned path (or append to existing paths)
        current_path = df.at[request.row_index, 'Resume Path']
        if pd.isna(current_path) or current_path == '':
            df.at[request.row_index, 'Resume Path'] = str(versioned_pdf)
        else:
            # Append new version (latest first)
            df.at[request.row_index, 'Resume Path'] = f"{versioned_pdf}; {current_path}"

        df.to_excel(EXCEL_FILE, sheet_name=settings.SHEET_NAME, index=False)

        # Return success with PDF URL
        return {
            "success": True,
            "pdf_url": f"/api/download-resume/{pdf_filename}",
            "pdf_path": str(versioned_pdf)
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Resume generation timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download-resume/{filename}")
def download_resume(filename: str):
    """Download generated resume PDF"""
    from fastapi.responses import FileResponse

    requested = Path(filename)
    if requested.name != filename or ".." in requested.parts:
        raise HTTPException(status_code=404, detail="PDF not found")

    base_dir = settings.RESUMES_DIR.resolve()
    pdf_path = (base_dir / filename).resolve()
    try:
        pdf_path.relative_to(base_dir)
    except ValueError:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")

    return FileResponse(
        path=pdf_path,
        media_type='application/pdf',
        filename=filename,
        content_disposition_type='inline'
    )

@app.delete("/api/delete-job/{row_index}")
def delete_job(row_index: int):
    """Delete a job from the Excel file"""
    try:
        if not os.path.exists(EXCEL_FILE):
             raise HTTPException(status_code=404, detail="Excel file not found")
             
        # Read Excel file
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)
        
        if row_index < 0 or row_index >= len(df):
            raise HTTPException(status_code=400, detail="Invalid row index")
            
        # Drop the row
        df = df.drop(index=row_index)
        
        # Save back to Excel
        df.to_excel(EXCEL_FILE, sheet_name=settings.SHEET_NAME, index=False)

        return {"success": True, "message": "Job deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/backup")
def create_backup():
    """Create a manual backup of the Excel file"""
    try:
        if not os.path.exists(EXCEL_FILE):
            raise HTTPException(status_code=404, detail="Excel file not found")

        # Create backups directory
        backup_dir = settings.BACKUPS_DIR
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Create timestamped backup
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"jobs_master_manual_backup_{timestamp}.xlsx"
        backup_path = backup_dir / backup_filename

        # Copy the file
        shutil.copy2(EXCEL_FILE, backup_path)

        # Get list of all backups
        backups = sorted(backup_dir.glob("jobs_master_*.xlsx"), reverse=True)
        backup_list = [{"name": b.name, "size": b.stat().st_size, "created": datetime.fromtimestamp(b.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")} for b in backups[:10]]

        return {
            "success": True,
            "message": f"Backup created: {backup_filename}",
            "backup_path": str(backup_path),
            "backups": backup_list
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/backups")
def list_backups():
    """List all available backups"""
    try:
        backup_dir = settings.BACKUPS_DIR
        if not backup_dir.exists():
            return {"backups": []}

        backups = sorted(backup_dir.glob("jobs_master_*.xlsx"), reverse=True)
        backup_list = [{"name": b.name, "size": b.stat().st_size, "created": datetime.fromtimestamp(b.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")} for b in backups]

        return {"backups": backup_list}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CONFIGURATION ENDPOINTS ====================

@app.get("/api/config")
def get_config(_legacy_block: None = Depends(reject_legacy_endpoint)):
    """Get all configuration"""
    try:
        config_data = {}

        # Get .env settings
        env_path = settings.BASE_DIR / '.env'
        if env_path.exists():
            with open(env_path, 'r') as f:
                config_data['env'] = f.read()
        else:
            config_data['env'] = ''

        # Get job_config.json
        job_config_path = settings.CONFIG_DIR / 'job_config.json'
        if job_config_path.exists():
            with open(job_config_path, 'r') as f:
                config_data['job_config'] = json.load(f)
        else:
            config_data['job_config'] = {}

        # Get company blacklist
        blacklist_path = settings.CONFIG_DIR / 'company_blacklist.txt'
        if blacklist_path.exists():
            with open(blacklist_path, 'r') as f:
                config_data['company_blacklist'] = f.read()
        else:
            config_data['company_blacklist'] = ''

        # Get skills
        skills_path = settings.CONFIG_DIR / 'your_skills.txt'
        if skills_path.exists():
            with open(skills_path, 'r') as f:
                config_data['your_skills'] = f.read()
        else:
            config_data['your_skills'] = ''

        # Get resume
        resume_path = Path(settings.RESUME_PATH)
        if resume_path.exists():
            with open(resume_path, 'r') as f:
                config_data['resume'] = f.read()
        else:
            config_data['resume'] = ''

        return config_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateConfigRequest(BaseModel):
    config_type: str  # 'env', 'job_config', 'company_blacklist', 'your_skills', 'resume'
    content: str = None  # For text files
    data: dict = None  # For JSON files

@app.post("/api/config", dependencies=[Depends(require_csrf)])
def update_config(request: UpdateConfigRequest, _legacy_block: None = Depends(reject_legacy_endpoint)):
    """Update configuration files"""
    try:
        if request.config_type == 'env':
            env_path = settings.BASE_DIR / '.env'
            with open(env_path, 'w') as f:
                f.write(request.content)
            return {"success": True, "message": "Environment configuration updated"}

        elif request.config_type == 'job_config':
            job_config_path = settings.CONFIG_DIR / 'job_config.json'
            with open(job_config_path, 'w') as f:
                json.dump(request.data, f, indent=2)
            return {"success": True, "message": "Job configuration updated"}

        elif request.config_type == 'company_blacklist':
            blacklist_path = settings.CONFIG_DIR / 'company_blacklist.txt'
            with open(blacklist_path, 'w') as f:
                f.write(request.content)
            return {"success": True, "message": "Company blacklist updated"}

        elif request.config_type == 'your_skills':
            skills_path = settings.CONFIG_DIR / 'your_skills.txt'
            with open(skills_path, 'w') as f:
                f.write(request.content)
            return {"success": True, "message": "Your skills updated"}

        elif request.config_type == 'resume':
            resume_path = Path(settings.RESUME_PATH)
            with open(resume_path, 'w') as f:
                f.write(request.content)
            return {"success": True, "message": "Resume updated"}

        else:
            raise HTTPException(status_code=400, detail=f"Unknown config type: {request.config_type}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.API_HOST, port=settings.API_PORT)
