import os
import json
import hashlib
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional
import google.generativeai as genai

from src.settings import settings

class ResumeRAG:
    """
    Retrieval-Augmented Generation for Resume Context.
    Chunks the resume and retrieves relevant parts based on semantic similarity.
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.cache_dir = Path(settings.AI_CACHE_DIR) / "rag"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Configure Gemini for embeddings
        genai.configure(api_key=self.api_key)
        self.model_name = "models/gemini-embedding-001" 
        
    def _get_resume_hash(self, text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()

    def chunk_text(self, text: str, chunk_size: int = 600) -> List[str]:
        """Simple chunking by logical sections or fixed size."""
        # Try splitting by double newline (paragraphs/sections)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks = []
        
        current_chunk = ""
        for p in paragraphs:
            if len(current_chunk) + len(p) < chunk_size:
                current_chunk += "\n\n" + p if current_chunk else p
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                current_chunk = p
        
        if current_chunk:
            chunks.append(current_chunk)
            
        return chunks

    def get_embeddings(self, chunks: List[str]) -> List[List[float]]:
        """Fetch embeddings for a list of strings."""
        if not self.api_key:
            return []
        try:
            result = genai.embed_content(
                model=self.model_name,
                content=chunks,
                task_type="retrieval_document"
            )
            return result['embedding']
        except Exception as e:
            print(f"[RAG] Embedding error: {e}")
            return []

    def get_query_embedding(self, query: str) -> List[float]:
        if not self.api_key:
            return []
        try:
            result = genai.embed_content(
                model=self.model_name,
                content=query,
                task_type="retrieval_query"
            )
            return result['embedding']
        except Exception as e:
            print(f"[RAG] Query embedding error: {e}")
            return []

    def cosine_similarity(self, v1: List[float], v2: List[float]) -> float:
        a = np.array(v1)
        b = np.array(v2)
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

    def retrieve_relevant_context(self, resume_text: str, query: str, top_k: int = 3) -> str:
        """Main entry point: find the best resume chunks for a given question/label."""
        if not settings.RAG_ENABLED or not resume_text:
            return resume_text[:2500] # Fallback to truncated full resume

        resume_id = self._get_resume_hash(resume_text)
        cache_file = self.cache_dir / f"{resume_id}.json"
        
        if cache_file.exists():
            with open(cache_file, 'r') as f:
                data = json.load(f)
                chunks = data['chunks']
                embeddings = data['embeddings']
        else:
            print("[RAG] Indexing resume...")
            chunks = self.chunk_text(resume_text, settings.RAG_CHUNK_SIZE)
            embeddings = self.get_embeddings(chunks)
            if chunks and embeddings:
                with open(cache_file, 'w') as f:
                    json.dump({'chunks': chunks, 'embeddings': embeddings}, f)
            else:
                return resume_text[:2000]

        query_emb = self.get_query_embedding(query)
        if not query_emb:
            return resume_text[:2000]

        # Score chunks
        scores = []
        for i, emb in enumerate(embeddings):
            score = self.cosine_similarity(query_emb, emb)
            scores.append((score, chunks[i]))

        # Sort by score descending
        scores.sort(key=lambda x: x[0], reverse=True)
        
        # Take top K and join
        top_chunks = [s[1] for s in scores[:top_k]]
        return "\n\n---\n\n".join(top_chunks)
    def build_pinned_context(self, profile: Any) -> str:
        """
        Build the always-included structured-facts block from full_profile.
        Authoritative — LLM is instructed to prefer these over raw resume text.
        Accepts either a UserProfile ORM object or a plain full_profile dict.
        """
        fp = profile if isinstance(profile, dict) else (getattr(profile, 'full_profile', {}) or {})
        personal = fp.get("personal", {})
        exper = fp.get("experience", {})
        facts = fp.get("resume_facts", {})
        work_auth = fp.get("work_authorization", {})
        compensation = fp.get("compensation", {})
        skills_boundary = fp.get("skills_boundary", {})

        # Pull target_roles / parsed_skills from ORM attribute if available (more current)
        target_roles = getattr(profile, 'target_roles', None) or fp.get("target_roles_preference", [])
        parsed_skills = getattr(profile, 'parsed_skills', None) or []

        lines = []

        # Name & contact
        full_name = personal.get("full_name") or (
            f"{personal.get('first_name', '')} {personal.get('last_name', '')}".strip()
        )
        if full_name:
            lines.append(f"CANDIDATE NAME: {full_name}")
        preferred = personal.get("preferred_name")
        if preferred and preferred != full_name:
            lines.append(f"PREFERRED NAME: {preferred}")
        if personal.get("email"):
            lines.append(f"EMAIL: {personal['email']}")
        if personal.get("phone"):
            lines.append(f"PHONE: {personal['phone']}")

        # Role & experience
        if exper.get("current_title"):
            lines.append(f"CURRENT ROLE: {exper['current_title']}")
        if exper.get("years_of_experience_total"):
            lines.append(f"YEARS EXPERIENCE: {exper['years_of_experience_total']}")
        if exper.get("education_level"):
            lines.append(f"EDUCATION: {exper['education_level']}")

        # Target roles
        if target_roles:
            lines.append(f"TARGET ROLES: {', '.join(target_roles[:5])}")

        # Compensation
        if compensation.get("salary_expectation"):
            sal_min = compensation.get("salary_range_min", "")
            sal_max = compensation.get("salary_range_max", "")
            sal_line = f"SALARY EXPECTATION: ${compensation['salary_expectation']}"
            if sal_min and sal_max:
                sal_line += f" (range ${sal_min}–${sal_max})"
            if compensation.get("currency_conversion_note"):
                sal_line += f". Note: {compensation['currency_conversion_note']}"
            lines.append(sal_line)

        # Top companies
        companies = facts.get("preserved_companies", [])
        if companies:
            lines.append(f"TOP COMPANIES: {', '.join(companies[:5])}")

        # Key metrics
        metrics = facts.get("real_metrics", [])
        if metrics:
            lines.append("KEY METRICS:\n" + "\n".join(f"- {m}" for m in metrics[:6]))

        # Skills — prefer detailed skills_boundary over flat parsed_skills list
        if skills_boundary:
            skill_parts = []
            if skills_boundary.get("programming_languages"):
                skill_parts.append("Languages: " + ", ".join(skills_boundary["programming_languages"][:8]))
            if skills_boundary.get("frameworks"):
                skill_parts.append("Frameworks: " + ", ".join(skills_boundary["frameworks"][:10]))
            if skills_boundary.get("tools"):
                skill_parts.append("Tools: " + ", ".join(skills_boundary["tools"][:10]))
            if skills_boundary.get("ml_specializations"):
                skill_parts.append("ML: " + ", ".join(skills_boundary["ml_specializations"][:8]))
            if skill_parts:
                lines.append("SKILLS:\n" + "\n".join(skill_parts))
        elif parsed_skills:
            lines.append(f"TOP SKILLS: {', '.join(parsed_skills[:15])}")

        # Work authorization
        if work_auth:
            auth = work_auth.get("legally_authorized_to_work")
            sponsor = work_auth.get("require_sponsorship")
            if auth is not None:
                lines.append(
                    f"WORK AUTH: authorized={auth}; sponsorship_required={sponsor if sponsor is not None else 'unknown'}"
                )

        if not lines:
            return ""

        header = "=== PINNED PROFILE FACTS (authoritative — prefer over resume text when they disagree) ==="
        return header + "\n" + "\n".join(lines)

    def build_hybrid_context(
        self,
        profile: Any,
        query: str,
        resume_text: Optional[str] = None,
        top_k: Optional[int] = None,
        ratio: Optional[float] = None,
        total_budget: int = 4000,
    ) -> str:
        """
        Hybrid context = pinned structured facts (always) + RAG-retrieved resume snippets.
        ratio controls what fraction of total_budget is allocated to retrieved chunks.
        """
        effective_top_k = top_k if top_k is not None else settings.RAG_MAX_CHUNKS
        effective_ratio = ratio if ratio is not None else settings.RAG_CONTEXT_RATIO

        pinned = self.build_pinned_context(profile)

        dynamic_snippets = ""
        if resume_text:
            raw_snippets = self.retrieve_relevant_context(resume_text, query, top_k=effective_top_k)
            max_chunk_chars = int(total_budget * effective_ratio)
            dynamic_snippets = raw_snippets[:max_chunk_chars]

        parts = []
        if pinned:
            parts.append(pinned)
        if dynamic_snippets:
            parts.append("=== RETRIEVED RESUME SNIPPETS (supporting evidence) ===\n" + dynamic_snippets)

        return "\n\n".join(parts)

    def get_optimized_context(self, profile: Any, query: str, resume_text: Optional[str] = None, top_k: int = 3) -> str:
        """Backward-compat wrapper around build_hybrid_context."""
        return self.build_hybrid_context(profile, query, resume_text=resume_text, top_k=top_k)


# Singleton
rag_service = ResumeRAG(api_key=settings.GEMINI_API_KEY)
