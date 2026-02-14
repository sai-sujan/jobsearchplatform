import pandas as pd
import json
import re
import os

# Additional points from resume (for 6th point)
EXTRA_POINTS = {
    'mlops': "Implemented CI/CD pipeline with GitHub Actions to automate model retraining and deployment to AWS (S3, ECR, API Gateway), ensuring reliable and repeatable ML releases.",
    'docker': "Containerized and deployed ML solutions using Docker and AWS, enabling scalable production-ready pipelines for AI applications.",
    'multi_agent': "Built a multi-agent research workflow using CrewAI with PubMed retrieval via Model Context Protocol, enabling interactive biomedical QA.",
    'llm_fine_tuning': "Fine-tuned Llama-3.1-8B using QLoRA on domain-specific data with 4-bit quantization, gaining hands-on experience in parameter-efficient LLM training.",
    'cv': "Built a National ID authentication system using YOLO object detection, MiDaS depth estimation, and GAN-generated synthetic samples for robust hologram verification.",
    'data_science': "Conducted exploratory data analysis on 30,000+ customer records to identify key features, achieving 87% model accuracy on predictive tasks.",
    'api': "Built end-to-end ML pipeline using ZenML and MLflow, deploying a REST API on AWS Lambda with Docker for automated training and inference.",
    'tool_agent': "Implemented a tool-using LLM agent (LangGraph/ReAct) with multi-channel frontends (Streamlit, Twilio WhatsApp) and integrated APIs for real-time outputs.",
    'default': "Containerized and deployed production ML solutions using Docker and AWS, enabling scalable inference pipelines for enterprise AI applications."
}

def extract_jd_requirements(jd_text):
    """Extract specific requirements and keywords from JD"""
    jd_lower = jd_text.lower()
    
    reqs = {
        # Core tech
        'llm': any(x in jd_lower for x in ['llm', 'large language model', 'gpt', 'chatgpt']),
        'rag': any(x in jd_lower for x in ['rag', 'retrieval augmented', 'retrieval-augmented']),
        'nlp': any(x in jd_lower for x in ['nlp', 'natural language']),
        'cv': any(x in jd_lower for x in ['computer vision', 'image', 'vision', '3d', 'object detection']),
        'genai': any(x in jd_lower for x in ['generative ai', 'gen ai', 'genai']),
        'agents': any(x in jd_lower for x in ['agent', 'agentic', 'multi-agent']),
        
        # Frameworks
        'pytorch': 'pytorch' in jd_lower,
        'tensorflow': 'tensorflow' in jd_lower,
        'langchain': 'langchain' in jd_lower,
        'llamaindex': 'llamaindex' in jd_lower or 'llama index' in jd_lower,
        'huggingface': any(x in jd_lower for x in ['hugging face', 'huggingface', 'transformers']),
        'openai': 'openai' in jd_lower,
        
        # Cloud
        'aws': any(x in jd_lower for x in ['aws', 'amazon web', 'sagemaker', 'lambda', 'ec2']),
        'gcp': any(x in jd_lower for x in ['gcp', 'google cloud', 'vertex ai', 'bigquery']),
        'azure': any(x in jd_lower for x in ['azure', 'microsoft cloud']),
        
        # MLOps
        'docker': any(x in jd_lower for x in ['docker', 'container']),
        'kubernetes': any(x in jd_lower for x in ['kubernetes', 'k8s']),
        'mlflow': 'mlflow' in jd_lower,
        'mlops': any(x in jd_lower for x in ['mlops', 'ml ops', 'model deployment', 'ci/cd']),
        
        # Data
        'spark': any(x in jd_lower for x in ['spark', 'pyspark', 'databricks']),
        'sql': 'sql' in jd_lower,
        'vector_db': any(x in jd_lower for x in ['vector', 'faiss', 'pinecone', 'weaviate', 'milvus', 'chromadb']),
        
        # Domain
        'clinical': any(x in jd_lower for x in ['clinical', 'healthcare', 'medical', 'biomedical', 'pharma']),
        'finance': any(x in jd_lower for x in ['finance', 'financial', 'trading', 'investment']),
        'security': any(x in jd_lower for x in ['security', 'red team', 'adversarial']),
        'supply_chain': any(x in jd_lower for x in ['supply chain', 'logistics', 'e-commerce']),
        
        # Keywords for points
        'production': any(x in jd_lower for x in ['production', 'deploy', 'operationalize']),
        'scalable': any(x in jd_lower for x in ['scalable', 'scale', 'enterprise']),
        'evaluation': any(x in jd_lower for x in ['evaluat', 'benchmark', 'metric']),
        'optimize': any(x in jd_lower for x in ['optim', 'efficien', 'performance']),
        'api': any(x in jd_lower for x in ['api', 'rest', 'endpoint', 'fastapi']),
        'fine_tuning': any(x in jd_lower for x in ['fine-tun', 'finetun', 'lora', 'qlora', 'peft']),
    }
    
    # Extract specific tools mentioned in JD that we should add
    specific_tools = []
    tool_patterns = [
        ('Bedrock', 'aws bedrock'),
        ('SageMaker', 'sagemaker'),
        ('Vertex AI', 'vertex ai'),
        ('LangSmith', 'langsmith'),
        ('CrewAI', 'crewai'),
        ('AutoGen', 'autogen'),
        ('Anthropic Claude', 'anthropic'),
        ('Gemini', 'gemini'),
        ('XGBoost', 'xgboost'),
        ('PySpark', 'pyspark'),
        ('Databricks', 'databricks'),
        ('Airflow', 'airflow'),
        ('Kubeflow', 'kubeflow'),
        ('Redis', 'redis'),
        ('Elasticsearch', 'elasticsearch'),
        ('Neo4j', 'neo4j'),
        ('Pinecone', 'pinecone'),
        ('ChromaDB', 'chromadb'),
    ]
    for tool, pattern in tool_patterns:
        if pattern in jd_lower:
            specific_tools.append(tool)
    
    reqs['specific_tools'] = specific_tools
    return reqs

