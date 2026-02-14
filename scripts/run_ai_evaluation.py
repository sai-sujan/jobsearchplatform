"""
Run AI Evaluation
-----------------
Standalone script to run detailed AI evaluation on scraped job files.
Useful for processing jobs after strict filtering.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import os
import pandas as pd
from datetime import datetime
from src.evaluation.ai_evaluator import AIEvaluator
from src.settings import settings

def get_latest_combined_file(outputs_dir: Path) -> Path:
    """Find the most recent combined jobs excel file."""
    combined_dir = outputs_dir / 'combined'
    if not combined_dir.exists():
        return None
        
    files = list(combined_dir.glob('all_jobs_combined_*.xlsx'))
    # Filter out already evaluated files to avoid re-running
    files = [f for f in files if '_evaluated' not in f.name]
    
    if not files:
        return None
        
    # Sort by modification time (latest first)
    return max(files, key=lambda f: f.stat().st_mtime)

def main():
    base_dir = settings.BASE_DIR
    outputs_dir = base_dir / 'outputs'
    resume_path = Path(settings.RESUME_PATH)
    
    print("="*60)
    print("      CLAWDBOT - AI RESUME EVALUATOR")
    print("="*60)
    
    # 1. Find Input File
    target_file = None
    if len(sys.argv) > 1:
        target_file = Path(sys.argv[1])
    else:
        print("[INFO] No file specified. Looking for latest combined job list...")
        target_file = get_latest_combined_file(outputs_dir)
        
    if not target_file or not target_file.exists():
        print("[ERROR] No input file found. Please run job scraper first.")
        return
        
    print(f"[INFO] Processing File: {target_file.name}")
    
    # 2. Initialize AI Evaluator
    try:
        evaluator = AIEvaluator(str(resume_path))
    except Exception as e:
        print(f"[ERROR] Failed to initialize evaluator: {e}")
        return

    # 3. Read Data
    try:
        df = pd.read_excel(target_file)
        print(f"[INFO] Loaded {len(df)} jobs.")
    except Exception as e:
        print(f"[ERROR] Failed to read Excel file: {e}")
        return

    # 4. Run Evaluation
    try:
        evaluated_df = evaluator.process_jobs_dataframe(df)
        
        # 5. Save Output
        # Create new filename with _evaluated suffix
        name_stem = target_file.stem
        # Remove timestamp to append fresh one? Or keep same?
        # Let's append _evaluated
        output_filename = f"{name_stem}_evaluated.xlsx"
        output_path = target_file.parent / output_filename
        
        evaluated_df.to_excel(output_path, index=False)
        print(f"\n[SUCCESS] AI Evaluation Complete!")
        print(f"Saved to: {output_path}")
        
    except KeyboardInterrupt:
        print("\n[WARNING] Interrupted by user. Saving progress...")
        # Try to save what we have? (Complexity: DataFrame might be half updated)
        # For now, just exit.
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] Evaluation process failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
