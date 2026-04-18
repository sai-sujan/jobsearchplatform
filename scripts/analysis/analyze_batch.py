import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import os
import json
import time
from src.evaluation.resume_evaluator import ResumeEvaluator
from src.settings import settings
from src.utils import load_excel_safe

# Directories
RESULTS_DIR = str(settings.ANALYSIS_DIR)
if not os.path.exists(RESULTS_DIR):
    os.makedirs(RESULTS_DIR)

RESUME_PATH = settings.RESUME_PATH
EXCEL_PATH = str(settings.MASTER_EXCEL)

# The User's "Fixed List" of Skills (Baseline for Tuning)
FIXED_TECH_STACK = """
Programming Languages
• Python
• SQL
ML Frameworks & Libraries
• TensorFlow
• PyTorch
• Scikit-learn
• Hugging Face Transformers
LLM & NLP Tools
• LangChain
• LangSmith
• LlamaIndex
• Multi-Agents
• Finetuning (LoRA, QLoRA)
• OpenAI, Ollama
• RAG Systems
ML Specializations
• Deep Learning
• Computer Vision
• Anomaly Detection
MLOps & Deployment
• MLflow
• Git, GitHub Actions
• CI/CD Pipelines
• Model Deployment
Cloud & Infrastructure
• AWS
• Azure
Databases & AI Infrastructure
• PostgreSQL, MySQL, MongoDB
• Weaviate
• FAISS
• ChromaDB
Web & DevOps
• FastAPI
• Docker Containerization
"""

# The New Prompt

def load_prompt_template():
    try:
        prompt_path = Path(__file__).parent.parent / "PROMPT_MASTER.md"
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"[ERROR] Could not load PROMPT_MASTER.md: {e}")
        return ""

USER_PROMPT_TEMPLATE = load_prompt_template()


def analyze_batch():
    print("----------------------------------------------------------------")
    print("   Starting Batch Analysis (3 Rows)                             ")
    print("----------------------------------------------------------------")

    # 1. Load Resume
    try:
        with open(RESUME_PATH, 'r', encoding='utf-8') as f:
            resume_text = f.read()
    except Exception as e:
        print(f"[ERROR] Could not load resume: {e}")
        return

    # 2. Load Excel
    try:
        df = load_excel_safe(EXCEL_PATH, settings.SHEET_NAME)
    except Exception as e:
        print(f"[ERROR] Could not load Excel: {e}")
        return

    # 3. Setup Evaluator
    evaluator = ResumeEvaluator()
    processed_count = 0
    BATCH_LIMIT = 3

    # 4. Iterate
    for index, row in df.iterrows():
        if processed_count >= BATCH_LIMIT:
            break

        # Check if already analyzed
        existing_file = row.get('Analysis_File')
        if pd.notna(existing_file) and str(existing_file).strip() != '' and os.path.exists(str(existing_file)):
             # Already done, skip
             # continue
             pass
        
        # Valid Description?
        description = str(row.get('Job_Description', ''))
        if not description or len(description) < 50 or description.lower() == 'nan':
            continue

        job_title = str(row.get('Job_Title', 'Unknown'))
        company = str(row.get('Company', 'Unknown'))
        
        print(f"[{index}] Analyzing: {job_title} @ {company}...")

        # Prepare Row Data
        # Convert row to dict, handle NaNs, convert timestamps to string
        row_dict = row.to_dict()
        def default_serializer(obj):
            if pd.isna(obj):
                return None
            return str(obj)
            
        job_row_data_str = json.dumps(row_dict, indent=2, default=default_serializer)

        # Construct Prompt
        full_prompt = USER_PROMPT_TEMPLATE.format(
            fixed_stack=FIXED_TECH_STACK,
            resume_text=resume_text,
            job_description=description,
            job_row_data=job_row_data_str
        )

        try:
            # Generate
            response_text = evaluator._generate(full_prompt)
            json_data = evaluator._extract_json(response_text)

            if json_data:
                # Save File
                safe_company = "".join([c for c in company if c.isalnum() or c in (' ', '_')]).strip().replace(' ', '_')
                safe_title = "".join([c for c in job_title if c.isalnum() or c in (' ', '_')]).strip().replace(' ', '_')
                filename = f"{index}_{safe_company}_{safe_title}.json"
                result_path = os.path.abspath(os.path.join(RESULTS_DIR, filename))

                with open(result_path, 'w', encoding='utf-8') as f:
                    json.dump(json_data, f, indent=2)

                # Update DataFrame immediately (in memory)
                df.at[index, 'Analysis_File'] = result_path
                df.at[index, 'Analysis_JSON'] = json.dumps(json_data)
                df.at[index, 'Keywords_Matching_Score'] = json_data.get('ats_score', 0)
                df.at[index, 'Location'] = json_data.get('location', '') # Update location if AI found something better or resume location
                
                print(f"  -> Saved to {filename}")
                processed_count += 1
            else:
                print("  -> [WARN] Empty JSON response")

        except Exception as e:
            print(f"  -> Failed: {e}")

    # 5. Save Excel
    if processed_count > 0:
        print(f"[INFO] Saving updates to {EXCEL_PATH}...")
        df.to_excel(EXCEL_PATH, sheet_name=settings.SHEET_NAME, index=False)
        print("Done.")
    else:
        print("[INFO] No new jobs to process.")

if __name__ == "__main__":
    analyze_batch()
