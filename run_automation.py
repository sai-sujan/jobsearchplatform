
import sys
import subprocess
import time
from datetime import datetime

# Configuration: Batches to run
# Format: (Role Name, Search Keywords, Job Count)
BATCHES = [
    # Batch 1: AI Engineer (Filtered)
    ("AI Engineer", '("AI Engineer" OR "Artificial Intelligence Engineer") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)', 10),
    
    # Batch 2: Machine Learning Engineer (Filtered)
    ("Machine Learning Engineer", '("Machine Learning Engineer" OR "ML Engineer") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)', 10),
    
    # Batch 3: Data Scientist (ai/ml focused)
    ("Data Scientist", '"Data Scientist" AND ("Machine Learning" OR "Deep Learning" OR "AI" OR "Generative AI") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)', 10)
]

def run_automation():
    print("""
======================================================================
  CLAWDBOT AUTOMATION - MULTI-PROCESS ORCHESTRATOR
======================================================================
    """)
    
    start_time = datetime.now()
    
    for i, (role, keywords, count) in enumerate(BATCHES, 1):
        print(f"\n[ORCHESTRATOR] Starting Batch {i}/{len(BATCHES)}: {role}")
        print(f"               Target: {count} jobs")
        print("-" * 60)
        
        try:
            # Run main.py as a subprocess
            # This ensures a completely clean environment (memory/event loops) for each batch
            cmd = [
                sys.executable, "main.py",
                "--role", role,
                "--keywords", keywords,
                "--count", str(count)
            ]
            
            # Run and wait for completion
            result = subprocess.run(cmd, check=False)
            
            if result.returncode == 0:
                print(f"\n[ORCHESTRATOR] Batch {i} ({role}) completed successfully.")
            else:
                print(f"\n[ORCHESTRATOR] Batch {i} ({role}) FAILED with exit code {result.returncode}.")
            
            # Cooldown between batches to let system resources settle
            if i < len(BATCHES):
                print("[ORCHESTRATOR] Cooling down for 10 seconds...")
                time.sleep(10)
                
        except KeyboardInterrupt:
            print("\n[ORCHESTRATOR] Interrupted by user.")
            break
        except Exception as e:
            print(f"\n[ORCHESTRATOR] Error executing batch {role}: {e}")
            
    total_time = datetime.now() - start_time
    
    # ---------------------------------------------------------
    # Final Step: Combine all results
    # ---------------------------------------------------------
    print("\n[ORCHESTRATOR] Combining all results...")
    try:
        import pandas as pd
        import os
        from pathlib import Path
        
        base_dir = Path(__file__).parent
        outputs_dir = base_dir / 'outputs'
        
        # Create Date-based folder
        date_str = datetime.now().strftime('%Y-%m-%d')
        date_dir = outputs_dir / date_str
        date_dir.mkdir(parents=True, exist_ok=True)
        
        # Determine Batch Number (1, 2, 3...)
        existing_batches = [d for d in date_dir.iterdir() if d.is_dir() and d.name.isdigit()]
        if existing_batches:
             last_batch = max([int(d.name) for d in existing_batches])
             batch_num = last_batch + 1
        else:
             batch_num = 1
             
        batch_dir = date_dir / str(batch_num)
        batch_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"[INFO] Saving results to: {batch_dir}")
        
        # Move/Copy individual role outputs to this new batch folder
        # The main.py writes to outputs/role_name/... we need to intercept that or just move them here.
        # Actually simplest is to find the files we just made (check timestamp or modification time?)
        # Or simpler: Instruct user to look in the batch folder.
        
        # IMPORTANT: main.py currently writes to outputs/role_name/job...xlsx
        # We need to move those files to our nice batch_dir structure.
        
        all_dfs = []
        
        for role_dir in outputs_dir.iterdir():
            if role_dir.is_dir() and role_dir.name not in ['combined', date_str]: # Skip date folders
                for excel_file in role_dir.glob('*.xlsx'):
                    # Check if file was created in last 5 minutes (part of this run)
                    if (datetime.now().timestamp() - excel_file.stat().st_mtime) < 300: 
                        try:
                            df = pd.read_excel(excel_file)
                            all_dfs.append(df)
                            
                            # Move file to batch dir for organization
                            new_path = batch_dir / excel_file.name
                            os.rename(excel_file, new_path)
                            print(f"[MOVED] {excel_file.name} -> {batch_dir}")
                        except Exception as e:
                            print(f"[WARNING] Could not read/move {excel_file.name}: {e}")
        
        if all_dfs:
            final_df = pd.concat(all_dfs, ignore_index=True)
            
            # Sort by Verdict (YES first)
            if 'Recruiter Verdict' in final_df.columns:
                 # Custom sort: YES > Unknown > NO
                 final_df['Recruiter Verdict'] = final_df['Recruiter Verdict'].astype(str).fillna('Unknown')
                 
                 # Helper column for sorting
                 final_df['_sort_rank'] = final_df['Recruiter Verdict'].apply(
                     lambda x: 2 if 'YES' in x.upper() else (0 if 'NO' in x.upper() else 1)
                 )
                 final_df = final_df.sort_values('_sort_rank', ascending=False)
                 final_df = final_df.drop('_sort_rank', axis=1)
                
            combined_path = batch_dir / f"combined_batch_{batch_num}.xlsx"
            final_df.to_excel(combined_path, index=False)
            print(f"[SUCCESS] Combined {len(final_df)} jobs into: {combined_path}")
                
        else:
            print("[WARNING] No fresh Excel files found to combine.")
            
    except Exception as e:
        print(f"[ERROR] Failed to combine results: {e}")

    print("\n======================================================================")
    print(f"  AUTOMATION SEQUENCE COMPLETE")
    print(f"  Total Time: {total_time}")
    print("======================================================================")

if __name__ == "__main__":
    run_automation()
