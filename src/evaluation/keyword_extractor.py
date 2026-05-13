"""
Multi-tier ATS keyword extractor.

Tier 1 — whitelist scan: match expanded common_skills.txt against JD text.
Tier 2 — pattern extraction: pull terms from signal phrases + parenthetical lists in JD.
Tier 3 — resume comparison: diff JD keywords against actual resume text (not static file).
Groq fallback — only fired when Tier1+2 yield < MIN_KEYWORDS for a JD; cached by JD hash.
"""

import json
import re
import hashlib
from pathlib import Path
from typing import Optional

from ..settings import settings

MIN_KEYWORDS_BEFORE_GROQ = 6
GROQ_CACHE_FILE = Path(__file__).parent.parent.parent / "data" / "keyword_groq_cache.json"

# Phrases that signal a skill list follows — stops at conjunctions/prepositions to avoid long phrases
_SIGNAL_RE = re.compile(
    r'(?:experience|proficiency|expertise|knowledge|familiarity|background|skilled|working knowledge)'
    r'(?:\s+(?:with|in|of|using))+\s+'
    r'([A-Za-z0-9][A-Za-z0-9\-\+\#\.]{0,30}(?:\s[A-Za-z0-9\-\+\#\.]{1,20}){0,3}?)'
    r'(?=\s*(?:and|or|for|,|;|\n|•|\-|\(|$))',
    re.IGNORECASE | re.MULTILINE,
)

# Parenthetical lists: "(Python, NumPy, pandas)"
_PAREN_RE = re.compile(r'\(([A-Za-z0-9][A-Za-z0-9\-\+\#\.\s,/]{3,100})\)')

# Bullet line: lines starting with •/-/* followed by short tech noun
_BULLET_RE = re.compile(
    r'^[\s]*[•\-\*]\s*([A-Z][A-Za-z0-9\-\+\#\.\/\s]{1,40}?)(?=\s*[:\n,]|$)',
    re.MULTILINE,
)

_TRAILING_QUALIFIERS = re.compile(
    r'\s+(?:required|preferred|preferred|mandatory|is a plus|plus|bonus|optional|a plus)\s*$',
    re.IGNORECASE,
)

_STOP_WORDS = {
    'the', 'and', 'or', 'for', 'with', 'in', 'on', 'of', 'to', 'a', 'an',
    'is', 'are', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'team', 'work', 'role', 'job', 'position', 'experience', 'knowledge',
    'ability', 'skill', 'skills', 'strong', 'excellent', 'good', 'great',
    'looking', 'seeking', 'required', 'preferred', 'plus', 'bonus', 'etc',
    'including', 'such', 'as', 'new', 'up', 'minimum', 'years', 'year',
    'degree', 'bachelor', 'master', 'phd', 'cs', 'related', 'field',
    'using', 'use', 'used', 'build', 'building', 'develop', 'developing',
    'create', 'creating', 'design', 'designing', 'implement', 'implementing',
    'you', 'your', 'our', 'we', 'us', 'their', 'this', 'that', 'these',
    'those', 'not', 'but', 'if', 'then', 'when', 'while', 'where', 'how',
    'what', 'who', 'which', 'about', 'into', 'from', 'at', 'by', 'an',
    'other', 'more', 'most', 'some', 'any', 'all', 'both', 'each', 'few',
    'join', 'help', 'make', 'take', 'give', 'get', 'set', 'run', 'work',
    'nice', 'have', 'nice-to-have', 'bonus', 'optional',
    # generic business/job-description words — not skills
    'product', 'engineering', 'guidance', 'access', 'support', 'management',
    'solutions', 'systems', 'services', 'processes', 'practices', 'tools',
    'applications', 'projects', 'environments', 'frameworks', 'technologies',
    'high', 'quality', 'fast', 'large', 'scale', 'cross', 'functional',
    'written', 'verbal', 'communication', 'problem', 'solving', 'analytical',
    'detail', 'oriented', 'self', 'motivated', 'driven', 'passionate',
    'e.g', 'i.e', 'ie', 'eg',
    # soft skills / work arrangements — not tech skills
    'leadership', 'mentoring', 'coaching', 'collaboration', 'ownership',
    'onsite', 'on-site', 'hybrid', 'remote', 'in-person', 'office',
    'problem solving', 'critical thinking', 'time management',
    'my email address', 'cell phone number', 'phone number', 'email address',
    'etc.', 'solid', 'hands-on', 'hands on', 'day-to-day',
}


