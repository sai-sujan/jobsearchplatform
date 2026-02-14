import pandas as pd
import json
import re
import os

# Resume data
RESUME_TECH_STACK = {
    "Programming Languages": ["Python", "SQL"],
    "ML Frameworks & Libraries": ["TensorFlow", "PyTorch", "Scikit-learn", "Hugging Face Transformers"],
    "LLM & NLP Tools": ["LangChain", "LangGraph", "LangSmith", "LlamaIndex", "Agents", "Multi-Agents", "LoRA", "QLoRA", "OpenAI", "Ollama", "RAG Systems"],
    "Cloud & Deployment": ["AWS (Lambda, S3, EC2, ECR, API Gateway)"],
    "Databases & AI Infrastructure": ["PostgreSQL", "MySQL", "Milvus", "Weaviate", "FAISS", "MongoDB"],
    "Web & DevOps": ["FastAPI", "Docker", "Git", "GitHub Actions", "CI/CD Pipelines"],
    "ML Specializations": ["NLP", "Computer Vision", "Deep Learning", "Anomaly Detection"],
    "MLOps & Deployment": ["MLflow", "Model Deployment"]
}

RESUME_POINTS = [
    "Implemented a self-correcting RAG system using LangChain and Mistral 7B, improving answer reliability and mitigating context errors in document-level QA.",
    "Built a hybrid retrieval workflow combining dense embeddings and BM25 search, enhancing relevance and coverage of retrieved documents.",
    "Developed an LLM-as-Judge evaluation pipeline to assess faithfulness and relevance across hundreds of QA examples, ensuring production-ready reliability.",
    "Introduced batched query extraction, reducing LLM calls by ~80% per query and enabling faster, reliable production inference.",
    "Designed an ML-based anomaly detection system for MFA workflows, reducing redundant verification prompts by 25%, improving user experience while maintaining security coverage."
]

def extract_jd_keywords(jd_text):
    """Extract important keywords from JD"""
    jd_lower = jd_text.lower()
    keywords = {
        'llm': 'LLM' in jd_text or 'large language model' in jd_lower,
        'rag': 'RAG' in jd_text or 'retrieval' in jd_lower,
        'nlp': 'NLP' in jd_text or 'natural language' in jd_lower,
        'cv': 'computer vision' in jd_lower or 'vision' in jd_lower,
        'mlops': 'mlops' in jd_lower or 'ml ops' in jd_lower,
        'aws': 'aws' in jd_lower or 'amazon' in jd_lower,
        'gcp': 'gcp' in jd_lower or 'google cloud' in jd_lower,
        'azure': 'azure' in jd_lower,
        'docker': 'docker' in jd_lower or 'container' in jd_lower,
        'kubernetes': 'kubernetes' in jd_lower or 'k8s' in jd_lower,
        'pytorch': 'pytorch' in jd_lower,
        'tensorflow': 'tensorflow' in jd_lower,
        'transformers': 'transformer' in jd_lower or 'hugging face' in jd_lower,
        'langchain': 'langchain' in jd_lower,
        'openai': 'openai' in jd_lower or 'gpt' in jd_lower,
        'agents': 'agent' in jd_lower or 'agentic' in jd_lower,
        'deep_learning': 'deep learning' in jd_lower or 'neural network' in jd_lower,
        'data_science': 'data scien' in jd_lower,
        'ml_engineer': 'machine learning engineer' in jd_lower or 'ml engineer' in jd_lower,
        'genai': 'generative ai' in jd_lower or 'gen ai' in jd_lower or 'genai' in jd_lower,
        'clinical': 'clinical' in jd_lower or 'healthcare' in jd_lower or 'biomedical' in jd_lower,
        'security': 'security' in jd_lower or 'red team' in jd_lower,
        'supply_chain': 'supply chain' in jd_lower or 'logistics' in jd_lower,
        'recommendation': 'recommend' in jd_lower or 'ranking' in jd_lower,
        'detection': 'detection' in jd_lower or 'fraud' in jd_lower,
        '3d': '3d' in jd_lower or 'three-dimensional' in jd_lower,
        'finance': 'finance' in jd_lower or 'financial' in jd_lower,
        'production': 'production' in jd_lower or 'deploy' in jd_lower,
        'scalable': 'scalable' in jd_lower or 'scale' in jd_lower,
        'enterprise': 'enterprise' in jd_lower,
        'xgboost': 'xgboost' in jd_lower or 'gradient boost' in jd_lower,
        'spark': 'spark' in jd_lower or 'pyspark' in jd_lower,
        'databricks': 'databricks' in jd_lower,
    }
    return keywords

