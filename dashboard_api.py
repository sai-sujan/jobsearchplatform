"""
FastAPI Backend for Job Dashboard
Watches jobs_master.xlsx and serves data via REST API
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pandas as pd
import json
from datetime import datetime
from pathlib import Path
import os
import shutil

app = FastAPI()

# Enable CORS for React frontend (all localhost ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EXCEL_FILE = "jobs_master.xlsx"

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
            df_clean.to_excel(EXCEL_FILE, sheet_name='Sheet1', index=False)
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

@app.get("/api/jobs")
def get_jobs():
    """Get all jobs from Excel file"""
    try:
        if not os.path.exists(EXCEL_FILE):
            return JSONResponse(
                status_code=404,
                content={"error": "jobs_master.xlsx not found. Run find_jobs.py first."}
            )
        
        # Read Excel file
        df = pd.read_excel(EXCEL_FILE, sheet_name=0)
        
        # Clean job titles - remove newlines and extra whitespace
        if 'Job_Title' in df.columns:
            df['Job_Title'] = df['Job_Title'].str.replace('\n', ' - ', regex=False).str.strip()
        
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
            
            # Load analysis data from file if available
            analysis_path = job.get('Analysis_File')
            if pd.notna(analysis_path) and isinstance(analysis_path, str) and os.path.exists(analysis_path):
                try:
                    with open(analysis_path, 'r') as f:
                        analysis_data = json.load(f)
                        job['Analysis Data'] = analysis_data
                        # Flatten for table view if needed, or keep nested
                        job['ats_score'] = analysis_data.get('ats_score', 'N/A')
                except:
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
            
            # Legacy/Fallback keys for safety (though Resume Path is main one)
            if 'Resume Path' in job and pd.notna(job['Resume Path']):
                 job['pdf_path'] = job['Resume Path']

            for key, value in job.items():
                if pd.isna(value):
                    job[key] = '' if isinstance(value, str) else 0
        
        # Calculate statistics
        total_jobs = len(jobs)
        yes_jobs = len([j for j in jobs if j.get('Verdict') == 'YES'])
        good_matches = len([j for j in jobs if j.get('Keywords_Matching_Score', 0) >= 70])
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
             raise HTTPException(status_code=500, detail="Analysis_File column missing")
             
        analysis_file = df.at[request.row_index, 'Analysis_File']

        if pd.isna(analysis_file) or not os.path.exists(analysis_file):
            raise HTTPException(status_code=404, detail="No analysis file found for this job")
        
        # Read current analysis from file
        with open(analysis_file, 'r') as f:
            analysis_data = json.load(f)

        # Backup original if not already backed up
        analysis_path = Path(analysis_file)
        backup_file = analysis_path.with_suffix('.original.json')
        if not backup_file.exists():
            shutil.copy2(analysis_file, backup_file)

        # Update fields
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

# Request model for updating status
class UpdateStatusRequest(BaseModel):
    row_index: int
    status: str

@app.post("/api/update-status")
def update_status(request: UpdateStatusRequest):
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
        df.to_excel(EXCEL_FILE, sheet_name='Sheet1', index=False)
        
        return {"success": True, "message": "Status updated successfully"}
        
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
            # Replace other problematic characters
            text = text.replace('…', '...')
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
        script_path = Path('single_resume_generator.py')
        if not script_path.exists():
            raise HTTPException(status_code=404, detail="Resume generator script not found")
        
        # Use venv Python
        venv_python = Path('venv/bin/python3')
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
        safe_company = request.company_name.replace(' ', '_').replace('/', '_')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        pdf_filename = f"SujanDora_resume_{safe_company}_v{timestamp}.pdf"
        
        # The script generates without timestamp, so we need to rename it
        original_pdf = Path('resumes') / f"SujanDora_resume_{safe_company}.pdf"
        versioned_pdf = Path('resumes') / pdf_filename
        
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

        df.to_excel(EXCEL_FILE, sheet_name='Sheet1', index=False)
        
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
    
    pdf_path = Path('resumes') / filename
    
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
        df.to_excel(EXCEL_FILE, sheet_name='Sheet1', index=False)
        
        return {"success": True, "message": "Job deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