def tailor_tech_stack(reqs):
    """Create tailored tech stack based on JD requirements"""
    stack = {
        "Programming Languages": ["Python", "SQL"],
        "ML Frameworks & Libraries": ["TensorFlow", "PyTorch", "Scikit-learn", "Hugging Face Transformers"],
        "LLM & NLP Tools": [],
        "Cloud & Deployment": [],
        "Databases & AI Infrastructure": ["PostgreSQL", "MySQL", "MongoDB"],
        "Web & DevOps": ["FastAPI", "Docker", "Git", "GitHub Actions", "CI/CD Pipelines"],
        "ML Specializations": []
    }
    
    # ML Frameworks additions
    if reqs.get('spark'):
        stack["ML Frameworks & Libraries"].append("PySpark")
    if 'XGBoost' in reqs.get('specific_tools', []) or reqs.get('finance'):
        stack["ML Frameworks & Libraries"].append("XGBoost")
    
    # LLM & NLP Tools
    if reqs.get('llm') or reqs.get('rag') or reqs.get('genai') or reqs.get('agents'):
        stack["LLM & NLP Tools"] = ["LangChain", "LangGraph", "LangSmith", "LlamaIndex", "RAG Systems", "OpenAI", "Ollama"]
        if reqs.get('agents'):
            stack["LLM & NLP Tools"].extend(["Agents", "Multi-Agents"])
        if reqs.get('fine_tuning'):
            stack["LLM & NLP Tools"].extend(["LoRA", "QLoRA"])
    else:
        stack["LLM & NLP Tools"] = ["LangChain", "RAG Systems", "OpenAI"]
    
    # Add specific tools from JD
    for tool in reqs.get('specific_tools', []):
        if tool in ['CrewAI', 'AutoGen', 'Anthropic Claude', 'Gemini', 'LangSmith']:
            if tool not in stack["LLM & NLP Tools"]:
                stack["LLM & NLP Tools"].append(tool)
    
    # Cloud
    stack["Cloud & Deployment"] = ["AWS (Lambda, S3, EC2, ECR, API Gateway)"]
    if reqs.get('gcp') or 'Vertex AI' in reqs.get('specific_tools', []):
        stack["Cloud & Deployment"].append("GCP (Vertex AI, BigQuery)")
    if reqs.get('azure'):
        stack["Cloud & Deployment"].append("Azure ML")
    if 'SageMaker' in reqs.get('specific_tools', []):
        stack["Cloud & Deployment"][0] = "AWS (SageMaker, Lambda, S3, EC2, ECR)"
    
    # Databases
    if reqs.get('vector_db') or reqs.get('rag'):
        stack["Databases & AI Infrastructure"].extend(["FAISS", "Milvus", "Weaviate"])
    for tool in reqs.get('specific_tools', []):
        if tool in ['Pinecone', 'ChromaDB', 'Redis', 'Elasticsearch', 'Neo4j']:
            stack["Databases & AI Infrastructure"].append(tool)
    
    # DevOps additions
    if reqs.get('kubernetes'):
        stack["Web & DevOps"].append("Kubernetes")
    if reqs.get('mlops') or reqs.get('mlflow'):
        stack["Web & DevOps"].extend(["MLflow", "Model Monitoring"])
    
    # ML Specializations
    if reqs.get('nlp') or reqs.get('llm'):
        stack["ML Specializations"].append("NLP")
    stack["ML Specializations"].append("Deep Learning")
    if reqs.get('cv'):
        stack["ML Specializations"].append("Computer Vision")
    if reqs.get('security') or reqs.get('finance'):
        stack["ML Specializations"].append("Anomaly Detection")
    if reqs.get('clinical'):
        stack["ML Specializations"].append("Biomedical NLP")
    if reqs.get('finance'):
        stack["ML Specializations"].append("Predictive Analytics")
    if reqs.get('supply_chain'):
        stack["ML Specializations"].append("Optimization")
    
    # Remove duplicates
    for key in stack:
        stack[key] = list(dict.fromkeys(stack[key]))
    
    return stack