def tailor_tech_stack(jd_text, keywords):
    """Tailor tech stack based on JD - minimal surgical changes"""
    stack = {}
    
    # Start with base - always include core
    stack["Programming Languages"] = ["Python", "SQL"]
    
    # ML Frameworks - adjust based on JD
    ml_frameworks = ["TensorFlow", "PyTorch", "Scikit-learn", "Hugging Face Transformers"]
    if keywords.get('xgboost') or keywords.get('data_science'):
        ml_frameworks.append("XGBoost")
    if keywords.get('spark') or keywords.get('databricks'):
        ml_frameworks.append("PySpark")
    stack["ML Frameworks & Libraries"] = ml_frameworks
    
    # LLM & NLP Tools - adjust based on JD focus
    llm_tools = ["LangChain", "LangGraph", "RAG Systems", "OpenAI", "Ollama"]
    if keywords.get('llm') or keywords.get('genai') or keywords.get('agents'):
        llm_tools.extend(["LlamaIndex", "Agents"])
        if keywords.get('agents'):
            llm_tools.append("Multi-Agents")
    if not keywords.get('llm') and not keywords.get('rag') and not keywords.get('genai'):
        # For non-LLM roles, keep minimal
        llm_tools = ["LangChain", "RAG Systems", "OpenAI"]
    stack["LLM & NLP Tools"] = list(dict.fromkeys(llm_tools))  # Remove duplicates
    
    # Cloud - adjust based on JD
    cloud = ["AWS (Lambda, S3, EC2, ECR, API Gateway)"]
    if keywords.get('gcp'):
        cloud.append("GCP (Vertex AI, BigQuery)")
    if keywords.get('azure'):
        cloud.append("Azure ML")
    stack["Cloud & Deployment"] = cloud
    
    # Databases - adjust based on JD
    if keywords.get('llm') or keywords.get('rag'):
        stack["Databases & AI Infrastructure"] = ["PostgreSQL", "MySQL", "FAISS", "Milvus", "MongoDB"]
    else:
        stack["Databases & AI Infrastructure"] = ["PostgreSQL", "MySQL", "MongoDB"]
    
    # Web & DevOps
    devops = ["FastAPI", "Docker", "Git", "GitHub Actions", "CI/CD Pipelines"]
    if keywords.get('kubernetes'):
        devops.append("Kubernetes")
    if keywords.get('mlops'):
        devops.extend(["MLflow", "Model Monitoring"])
    stack["Web & DevOps"] = list(dict.fromkeys(devops))
    
    # ML Specializations - adjust based on JD
    specializations = ["NLP", "Deep Learning"]
    if keywords.get('cv') or keywords.get('3d'):
        specializations.append("Computer Vision")
    if keywords.get('detection') or keywords.get('security'):
        specializations.append("Anomaly Detection")
    if keywords.get('recommendation'):
        specializations.append("Recommendation Systems")
    if keywords.get('clinical') or keywords.get('biomedical'):
        specializations.append("Biomedical NLP")
    if keywords.get('finance'):
        specializations.append("Predictive Analytics")
    stack["ML Specializations"] = specializations
    
    return stack

def tailor_points(jd_text, keywords):
    """Tailor resume points based on JD keywords"""
    points = []
    
    # Point 1 - RAG system
    p1 = "Implemented a self-correcting RAG system using LangChain and Mistral 7B, improving answer reliability"
    if keywords.get('enterprise'):
        p1 += " and mitigating context errors in enterprise document-level QA applications."
    elif keywords.get('clinical'):
        p1 += " and mitigating context errors in clinical document QA workflows."
    elif keywords.get('production'):
        p1 += " and mitigating context errors in production document-level QA systems."
    else:
        p1 += " and mitigating context errors in document-level QA."
    points.append(p1)
    
    # Point 2 - Hybrid retrieval
    p2 = "Built a hybrid retrieval workflow combining dense embeddings and BM25 search"
    if keywords.get('scalable'):
        p2 += ", delivering scalable solutions with enhanced relevance and document coverage."
    elif keywords.get('production'):
        p2 += ", enabling production-ready retrieval with enhanced relevance and coverage."
    else:
        p2 += ", enhancing relevance and coverage of retrieved documents."
    points.append(p2)
    
    # Point 3 - LLM evaluation
    p3 = "Developed an LLM-as-Judge evaluation pipeline to assess faithfulness and relevance across hundreds of QA examples"
    if keywords.get('mlops') or keywords.get('production'):
        p3 += ", ensuring scalable, production-ready deployment and model monitoring."
    else:
        p3 += ", ensuring production-ready reliability."
    points.append(p3)
    
    # Point 4 - Batched query
    p4 = "Designed and implemented batched query extraction algorithms, reducing LLM calls by ~80% per query"
    if keywords.get('enterprise') or keywords.get('scalable'):
        p4 += " and enabling cost-efficient inference at enterprise scale."
    else:
        p4 += " and enabling faster, reliable production inference."
    points.append(p4)
    
    # Point 5 - Anomaly detection
    p5 = "Designed an ML-based anomaly detection system for MFA workflows, reducing redundant verification prompts by 25%"
    if keywords.get('security'):
        p5 += ", strengthening security posture while improving user experience."
    elif keywords.get('finance'):
        p5 += ", driving measurable business impact on user experience and operational efficiency."
    else:
        p5 += ", improving user experience while maintaining security coverage."
    points.append(p5)
    
    # Format with LaTeX
    return ["\\item " + p for p in points]

