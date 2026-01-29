import os
import json

JSON_DIR = "analysis_results"

STRICT_TECH_STACK = {
    "Programming Languages": ["Python", "SQL"],
    "ML Frameworks & Libraries": ["TensorFlow", "PyTorch", "Scikit-learn", "Hugging Face Transformers"],
    "LLM & NLP Tools": ["LangChain", "LangSmith", "LlamaIndex", "Multi-Agents", "Finetuning (LoRA, QLoRA)", "OpenAI, Ollama", "RAG Systems"],
    "ML Specializations": ["Deep Learning", "Computer Vision", "Anomaly Detection"],
    "MLOps & Deployment": ["MLflow", "Git, GitHub Actions", "CI/CD Pipelines", "Model Deployment"],
    "Cloud & Infrastructure": ["AWS", "Azure"],
    "Databases & AI Infrastructure": ["PostgreSQL, MySQL, MongoDB", "Weaviate", "FAISS", "ChromaDB"],
    "Web & DevOps": ["FastAPI,React", "Docker Containerization"]
}

def main():
    if not os.path.exists(JSON_DIR):
        print(f"Directory {JSON_DIR} not found.")
        return

    json_files = [f for f in os.listdir(JSON_DIR) if f.endswith('.json')]
    print(f"Found {len(json_files)} JSON files. Updating tech_stack...")

    updated_count = 0
    for filename in json_files:
        filepath = os.path.join(JSON_DIR, filename)
        
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            
            # Update tech_stack
            data["tech_stack"] = STRICT_TECH_STACK
            
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=4)
                
            updated_count += 1
        except Exception as e:
            print(f"Error updating {filename}: {e}")

    print(f"Successfully updated {updated_count} files with the strict default tech stack.")

if __name__ == "__main__":
    main()
