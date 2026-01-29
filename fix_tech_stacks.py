import json
import glob
import os

# Define Master Resume Stack (Baseline)
MASTER_STACK = {
    "Programming Languages": ["Python", "SQL"],
    "ML Frameworks & Libraries": ["TensorFlow", "PyTorch", "Scikit-learn", "Hugging Face Transformers"],
    "LLM & NLP Tools": ["LangChain", "LangGraph", "LangSmith", "LlamaIndex", "Agents", "Multi-Agents", "LoRA", "QLoRA", "OpenAI", "Ollama", "RAG Systems"],
    "ML Specializations": ["NLP", "Computer Vision", "Deep Learning", "Anomaly Detection"],
    "MLOps & Deployment": ["MLflow", "Git", "GitHub Actions", "CI/CD Pipelines", "Model Deployment"],
    "Cloud & Infrastructure": ["AWS (Lambda, S3, EC2, ECR, API Gateway)"],
    "Databases & AI Infrastructure": ["PostgreSQL", "MySQL", "Milvus", "Weaviate", "FAISS", "MongoDB"],
    "Web & DevOps": ["FastAPI", "Docker Containerization"]
}

# Target Files (Batch 1, 2, 3)
# IDs: 9, 10, 11, 13, 15, 16, 17, 20, 21
TARGET_IDS = ["9_", "10_", "11_", "13_", "15_", "16_", "17_", "20_", "21_"]

def fix_json_diffs():
    files = glob.glob("analysis_results/*.json")
    count = 0
    for fpath in files:
        fname = os.path.basename(fpath)
        if any(fname.startswith(tid) for tid in TARGET_IDS):
            try:
                with open(fpath, 'r') as f:
                    data = json.load(f)
                
                # Check if we need to fix
                # If suggested exists, assume it holds the tailored one. 
                # Wait, currently suggested == tech_stack (Tailored).
                # We want suggested = Tailored, tech_stack = Master.
                
                current_stack = data.get('tech_stack', {})
                
                # Ensure suggested gets the Tailored version
                data['suggested_tech_stack'] = current_stack
                
                # Reset tech_stack to Master
                data['tech_stack'] = MASTER_STACK
                
                with open(fpath, 'w') as f:
                    json.dump(data, f, indent=2)
                
                print(f"✅ Fixed {fname}")
                count += 1
            except Exception as e:
                print(f"❌ Error fixing {fname}: {e}")

    print(f"\nTotal Fixed: {count}")

if __name__ == "__main__":
    fix_json_diffs()