def calculate_ats_score(keywords, jd_text):
    """Calculate ATS score based on keyword matches"""
    base_score = 65  # Base score for ML/AI roles
    
    # Core skills match
    if keywords.get('llm') or keywords.get('rag'):
        base_score += 12
    if keywords.get('nlp'):
        base_score += 5
    if keywords.get('deep_learning'):
        base_score += 5
    if keywords.get('aws'):
        base_score += 4
    if keywords.get('pytorch') or keywords.get('tensorflow'):
        base_score += 4
    if keywords.get('docker'):
        base_score += 3
    if keywords.get('langchain'):
        base_score += 5
    if keywords.get('agents') or keywords.get('genai'):
        base_score += 6
    if keywords.get('production'):
        base_score += 3
    if keywords.get('mlops'):
        base_score += 4
    
    # Slight penalty for specialized roles where we're weaker
    if keywords.get('3d'):
        base_score -= 8
    if keywords.get('supply_chain'):
        base_score -= 5
    if keywords.get('security') and 'red team' in jd_text.lower():
        base_score -= 10
    
    return min(max(base_score, 55), 92)

def get_location(row_location, jd_text):
    """Extract location from row or JD"""
    # If row has location
    if pd.notna(row_location) and str(row_location).strip() and str(row_location).lower() != 'nan':
        loc = str(row_location).strip()
        if 'open to relocate' not in loc.lower():
            loc += " (Open to relocate)"
        return loc
    
    # Try to extract from JD
    jd_lower = jd_text.lower()
    
    # Common location patterns
    locations_map = {
        'san francisco': 'San Francisco, CA',
        'new york': 'New York, NY',
        'seattle': 'Seattle, WA',
        'boston': 'Boston, MA',
        'austin': 'Austin, TX',
        'chicago': 'Chicago, IL',
        'los angeles': 'Los Angeles, CA',
        'atlanta': 'Atlanta, GA',
        'denver': 'Denver, CO',
        'dallas': 'Dallas, TX',
        'remote': 'Remote',
        'fremont': 'Fremont, CA',
        'palo alto': 'Palo Alto, CA',
        'san mateo': 'San Mateo, CA',
        'san jose': 'San Jose, CA',
        'mountain view': 'Mountain View, CA',
        'pittsburgh': 'Pittsburgh, PA',
        'philadelphia': 'Philadelphia, PA',
        'hartford': 'Hartford, CT',
        'washington': 'Washington, DC',
        'woburn': 'Woburn, MA',
        'oklahoma city': 'Oklahoma City, OK',
        'nashville': 'Nashville, TN',
        'greenville': 'Greenville, SC',
        'el segundo': 'El Segundo, CA',
        'annapolis': 'Annapolis Junction, MD',
    }
    
    for key, val in locations_map.items():
        if key in jd_lower:
            return val + " (Open to relocate)"
    
    return "Springfield, MO, USA (Open to relocate)"

def process_job(row, idx):
    """Process a single job and generate analysis"""
    company = str(row['Company']).strip()
    title = str(row['Job_Title']).split('\n')[0].strip()
    location = row['Location']
    jd = str(row['Job_Description'])
    
    # Extract keywords
    keywords = extract_jd_keywords(jd)
    
    # Generate analysis
    analysis = {
        "ats_score": calculate_ats_score(keywords, jd),
        "location": get_location(location, jd),
        "tech_stack": tailor_tech_stack(jd, keywords),
        "points": tailor_points(jd, keywords)
    }
    
    # Create filename
    safe_company = re.sub(r'[^a-zA-Z0-9]', '_', company.lower())[:30]
    safe_title = re.sub(r'[^a-zA-Z0-9]', '_', title.lower())[:30]
    filename = f"{safe_company}_{safe_title}_{idx}.json"
    
    return analysis, filename

def main():
    # Read Excel
    df = pd.read_excel('jobs_master.xlsx', sheet_name=0)
    
    # Ensure Analysis_File column exists
    if 'Analysis_File' not in df.columns:
        df['Analysis_File'] = ''
    
    # Find jobs needing processing
    empty_mask = df['Analysis_File'].isna() | (df['Analysis_File'] == '')
    new_job_indices = df[empty_mask].index.tolist()
    
    print(f"Processing {len(new_job_indices)} jobs...")
    
    # Create output directory
    os.makedirs('analysis_results', exist_ok=True)
    
    processed = 0
    for idx in new_job_indices:
        row = df.loc[idx]
        try:
            analysis, filename = process_job(row, idx)
            filepath = f"analysis_results/{filename}"
            
            # Save JSON
            with open(filepath, 'w') as f:
                json.dump(analysis, f, indent=2)
            
            # Update Excel
            df.at[idx, 'Analysis_File'] = filepath
            
            processed += 1
            print(f"[{processed}/{len(new_job_indices)}] Processed: {row['Company']} - {row['Job_Title'].split(chr(10))[0][:40]}")
            print(f"    ATS: {analysis['ats_score']}, Location: {analysis['location']}")
            
        except Exception as e:
            print(f"Error processing row {idx}: {e}")
    
    # Save updated Excel
    df.to_excel('jobs_master.xlsx', index=False)
    print(f"\nDone! Processed {processed} jobs. Excel updated.")

if __name__ == "__main__":
    main()
