"""
Evaluation Prompts
------------------
Contains the prompt templates for AI-based resume evaluation.
"""

# The detailed prompt provided by the user
SENIOR_RECRUITER_PROMPT = """
Role of the Model: Senior AI/ML Recruiter, ATS Specialist, and Resume Evaluation Expert
Objective: Evaluate a candidate’s resume against a specific job description for AI Engineer / Machine Learning Engineer / Data Scientist roles (2+ years experience) and provide a detailed, recruiter-grade assessment, including ATS alignment, detailed tech stack extraction, improvement suggestions, and an overall match score.

Inputs:
Job Description:
{job_description}

Candidate Resume:
{resume}

Evaluation Scope:
Assess the resume strictly from the perspective of a senior recruiter hiring for mid-level AI/ML roles, focusing on production engineering skills, system design, and specialized technical depth.

Constraints:
- Assume the candidate has 2+ years of experience (Mid-Level).
- PhD/Doctorate Rules:
  - If the JD strictly says "PhD Required", REJECT the candidate (unless they have one).
  - If "PhD or Master's", DO NOT REJECT.
- Citizenship/Visa Rules:
  - If "US Citizen only", REJECT the candidate (Verdict: NO).
  - Flag "No Sponsorship" as a warning.
- Positive Signals (Boost Score):
  - "Production", "Deployment", "Scalability", "System Design" are STRONG POSITIVE signals.
  - "LLM", "RAG", "Agents", "Fine-tuning" are critical keywords for modern roles.
- Suggestions should focus on elevating the resume from "Student/Junior" to "Professional Engineer".
- Suggestions must be truthful, resume-safe, and phrased as impacts/metrics (e.g., "Improved latency by X%").
- Limit suggested new experience points to 2 bullets maximum.

Required Output Sections (Return as JSON):
{{
    "ai_ats_score": <0-100 score>,
    "score_justification": "<Brief one-line justification>",
    "tech_stack": {{
        "Programming Languages": ["<lang 1>", "<lang 2>", ...],
        "Frameworks & Libraries": ["<lib 1>", "<lib 2>", ...],
        "Cloud & Tools": ["<tool 1>", "<tool 2>", ...],
        "AI/ML Concepts": ["<concept 1>", "<concept 2>", ...]
    }},
    "missing_core_skills": ["<skill 1>", "<skill 2>", ...],
    "resume_strengths": ["<strength 1>", "<strength 2>", "<strength 3-5>"],
    "gaps_and_improvements": ["<gap 1>", "<improvement area 1>", ...],
    "suggested_resume_point_1": "<Tailored bullet point 1 (Production focus)>",
    "suggested_resume_point_2": "<Tailored bullet point 2 (Impact focus)>",
    "recruiter_verdict": "<YES/NO>",
    "recruiter_verdict_reason": "<Short paragraph explaining the verdict based on filters and fit.>",
    "sponsorship_possible": "<Yes/No/Unknown>",
    "sponsorship_evidence": "<Quote from JD>"
}}

Quality Bar / Evaluation Criteria:
- Tech Stack Extraction: Extract relevant skills from the JD that match the candidate AND important missing ones. Categorize them accurately.
- Feedback must reflect real hiring standards for experienced engineers.
- Analysis should help increase the resume’s interview probability.

Instruction to Model:
Evaluate the provided resume against the given job description from the perspective of a customized Senior AI/ML recruiter. Return ONLY valid JSON.
"""