# Alias groups — all forms in a group are treated as the same skill.
# When user has any form in their resume, none of the other forms count as missing.
_ALIAS_GROUPS: list[set] = [
    {'aws', 'amazon web services', 'amazon aws'},
    {'gcp', 'google cloud platform', 'google cloud'},
    {'azure', 'microsoft azure', 'azure cloud'},
    {'k8s', 'kubernetes'},
    {'js', 'javascript'},
    {'ts', 'typescript'},
    {'postgres', 'postgresql', 'psql'},
    {'mongo', 'mongodb'},
    {'es', 'elasticsearch', 'elastic search'},
    {'tf', 'tensorflow'},
    {'iac', 'infrastructure as code'},
    {'llm', 'large language models', 'large language model'},
    {'gen ai', 'generative ai'},
    {'ml', 'machine learning'},
    {'dl', 'deep learning'},
    {'nlp', 'natural language processing'},
    {'cv', 'computer vision'},
    {'ci/cd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery'},
    {'oop', 'object oriented programming', 'object-oriented programming'},
    {'rest', 'restful', 'rest api', 'restful api'},
    {'sql', 'structured query language'},
    {'nosql', 'no-sql'},
]

# flat map: term -> canonical (shortest in group)
_ALIAS_MAP: dict[str, str] = {}
for _group in _ALIAS_GROUPS:
    _canonical = min(_group, key=len)
    for _term in _group:
        _ALIAS_MAP[_term] = _canonical


def _to_canonical(term: str) -> str:
    """Normalize a term to its canonical alias, or return as-is."""
    return _ALIAS_MAP.get(term.lower(), term.lower())


def _load_whitelist() -> list[str]:
    path = Path(settings.COMMON_SKILLS_FILE)
    if not path.exists():
        return []
    skills = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            skills.append(line)
    return skills


def _normalize(term: str) -> str:
    t = _TRAILING_QUALIFIERS.sub('', term.strip())
    return t.strip().lower()


def _is_useful(term: str) -> bool:
    t = term.strip()
    if len(t) < 2:
        return False
    tl = t.lower()
    if tl in _STOP_WORDS:
        return False
    if re.match(r'^\d+$', t):
        return False
    # reject pure-punctuation or abbreviation artifacts like "e.g.", "i.e."
    if re.match(r'^[a-z]\.[a-z]\.?$', tl):
        return False
    # reject if all non-alpha characters (e.g. "/", "--")
    if not re.search(r'[a-zA-Z]{2,}', t):
        return False
    # reject if first word is a stop word (e.g. "nice to have", "knowledge of")
    first_word = t.split()[0].lower() if t.split() else ''
    if first_word in _STOP_WORDS:
        return False
    # max 4 words for pattern-extracted terms
    if len(t.split()) > 4:
        return False
    return True


_whitelist: list[str] = []
_whitelist_lower: list[str] = []
_whitelist_re: Optional[re.Pattern] = None


def _get_whitelist() -> tuple[list[str], list[str]]:
    global _whitelist, _whitelist_lower, _whitelist_re
    if not _whitelist:
        _whitelist = _load_whitelist()
        _whitelist_lower = [s.lower() for s in _whitelist]
        # single alternation regex — one pass per text instead of N passes
        # sort longest-first so longer phrases match before sub-terms
        sorted_terms = sorted(_whitelist_lower, key=len, reverse=True)
        alt = '|'.join(re.escape(t) for t in sorted_terms)
        _whitelist_re = re.compile(r'(?<![a-z0-9])(' + alt + r')(?![a-z0-9])')
    return _whitelist, _whitelist_lower


def scan_whitelist(text: str) -> set[str]:
    """Tier 1: find all whitelist skills present in text (case-insensitive whole-word)."""
    _get_whitelist()
    assert _whitelist_re is not None
    return set(_whitelist_re.findall(text.lower()))


