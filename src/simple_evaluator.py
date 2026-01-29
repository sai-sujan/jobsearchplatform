
import re

class SimpleEvaluator:
    """
    Performs fast, regular-expression based pre-filtering of jobs
    to save API costs on expensive AI evaluation.
    """
    
    # Titles to immediately reject for entry-level search
    SENIOR_TITLES = [
        r'\bsenior\b', r'\bsr\.\b', r'\bprincipal\b', r'\bstaff\b', 
        r'\blead\b', r'\bmanager\b', r'\bhead of\b', r'\bdirector\b', 
        r'\bvp\b', r'\barchitect\b'
    ]
    
    # Dealbreakers in description
    DEALBREAKERS = [
        r'\brequires? us citizenship\b',
        r'\binput us citizen\b', 
        r'\bsecurity clearance\b',
        r'\btop secret\b',
        r'\bpolygraph\b',
        # r'\bphd required\b' # Allow PhD to pass to Gemini for context flexibility
    ]

    def quick_check(self, job_title: str, description: str) -> tuple[bool, str]:
        """
        Returns (True, "") if job passes basic checks.
        Returns (False, "Reason") if job fails.
        """
        title_lower = job_title.lower()
        desc_lower = description.lower()
        
        # 1. Title Check
        for pattern in self.SENIOR_TITLES:
            if re.search(pattern, title_lower):
                return False, f"Senior Title Detected: {pattern.replace(r'\\b', '')}"
                
        # 2. Description Dealbreakers
        for pattern in self.DEALBREAKERS:
            if re.search(pattern, desc_lower):
                return False, f"Dealbreaker Detected: {pattern.replace(r'\\b', '')}"
                
        return True, "Check Passed"
