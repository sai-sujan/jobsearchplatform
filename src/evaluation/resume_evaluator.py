"""
ResumeEvaluator Module
----------------------
Uses AirLLM for memory-efficient local LLM inference on M2 Mac.
Evaluates resumes against job descriptions for early-career AI/ML candidates.

INSTALLATION (M2 Mac):
    pip install torch torchvision torchaudio
    pip install airllm transformers accelerate safetensors

MODEL DOWNLOAD (auto-downloads on first use, or manually):
    python -c "from airllm import AutoModel; AutoModel.from_pretrained('google/gemma-2-2b-it')"
"""

import json
import re
import os
from typing import List, Tuple
from dataclasses import dataclass, field


from .prompts import SENIOR_RECRUITER_PROMPT

@dataclass
class EvaluationResult:
    """Data class for resume evaluation results."""
    # ats_score: int = 0  # Replaced by property below
    keyword_match_score: int = 0
    
    # New AI Evaluator Fields
    ai_ats_score: int = 0
    
    @property
    def ats_score(self) -> int:
        return self.ai_ats_score
    score_justification: str = ""
    
    missing_core_skills: List[str] = field(default_factory=list)
    missing_tools_frameworks: List[str] = field(default_factory=list)
    missing_ml_ai_concepts: List[str] = field(default_factory=list)
    
    resume_strengths: List[str] = field(default_factory=list)
    gaps_and_improvements: List[str] = field(default_factory=list)
    
    suggested_resume_point_1: str = ""
    suggested_resume_point_2: str = ""
    
    recruiter_verdict: str = ""  # YES/NO
    recruiter_verdict_reason: str = ""
    
    sponsorship_possible: str = "Unknown"
    sponsorship_evidence: str = ""
    
    apply_verdict: str = "Unknown" # Legacy field
    
    raw_response: str = ""