def extract_patterns(text: str) -> set[str]:
    """Tier 2: pull candidate terms from signal phrases, parens, bullets."""
    candidates = set()

    for m in _SIGNAL_RE.finditer(text):
        raw = m.group(1).strip()
        for part in re.split(r'[,/]', raw):
            part = _normalize(part)
            if _is_useful(part):
                candidates.add(part)

    for m in _PAREN_RE.finditer(text):
        raw = m.group(1)
        for part in re.split(r'[,/]', raw):
            part = _normalize(part)
            if _is_useful(part):
                candidates.add(part)

    for m in _BULLET_RE.finditer(text):
        raw = _normalize(m.group(1).strip())
        if _is_useful(raw):
            candidates.add(raw)

    return candidates


def _groq_extract(jd_text: str) -> set[str]:
    """Groq fallback — only called when Tier1+2 yield < MIN_KEYWORDS. Cached by JD hash."""
    cache_key = hashlib.md5(jd_text[:3000].encode()).hexdigest()

    cache: dict = {}
    if GROQ_CACHE_FILE.exists():
        try:
            cache = json.loads(GROQ_CACHE_FILE.read_text())
        except Exception:
            cache = {}

    if cache_key in cache:
        return set(cache[cache_key])

    try:
        from groq import Groq
        if not settings.GROQ_API_KEYS:
            return set()
        client = Groq(api_key=settings.GROQ_API_KEYS[0], timeout=8.0)
        prompt = (
            "Extract ALL technical skills, tools, frameworks, libraries, and platforms "
            "mentioned in this job description. Return ONLY a JSON array of strings. "
            "No explanations, no markdown, just the array.\n\n"
            f"JD:\n{jd_text[:3000]}"
        )
        resp = client.chat.completions.create(
            model=settings.GROQ_LIGHT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=512,
        )
        raw = resp.choices[0].message.content.strip()
        # strip markdown fences if present
        raw = re.sub(r'^```[a-z]*\n?', '', raw)
        raw = re.sub(r'\n?```$', '', raw)
        extracted = json.loads(raw)
        if isinstance(extracted, list):
            terms = {str(t).lower() for t in extracted if _is_useful(str(t))}
            cache[cache_key] = list(terms)
            GROQ_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            GROQ_CACHE_FILE.write_text(json.dumps(cache, indent=2))
            return terms
    except Exception:
        pass
    return set()


def extract_jd_keywords(jd_text: str, use_groq: bool = True) -> set[str]:
    """
    Full extraction pipeline for one JD.
    Returns lowercase set of all tech keywords found in JD.
    """
    t1 = scan_whitelist(jd_text)
    t2 = extract_patterns(jd_text)
    combined = t1 | t2

    if use_groq and len(combined) < MIN_KEYWORDS_BEFORE_GROQ and settings.GROQ_API_KEYS:
        combined |= _groq_extract(jd_text)

    return combined


def extract_resume_keywords(resume_text: str) -> set[str]:
    """
    Same pipeline as JD extraction (whitelist + patterns) so the same
    normalisation is applied to both sides — prevents false 'missing' gaps.
    """
    return extract_jd_keywords(resume_text, use_groq=False)


def compute_missing(jd_text: str, resume_text: Optional[str], use_groq: bool = True) -> list[str]:
    """
    Return sorted list of keywords in JD but NOT in resume.
    Falls back to comparing against your_skills.txt if no resume_text.
    """
    jd_kws = extract_jd_keywords(jd_text, use_groq=use_groq)

    if resume_text:
        have = extract_resume_keywords(resume_text)
    else:
        # legacy fallback — read your_skills.txt
        your_skills_path = Path(settings.YOUR_SKILLS_FILE)
        if your_skills_path.exists():
            have = {line.strip().lower() for line in your_skills_path.read_text().splitlines()
                    if line.strip() and not line.startswith('#')}
        else:
            have = set()

    # Expand both sides to canonical forms so aliases match (aws ↔ amazon web services, etc.)
    have_canonical = {_to_canonical(k) for k in have}
    return sorted(k for k in jd_kws if _to_canonical(k) not in have_canonical)
