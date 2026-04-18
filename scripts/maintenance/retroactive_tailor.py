import os
import sys
import pandas as pd
import json
import time

# Add parent directory to path to allow importing src
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.settings import settings
from src.evaluation.tailor_service import generate_tailored_resume_data, TailorServiceError

def main():
    print("="*60)
    print("  🚀 RETROACTIVE AI RESUME TAILORING")
    print("     (Processing all jobs missing Analysis Data)")
    print("="*60)
    
    excel_path = settings.MASTER_EXCEL
    if not os.path.exists(excel_path):
        print(f"[ERROR] Master Excel not found at {excel_path}")
        return
        
    try:
        df = pd.read_excel(excel_path, sheet_name="All Jobs")
        print(f"[INFO] Loaded {len(df)} jobs from {excel_path}")
    except Exception as e:
        print(f"[ERROR] Failed to load Excel: {e}")
        return

    # Ensure Analysis_File column exists
    if 'Analysis_File' not in df.columns:
        df['Analysis_File'] = ''

    # Filter for jobs that don't have analysis file OR empty ats_score
    jobs_to_process = []
    for idx, row in df.iterrows():
        needs_tailoring = False
        analysis_path = row.get('Analysis_File')
        
        # If no file path
        if pd.isna(analysis_path) or str(analysis_path).strip() == '':
            needs_tailoring = True
        else:
            # If file path exists but file doesn't or ats_score missing
            full_path = str(analysis_path)
            if not os.path.isabs(full_path):
                full_path = os.path.join(str(settings.DATA_DIR), 'analysis_results', full_path)
                
            if not os.path.exists(full_path):
                needs_tailoring = True
            else:
                try:
                    with open(full_path, 'r') as f:
                        data = json.load(f)
                        if 'ats_score' not in data and 'ai_ats_score' not in data:
                            needs_tailoring = True
                except Exception:
                    needs_tailoring = True
                    
        if needs_tailoring:
            # Check if there is a valid JD
            jd = row.get('Job Description') or row.get('Job_Description')
            if pd.notna(jd) and str(jd).strip():
                jobs_to_process.append(idx)

    print(f"[INFO] Found {len(jobs_to_process)} jobs needing AI tailoring.")
    
    if not jobs_to_process:
        print("[SUCCESS] All jobs are already AI tailored!")
        return
        
    # Ensure analysis_results dir exists
    analysis_dir = os.path.join(str(settings.DATA_DIR), 'analysis_results')
    os.makedirs(analysis_dir, exist_ok=True)
    
    success_count = 0
    fail_count = 0
    
    for idx in jobs_to_process[:50]:  # Cap at 50 per run to prevent catastrophic rate limiting
        row = df.loc[idx]
        title = row.get('Title') or row.get('Job_Title') or "Unknown Role"
        company = row.get('Company') or "Unknown Company"
        jd = str(row.get('Job Description') or row.get('Job_Description'))
        
        print(f"\n[{idx}] 🤖 Tailoring '{title}' at '{company}'...")
        
        try:
            tailored_data = generate_tailored_resume_data(jd)
            
            # Save to JSON
            safe_company = "".join([c for c in company if c.isalnum() or c in (' ', '_')]).strip().replace(' ', '_')
            safe_title = "".join([c for c in title if c.isalnum() or c in (' ', '_')]).strip().replace(' ', '_')
            filename = f"{idx}_{safe_company}_{safe_title}.json"
            result_path = os.path.join(analysis_dir, filename)
            
            with open(result_path, 'w', encoding='utf-8') as f:
                json.dump(tailored_data, f, indent=2)
                
            # Update dataframe
            df.at[idx, 'Analysis_File'] = filename
            
            # Optional: Map ats_score directly to Skill Score so the UI ranking works!
            if 'ats_score' in tailored_data:
                df.at[idx, 'Skill Score'] = tailored_data['ats_score']
                
            print(f"  ✅ Success! ATS Score: {tailored_data.get('ats_score', 'N/A')}. Saved to {filename}")
            success_count += 1
            
            time.sleep(1)
            
        except Exception as e:
            print(f"  ❌ Failed: {e}")
            fail_count += 1
            
            # Stop if rate limited to save loops
            if "rate limit" in str(e).lower() or "failed due to rate limit" in str(e).lower():
                print("  [!] Rate limit completely exhausted across all models/keys. Stopping early.")
                break
                
    # Save the dataframe for 'All Jobs'
    if success_count > 0:
        print(f"\n[INFO] Saving {success_count} updates to Excel...")
        try:
            # We don't want to overwrite the other sheets like Top Matches or Applied, so we load existing
            with pd.ExcelWriter(excel_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                df.to_excel(writer, sheet_name='All Jobs', index=False)
            print("[SUCCESS] Excel updated (All Jobs tab replaced properly).")
        except Exception as e:
            print(f"[ERROR] Mode 'a' Excel writer failed: {e}. Trying simple overwrite...")
            try:
                df.to_excel(excel_path, sheet_name="All Jobs", index=False)
            except Exception as e2:
                 print(f"[ERROR] {e2}")
                
    print(f"\n[REPORT] Completed: {success_count} success, {fail_count} failed.")

if __name__ == "__main__":
    main()