def tailor_points(reqs, jd_text):
    """Create properly tailored points with meaningful changes"""
    points = []
    jd_lower = jd_text.lower()
    
    # Point 1 - RAG system (heavily tailored)
    if reqs.get('genai') or reqs.get('llm'):
        p1 = "Architected and deployed a self-correcting RAG system using LangChain and Mistral 7B, improving document QA accuracy by ~20%"
        if reqs.get('clinical'):
            p1 += " for clinical document retrieval and analysis workflows."
        elif reqs.get('enterprise') or reqs.get('scalable'):
            p1 += " and enabling reliable enterprise-scale document intelligence."
        elif reqs.get('agents'):
            p1 += " with agentic error correction and context validation."
        else:
            p1 += " through intelligent context validation and error mitigation."
    else:
        p1 = "Designed and implemented production ML pipelines for document analysis, improving processing accuracy by ~20% through intelligent validation workflows."
    points.append(p1)
    
    # Point 2 - Hybrid retrieval (tailored for search/retrieval roles)
    if reqs.get('rag') or reqs.get('vector_db'):
        p2 = "Engineered a hybrid retrieval architecture combining dense embeddings (FAISS) with BM25 sparse search, achieving 35% improvement in retrieval relevance"
        if reqs.get('scalable'):
            p2 += " at scale."
        else:
            p2 += " for document QA systems."
    else:
        p2 = "Built hybrid search workflows combining dense embeddings and keyword search, significantly improving relevance and recall for information retrieval."
    points.append(p2)
    
    # Point 3 - LLM Evaluation (tailored for MLOps/evaluation roles)
    if reqs.get('evaluation') or reqs.get('llm'):
        p3 = "Developed LLM-as-Judge evaluation framework to assess faithfulness, relevance, and hallucination rates across 500+ QA examples"
        if reqs.get('mlops'):
            p3 += ", integrating with MLflow for automated model monitoring."
        elif reqs.get('production'):
            p3 += ", ensuring production-grade reliability and performance tracking."
        else:
            p3 += ", enabling systematic quality assurance for LLM applications."
    else:
        p3 = "Built automated evaluation pipelines to assess model performance across hundreds of test cases, ensuring production-ready reliability."
    points.append(p3)
    
    # Point 4 - Optimization (tailored for efficiency/scale roles)
    if reqs.get('optimize') or reqs.get('scalable'):
        p4 = "Optimized LLM inference through batched query extraction, reducing API calls by ~80% and cutting inference costs by 60%"
        if reqs.get('production'):
            p4 += " while maintaining sub-second latency for production workloads."
        else:
            p4 += ", enabling cost-efficient deployment at scale."
    else:
        p4 = "Implemented batched query extraction strategies, reducing LLM calls by ~80% per query and enabling faster, cost-efficient inference."
    points.append(p4)
    
    # Point 5 - Anomaly Detection (tailored for security/ML roles)
    if reqs.get('security'):
        p5 = "Designed ML-based anomaly detection system for authentication workflows, reducing false positives by 25% while strengthening security posture against adversarial attacks."
    elif reqs.get('finance'):
        p5 = "Designed ML-based anomaly detection system for verification workflows, reducing redundant checks by 25% and driving measurable operational efficiency gains."
    else:
        p5 = "Designed ML-based anomaly detection system for MFA workflows, reducing redundant verification prompts by 25% while maintaining security coverage."
    points.append(p5)
    
    # Point 6 - UNIQUE additional point based on JD focus
    if reqs.get('mlops') or reqs.get('docker'):
        p6 = EXTRA_POINTS['mlops']
    elif reqs.get('agents'):
        p6 = EXTRA_POINTS['multi_agent']
    elif reqs.get('fine_tuning'):
        p6 = EXTRA_POINTS['llm_fine_tuning']
    elif reqs.get('cv'):
        p6 = EXTRA_POINTS['cv']
    elif reqs.get('api'):
        p6 = EXTRA_POINTS['api']
    elif reqs.get('clinical'):
        p6 = "Built multi-agent biomedical research workflow using CrewAI with PubMed retrieval, enabling interactive clinical literature QA and analysis."
    elif reqs.get('supply_chain'):
        p6 = "Deployed end-to-end ML pipeline using ZenML and MLflow with AWS Lambda, achieving automated retraining and inference for predictive applications."
    else:
        p6 = EXTRA_POINTS['default']
    points.append(p6)
    
    return ["\\item " + p for p in points]

