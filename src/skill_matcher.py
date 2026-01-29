"""
Smart Skill Matcher - No API Required
Matches job descriptions against your skills using pattern matching
"""

import re
from pathlib import Path
from typing import Set, Dict, List, Tuple

class SkillMatcher:
    def __init__(self):
        self.common_skills = self._load_skills('config/common_skills.txt')
        self.your_skills = self._load_skills('config/your_skills.txt')
        print(f"[INFO] Loaded {len(self.common_skills)} common skills")
        print(f"[INFO] Loaded {len(self.your_skills)} your skills")
    
    def _load_skills(self, filepath: str) -> Set[str]:
        """Load skills from file, one per line"""
        skills = set()
        path = Path(filepath)
        
        if not path.exists():
            print(f"[WARNING] {filepath} not found")
            return skills
        
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                # Skip empty lines and comments
                if line and not line.startswith('#'):
                    skills.add(line.lower())
        
        return skills
    
    def extract_skills_from_text(self, text: str) -> Set[str]:
        """Extract skills mentioned in text"""
        text_lower = text.lower()
        found_skills = set()
        
        for skill in self.common_skills:
            # Create regex pattern for whole word matching
            # Handle special characters in skill names
            escaped_skill = re.escape(skill)
            pattern = r'\b' + escaped_skill + r'\b'
            
            if re.search(pattern, text_lower, re.IGNORECASE):
                found_skills.add(skill)
        
        return found_skills
    
    def calculate_match(self, job_description: str) -> Dict:
        """
        Calculate skill match percentage for a job description
        
        Returns:
            {
                'score': 75,  # percentage
                'jd_skills': ['python', 'pytorch', ...],
                'matched_skills': ['python', 'pytorch'],
                'missing_skills': ['kubernetes', 'scala'],
                'match_count': '6/10'
            }
        """
        # Extract skills from JD
        jd_skills = self.extract_skills_from_text(job_description)
        
        if not jd_skills:
            return {
                'score': 0,
                'jd_skills': [],
                'matched_skills': [],
                'missing_skills': [],
                'match_count': '0/0'
            }
        
        # Find intersection (skills you have that JD requires)
        matched_skills = jd_skills & self.your_skills
        missing_skills = jd_skills - self.your_skills
        
        # Calculate percentage
        score = int((len(matched_skills) / len(jd_skills)) * 100)
        
        return {
            'score': score,
            'jd_skills': sorted(list(jd_skills)),
            'matched_skills': sorted(list(matched_skills)),
            'missing_skills': sorted(list(missing_skills)),
            'match_count': f"{len(matched_skills)}/{len(jd_skills)}"
        }
    
    def score_job(self, job_description: str, is_premium: bool = False, 
                  is_entry_level: bool = True) -> Dict:
        """
        Score a job with bonuses
        
        Returns:
            {
                'base_score': 60,
                'bonuses': 15,
                'final_score': 75,
                'tier': 'Good Match',
                'matched_skills': [...],
                'missing_skills': [...]
            }
        """
        match_result = self.calculate_match(job_description)
        base_score = match_result['score']
        
        # Calculate bonuses
        bonuses = 0
        if is_premium:
            bonuses += 5
        if is_entry_level:
            bonuses += 10
        
        final_score = min(base_score + bonuses, 100)  # Cap at 100
        
        # Determine tier
        if final_score >= 90:
            tier = '🟢 Perfect Match'
        elif final_score >= 70:
            tier = '🟡 Good Match'
        elif final_score >= 50:
            tier = '🟠 Stretch Goal'
        else:
            tier = '🔴 Skip'
        
        return {
            'base_score': base_score,
            'bonuses': bonuses,
            'final_score': final_score,
            'tier': tier,
            'match_count': match_result['match_count'],
            'matched_skills': match_result['matched_skills'],
            'missing_skills': match_result['missing_skills'],
            'jd_skills': match_result['jd_skills']
        }


# Example usage
if __name__ == "__main__":
    matcher = SkillMatcher()
    
    # Test with sample JD
    sample_jd = """
    We're looking for an AI Engineer with experience in:
    - Python and PyTorch
    - LLM and RAG systems
    - Docker and Kubernetes
    - AWS deployment
    - NLP and Computer Vision
    """
    
    result = matcher.score_job(sample_jd, is_premium=True, is_entry_level=True)
    
    print(f"\nScore: {result['final_score']}%")
    print(f"Tier: {result['tier']}")
    print(f"Match: {result['match_count']}")
    print(f"Matched: {', '.join(result['matched_skills'][:5])}")
    print(f"Missing: {', '.join(result['missing_skills'][:5])}")