class ResumeEvaluator:
    """
    Evaluates resumes using AirLLM (memory-efficient for M2 Mac).
    Tailored for early-career AI/ML candidates (0-2 years experience).
    """

    # Use the detailed user-provided prompt
    EVALUATION_PROMPT = SENIOR_RECRUITER_PROMPT

    def __init__(self, model_name: str = "google/gemma-2-2b-it", cache_dir: str = None,
                 model: str = None,
                 ollama_url: str = "http://localhost:11434",
                 ollama_model: str = "gemma3:12b"):
        """
        Initialize with AirLLM for M2 Mac.

        Args:
            model_name: HuggingFace model ID
            cache_dir: Directory to cache model weights
            model: Alternate argument name for model_name
            ollama_url: URL for Ollama fallback
            ollama_model: Model name for Ollama fallback
        """
        self.model_name = model or model_name
        self.cache_dir = cache_dir or os.path.expanduser("~/.cache/airllm")
        self.ollama_url = ollama_url
        self.ollama_model = ollama_model
        
        self.model = None
        self.tokenizer = None
        self.resume_text = ""
        self._model_loaded = False

    def _load_model(self):
        """Lazy load the AirLLM model."""
        if self._model_loaded:
            return True

        try:
            print(f"[INFO] Loading AirLLM model: {self.model_name}")
            print("[INFO] First run will download model (~2-8GB depending on model)...")

            from airllm import AutoModel

            # AirLLM handles memory-efficient loading automatically
            self.model = AutoModel.from_pretrained(
                self.model_name,
                compression='4bit',  # Use 4-bit quantization for M2 Mac
            )

            self._model_loaded = True
            print(f"[INFO] Model loaded successfully")
            return True

        except ImportError:
            print("[ERROR] AirLLM not installed. Run: pip install airllm")
            return False
        except Exception as e:
            print(f"[ERROR] Failed to load model: {e}")
            print("[INFO] Falling back to Ollama if available...")
            return self._try_ollama_fallback()

    def _try_ollama_fallback(self) -> bool:
        """Try to use Ollama as fallback if AirLLM fails."""
        try:
            import requests
            response = requests.get(f"{self.ollama_url}/api/tags", timeout=3)
            if response.status_code == 200:
                print(f"[INFO] Using Ollama as fallback ({self.ollama_model})")
                self._use_ollama = True
                return True
        except:
            pass
        return False

    def _generate_with_airllm(self, prompt: str, max_tokens: int = 1500) -> str:
        """Generate text using AirLLM."""
        try:

            if not self._model_loaded:
                # Try loading model
                loaded = self._load_model()
                
                # Check if we switched to Ollama during load
                if hasattr(self, '_use_ollama') and self._use_ollama:
                    return self._generate_with_ollama(prompt)
                
                if not loaded:
                    return ""

            # AirLLM generation
            input_ids = self.model.tokenizer(
                prompt,
                return_tensors="pt",
                truncation=True,
                max_length=4096
            ).input_ids

            generation_output = self.model.generate(
                input_ids,
                max_new_tokens=max_tokens,
                temperature=0.3,
                do_sample=True,
                top_p=0.9,
            )

            output = self.model.tokenizer.decode(generation_output[0], skip_special_tokens=True)

            # Extract only the generated part (after prompt)
            if prompt in output:
                output = output[len(prompt):].strip()

            return output

        except Exception as e:
            print(f"[ERROR] AirLLM generation failed: {e}")
            return ""

    def _generate_with_ollama(self, prompt: str, system: str = "") -> str:
        """Fallback to Ollama if AirLLM fails."""
        try:
            import requests
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.ollama_model,
                    "prompt": prompt,
                    "system": system,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": 1500}
                },
                timeout=120
            )
            if response.status_code == 200:
                return response.json().get('response', '')
        except Exception as e:
            print(f"[WARNING] Ollama fallback failed: {e}")
        return ""

    def _generate(self, prompt: str, system: str = "") -> str:
        """Generate text using available backend."""
        if hasattr(self, '_use_ollama') and self._use_ollama:
            return self._generate_with_ollama(prompt, system)
        return self._generate_with_airllm(prompt)

    def _extract_json(self, text: str) -> dict:
        """Extract JSON from text, handling various formats."""
        text = text.strip()

        # Remove markdown code blocks
        if '```' in text:
            match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
            if match:
                text = match.group(1).strip()

        # Find JSON object
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            text = json_match.group(0)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try fixing common issues
            text = re.sub(r',\s*}', '}', text)  # Remove trailing commas
            text = re.sub(r',\s*]', ']', text)
            try:
                return json.loads(text)
            except:
                return {}

    def load_resume(self, resume_path: str) -> bool:
        """Load resume from file."""
        try:
            with open(resume_path, 'r', encoding='utf-8') as f:
                self.resume_text = f.read()
            print(f"[INFO] Resume loaded: {len(self.resume_text)} characters")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to load resume: {e}")
            return False

    def evaluate(
        self,
        job_description: str,
        company_name: str,
        job_title: str
    ) -> EvaluationResult:
        """
        Evaluate resume against job description.
        Tailored for early-career candidates.
        """
        result = EvaluationResult()

        if not self.resume_text:
            print("[ERROR] No resume loaded")
            return result

        if not job_description or len(job_description) < 50:
            result.recruiter_verdict_reason = "Unable to evaluate - job description not available"
            return result

        try:
            print(f"[INFO] AI Evaluating: {job_title} at {company_name}")

            # Format prompt
            # Note: Company and Title are not explicitly in the template anymore, but JD is.
            # We can prepend them to JD for context.
            full_jd = f"COMPANY: {company_name}\nTITLE: {job_title}\n\n{job_description}"
            
            prompt = self.EVALUATION_PROMPT.format(
                resume=self.resume_text[:4000],  # Increased context
                job_description=full_jd[:4000]
            )

            # Generate evaluation
            response_text = self._generate(prompt)
            result.raw_response = response_text

            # Parse JSON
            data = self._extract_json(response_text)

            if not data:
                print("[WARNING] Could not parse evaluation response")
                result.recruiter_verdict_reason = "Evaluation parsing failed"
                return result

            # Populate result
            result.ai_ats_score = int(data.get('ai_ats_score', 0))
            result.score_justification = data.get('score_justification', '')
            
            # Handling Lists
            result.missing_core_skills = data.get('missing_core_skills', [])
            result.missing_tools_frameworks = data.get('missing_tools_frameworks', [])
            result.missing_ml_ai_concepts = data.get('missing_ml_ai_concepts', [])
            result.resume_strengths = data.get('resume_strengths', [])
            result.gaps_and_improvements = data.get('gaps_and_improvements', [])
            
            # Specific Points
            result.suggested_resume_point_1 = data.get('suggested_resume_point_1', '')
            result.suggested_resume_point_2 = data.get('suggested_resume_point_2', '')
            
            # Verdict
            result.recruiter_verdict = data.get('recruiter_verdict', 'Unknown')
            result.recruiter_verdict_reason = data.get('recruiter_verdict_reason', '')
            
            # Sponsorship
            result.sponsorship_possible = data.get('sponsorship_possible', 'Unknown')
            result.sponsorship_evidence = data.get('sponsorship_evidence', '')
            
            print(f"[INFO] AI Score: {result.ai_ats_score} | Verdict: {result.recruiter_verdict}")

        except Exception as e:
            print(f"[ERROR] Evaluation failed: {e}")
            result.recruiter_verdict_reason = f"Evaluation error: {str(e)}"

        return result

    def check_sponsorship(self, job_description: str) -> Tuple[str, str]:
        """Check for visa sponsorship info based only on explicit JD text."""
        if not job_description or len(job_description) < 50:
            return "Unknown", "No job description available"

        try:
            prompt = self.SPONSORSHIP_PROMPT.format(job_description=job_description[:2000])

            response_text = self._generate(prompt)
            data = self._extract_json(response_text)

            sponsorship = data.get('sponsorship_possible', 'Unknown')
            evidence = data.get('evidence', 'No evidence found')

            # Validate
            if sponsorship not in ['Yes', 'No', 'Unknown']:
                sponsorship = 'Unknown'

            return sponsorship, evidence

        except Exception as e:
            print(f"[WARNING] Sponsorship check failed: {e}")
            return "Unknown", "Analysis failed"

    def evaluate_with_sponsorship(
        self,
        job_description: str,
        company_name: str,
        job_title: str
    ) -> EvaluationResult:
        """Full evaluation including sponsorship check."""
        result = self.evaluate(job_description, company_name, job_title)

        sponsorship, evidence = self.check_sponsorship(job_description)
        result.sponsorship_possible = sponsorship
        result.sponsorship_evidence = evidence

        return result
