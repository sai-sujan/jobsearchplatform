import json
import random
import os
from pathlib import Path
from pydantic import BaseModel

# Try to import settings. Depending on where this is called from, path might vary.
try:
    from src.settings import settings
except ImportError:
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
    from src.settings import settings

try:
    from groq import Groq
except ImportError:
    pass

class TailorServiceError(Exception):
    pass

def generate_tailored_resume_data(job_description: str) -> dict:
    """
    Given a job description, uses the Groq LLM (with fallback rotation) 
    to generate an ATS score, location, tailored tech stack, and points.
    
    Returns a dictionary matching the required JSON format.
    Raises TailorServiceError if all keys/models fail.
    """
    if not hasattr(settings, 'GROQ_API_KEYS') or not settings.GROQ_API_KEYS:
        raise TailorServiceError("GROQ_API_KEYS not configured in settings")
        
    prompt = f"""
You are a Senior AI/ML Recruiter and ATS Optimization Specialist with 10+ years of experience. Your task is to analyze a candidate's resume against a job description and produce a tailored JSON output that maximizes ATS score while maintaining authenticity.

---

## CANDIDATE PROFILE

Name: Sujan Dora  
Target Role: AI/ML Engineer (0-2 years experience)  
Location: Springfield, MO, USA (Open to Relocate)

---

## MASTER RESUME - TECHNICAL SKILLS

Programming Languages: Python, SQL  
ML Frameworks & Libraries: TensorFlow, PyTorch, Scikit-learn, Hugging Face Transformers  
LLM & NLP Tools: LangChain, LangGraph, LangSmith, LlamaIndex, Agents, Multi-Agents, LoRA, QLoRA, OpenAI, Ollama, RAG Systems  
MLOps & Deployment: MLflow, Git, GitHub Actions, CI/CD Pipelines, Model Deployment  
Cloud & Infrastructure: AWS (Lambda, S3, EC2, ECR, API Gateway)  
Databases & AI Infrastructure: PostgreSQL, MySQL, Milvus, Weaviate, FAISS, MongoDB  
Web & DevOps: FastAPI, Docker Containerization  
ML Specializations: NLP, Computer Vision, Deep Learning, Anomaly Detection

---

## MASTER RESUME - EXPERIENCE BULLETS (AI/ML Engineer)

1. Implemented a self-correcting RAG system using LangChain and Mistral 7B, improving answer reliability and mitigating context errors in document-level QA.
2. Built a hybrid retrieval workflow combining dense embeddings and BM25 search, enhancing relevance and coverage of retrieved documents.
3. Developed an LLM-as-Judge evaluation pipeline to assess faithfulness and relevance across hundreds of QA examples, ensuring production-ready reliability.
4. Introduced batched query extraction, reducing LLM calls by ~80% per query and enabling faster, reliable production inference.
5. Designed an ML-based anomaly detection system for MFA workflows, reducing redundant verification prompts by 25%, improving user experience while maintaining security coverage.

---

## ADDITIONAL BULLETS (Use selectively based on JD focus)

- Implemented CI/CD pipeline with GitHub Actions to automate model retraining and deployment to AWS (S3, ECR, API Gateway), ensuring reliable and repeatable ML releases.
- Containerized and deployed ML solutions using Docker and AWS, enabling scalable production-ready pipelines for AI applications.
- Built a multi-agent research workflow using CrewAI with PubMed retrieval via Model Context Protocol, enabling interactive biomedical QA.
- Fine-tuned Llama-3.1-8B using QLoRA on domain-specific data with 4-bit quantization, gaining hands-on experience in parameter-efficient LLM training.
- Built a National ID authentication system using YOLO object detection, MiDaS depth estimation, and GAN-generated synthetic samples for robust hologram verification.
- Conducted exploratory data analysis on 30,000+ customer records to identify key features, achieving 87% model accuracy on predictive tasks.
- Built end-to-end ML pipeline using ZenML and MLflow, deploying a REST API on AWS Lambda with Docker for automated training and inference.
- Implemented a tool-using LLM agent (LangGraph/ReAct) with multi-channel frontends (Streamlit, Twilio WhatsApp) and integrated APIs for real-time outputs.

---

## JOB DESCRIPTION

{job_description}

---

## OUTPUT FORMAT

{{
  "ats_score": <integer 55-95>,
  "location": "<job location> (Open to relocate)",
  "tech_stack": {{
    "Programming Languages": [...],
    "ML Frameworks & Libraries": [...],
    "LLM & NLP Tools": [...],
    "MLOps & Deployment": [...],
    "Cloud & Infrastructure": [...],
    "Databases & AI Infrastructure": [...],
    "Web & DevOps": [...],
    "ML Specializations": [...]
  }},
  "points": [
    "<bullet 1>",
    "<bullet 2>",
    "<bullet 3>",
    "<bullet 4>",
    "<bullet 5>"
  ]
}}

---

## DETAILED INSTRUCTIONS

### 1. ATS SCORE CALCULATION
- High (85-95): LLM/RAG/GenAI/Agentic AI roles, NLP-focused, LangChain/OpenAI mentioned, production ML
- Medium (70-84): General ML Engineer, Data Science with some NLP, MLOps roles
- Low (55-69): Pure CV (non-NLP), heavy Spark/Big Data, security red team, supply chain, roles requiring tech we don't have

### 2. TECH STACK RULES — ATS OPTIMIZATION
- Keep the exact 8 headings from the MASTER RESUME.
- Base the lists on the candidate's existing skills.
- CRITICAL: You MUST ADD all specific tools, libraries, frameworks, and methodologies mentioned in the JD (e.g., Vertix, DML, Sagemaker, Causal Inference) to the most logical category to ensure they pass the ATS keyword scanner.
- Keep the original skills, but feel free to remove skills that are completely irrelevant to the JD to make room.

### 3. BULLET POINT RULES
- OVERRIDING GOAL: Maximize ATS Score (hit 90+) by embedding 3 to 5 highly specific JD keywords into the bullets.
- STRICT ANTI-FLUFF RULE: Do NOT append generic buzzwords. Extract the EXACT specific hard tools, libraries, and methodologies from the JD and embed them naturally.
- CRITICAL LENGTH CONSTRAINT: EVERY single bullet point MUST be UNDER 115 CHARACTERS TOTAL. This is a hard limit. Count the characters. If any bullet exceeds 115 characters, it will overflow the PDF and the resume is RUINED.
- NO run-on sentences. NO orphan words. Remove all filler words. Be brutally concise. Prioritize technical impact.
- Foundation: Use the 5 original experience bullets as your starting point.
- For Bullets 1-4: Keep the underlying project, but dramatically shorten the phrasing and inject 2-3 JD-specific hard keywords.
- For Bullet 5 (Flex Point): You have TOTAL FREEDOM. Rewrite it to target the most critical JD requirements not covered by bullets 1-4. Keep it under 115 characters.

### 4. LOCATION RULE
- Set the output "location" to the exact city/state from the JOB DESCRIPTION (e.g., "Austin, TX", "Seattle, WA").
- Do NOT output the candidate's current location. Output the job's location.
- If "Remote" or no location given, default to "Springfield, MO, USA (Open to relocate)".

### 5. JSON RULES
- Return ONLY valid JSON. No markdown code fences. No explanation text outside the JSON.
- All keys (ats_score, location, tech_stack, points) MUST be present.
- "points" must be exactly 5 strings, each under 115 characters.
- Do NOT prepend \\item to the points.
"""
    import re

    # Reasoning models (like gpt-oss-120b) don't support response_format=json_object
    REASONING_MODELS = {"openai/gpt-oss-120b", "openai/gpt-oss-20b"}

    def _extract_json_from_text(text):
        """Extract JSON from freeform text that may contain markdown fences or explanation."""
        if not text:
            return None
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        # Try extracting from markdown code fence
        match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        # Try finding first { to last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end+1])
            except json.JSONDecodeError:
                pass
        return None

    # Use 120B reasoning model as primary, 70B as reliable fallback
    models_to_try = ["openai/gpt-oss-120b", settings.GROQ_MODEL]
    last_exception = None
    
    for model_name in models_to_try:
        keys_to_try = list(settings.GROQ_API_KEYS)
        random.shuffle(keys_to_try)
        is_reasoning_model = model_name in REASONING_MODELS
        
        for api_key in keys_to_try:
            try:
                client = Groq(api_key=api_key)
                
                # Build request kwargs
                kwargs = {
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a precise JSON-only API. Return strictly valid JSON and nothing else. No markdown fences, no explanation text."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "model": model_name,
                    "temperature": 0.3,
                    "max_tokens": 2000
                }
                
                # Reasoning models don't support response_format
                if not is_reasoning_model:
                    kwargs["response_format"] = {"type": "json_object"}
                
                response = client.chat.completions.create(**kwargs)
                
                # Parse output
                result_text = response.choices[0].message.content
                
                if is_reasoning_model:
                    tailored_data = _extract_json_from_text(result_text)
                    if tailored_data is None:
                        raise ValueError(f"Could not extract valid JSON from reasoning model response")
                else:
                    tailored_data = json.loads(result_text)
                
                # Validate required keys are present
                required_keys = {"ats_score", "location", "tech_stack", "points"}
                if not required_keys.issubset(tailored_data.keys()):
                    missing = required_keys - tailored_data.keys()
                    raise ValueError(f"Missing required keys in response: {missing}")
                
                print(f"[tailor_service] Success with model {model_name}")
                return tailored_data
                
            except Exception as e:
                print(f"[tailor_service] Error with key {api_key[:8]}... on model {model_name}: {e}")
                last_exception = e
                error_str = str(e).lower()
                if "429" in error_str or "rate limit" in error_str or "401" in error_str or "json" in error_str or "extract" in error_str:
                    print(f"[tailor_service] Rotating to next key/model...")
                    continue
                else:
                    raise TailorServiceError(str(e))
                
    raise TailorServiceError(f"All Groq API keys and fallback models failed. Last error: {str(last_exception)}")