def calculate_ats_score(reqs):
    """Calculate ATS score based on requirement matches"""
    score = 60
    
    # Strong matches (our core skills)
    if reqs.get('llm'): score += 10
    if reqs.get('rag'): score += 10
    if reqs.get('genai'): score += 8
    if reqs.get('agents'): score += 8
    if reqs.get('nlp'): score += 5
    if reqs.get('langchain'): score += 6
    if reqs.get('pytorch') or reqs.get('tensorflow'): score += 4
    if reqs.get('aws'): score += 5
    if reqs.get('docker'): score += 4
    if reqs.get('mlops'): score += 5
    if reqs.get('production'): score += 3
    if reqs.get('huggingface'): score += 4
    
    # Moderate penalty for gaps
    if reqs.get('cv') and not reqs.get('llm'): score -= 8
    if reqs.get('spark'): score -= 3
    if reqs.get('security') and 'red team' in str(reqs): score -= 10
    if reqs.get('supply_chain'): score -= 5
    
    return min(max(score, 55), 95)

def get_location(row_location, jd_text):
    """Extract location"""
    if pd.notna(row_location) and str(row_location).strip().lower() not in ['nan', '']:
        loc = str(row_location).strip()
        if 'open to relocate' not in loc.lower():
            loc += " (Open to relocate)"
        return loc
    
    locations = {
        'san francisco': 'San Francisco, CA', 'new york': 'New York, NY',
        'seattle': 'Seattle, WA', 'boston': 'Boston, MA', 'austin': 'Austin, TX',
        'chicago': 'Chicago, IL', 'los angeles': 'Los Angeles, CA', 'atlanta': 'Atlanta, GA',
        'remote': 'Remote', 'fremont': 'Fremont, CA', 'palo alto': 'Palo Alto, CA',
        'san jose': 'San Jose, CA', 'mountain view': 'Mountain View, CA',
    }
    
    jd_lower = jd_text.lower()
    for key, val in locations.items():
        if key in jd_lower:
            return val + " (Open to relocate)"
    
    return "Springfield, MO, USA (Open to relocate)"

def main():
    df = pd.read_excel('jobs_master.xlsx', sheet_name=0)
    
    if 'Analysis_File' not in df.columns:
        df['Analysis_File'] = ''
    
    # Clear existing Analysis_File to reprocess all
    empty_mask = df['Analysis_File'].isna() | (df['Analysis_File'] == '')
    indices = df[empty_mask].index.tolist()
    
    print(f"Reprocessing {len(indices)} jobs with enhanced tailoring...")
    os.makedirs('analysis_results', exist_ok=True)
    
    for i, idx in enumerate(indices):
        row = df.loc[idx]
        jd = str(row['Job_Description'])
        
        reqs = extract_jd_requirements(jd)
        
        analysis = {
            "ats_score": calculate_ats_score(reqs),
            "location": get_location(row['Location'], jd),
            "tech_stack": tailor_tech_stack(reqs),
            "points": tailor_points(reqs, jd)
        }
        
        company = re.sub(r'[^a-z0-9]', '_', str(row['Company']).lower())[:25]
        title = re.sub(r'[^a-z0-9]', '_', str(row['Job_Title']).split('\n')[0].lower())[:25]
        filename = f"{company}_{title}_{idx}.json"
        filepath = f"analysis_results/{filename}"
        
        with open(filepath, 'w') as f:
            json.dump(analysis, f, indent=2)
        
        df.at[idx, 'Analysis_File'] = filepath
        print(f"[{i+1}/{len(indices)}] {row['Company'][:20]} | ATS: {analysis['ats_score']} | 6 points")
    
    df.to_excel('jobs_master.xlsx', index=False)
    print(f"\nDone! {len(indices)} jobs reprocessed with 6 tailored points each.")

if __name__ == "__main__":
    main()
