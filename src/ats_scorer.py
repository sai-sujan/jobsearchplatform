"""
ATSScorer Module
----------------
Handles scoring, ranking, and filtering of job evaluation results.
Keeps only the top N jobs based on ATS score and relevance.
Includes Premium job boost for LinkedIn Premium/Featured jobs.
"""

import os
from typing import List, Dict, Tuple
from dataclasses import dataclass
from .job_scraper import JobListing
from .resume_evaluator import EvaluationResult


@dataclass
class ScoredJob:
    """Data class combining job listing with evaluation results."""
    job: JobListing
    evaluation: EvaluationResult
    premium_boost: int = 0  # Boost applied for Premium jobs

    @property
    def ats_score(self) -> int:
        return self.evaluation.ats_score

    @property
    def is_premium(self) -> bool:
        """Check if this is a Premium/Featured job."""
        return self.job.is_premium

    @property
    def composite_score(self) -> float:
        """Calculate composite score for ranking."""
        # Base score from ATS
        base_score = self.evaluation.ats_score

        # Premium job boost (prioritize LinkedIn Premium/Featured jobs)
        premium_bonus = self.premium_boost if self.is_premium else 0

        # Bonus for sponsorship possibility
        sponsorship_bonus = 0
        if self.evaluation.sponsorship_possible == "Yes":
            sponsorship_bonus = 5
        elif self.evaluation.sponsorship_possible == "Unknown":
            sponsorship_bonus = 2

        # Bonus for internship (typically more welcoming to new grads)
        role_bonus = 0
        if self.job.role_type == "Internship":
            role_bonus = 3
        elif self.job.role_type == "Entry-level":
            role_bonus = 2

        # Penalty for too many missing skills
        missing_penalty = 0
        total_missing = (
            len(self.evaluation.missing_core_skills) +
            len(self.evaluation.missing_tools_frameworks) +
            len(self.evaluation.missing_ml_ai_concepts)
        )
        if total_missing > 10:
            missing_penalty = 10
        elif total_missing > 5:
            missing_penalty = 5

        return base_score + premium_bonus + sponsorship_bonus + role_bonus - missing_penalty

    @property
    def final_score_with_boost(self) -> int:
        """Get ATS score plus Premium boost for display."""
        boost = self.premium_boost if self.is_premium else 0
        return self.evaluation.ats_score + boost


class ATSScorer:
    """
    Scores, ranks, and filters job evaluation results.
    Includes Premium job boost for prioritization.
    """

    def __init__(self, top_n: int = 10, premium_boost: int = None):
        """
        Initialize ATSScorer.

        Args:
            top_n: Number of top jobs to keep (default 10)
            premium_boost: Boost to add for Premium jobs (from env or default 5)
        """
        self.top_n = top_n
        self.premium_boost = premium_boost or int(os.getenv('PREMIUM_BOOST', '5'))
        self.scored_jobs: List[ScoredJob] = []

    def add_job(self, job: JobListing, evaluation: EvaluationResult):
        """
        Add a job with its evaluation to the scorer.

        Args:
            job: JobListing object
            evaluation: EvaluationResult object
        """
        scored = ScoredJob(
            job=job,
            evaluation=evaluation,
            premium_boost=self.premium_boost
        )
        self.scored_jobs.append(scored)

    def rank_jobs(self) -> List[ScoredJob]:
        """
        Rank all jobs by composite score.

        Returns:
            List of ScoredJob sorted by score (descending)
        """
        # Sort by composite score, then ATS score as tiebreaker
        self.scored_jobs.sort(
            key=lambda x: (x.composite_score, x.ats_score),
            reverse=True
        )
        return self.scored_jobs

    def get_top_jobs(self) -> List[ScoredJob]:
        """
        Get top N jobs after ranking.

        Returns:
            List of top N ScoredJob objects
        """
        self.rank_jobs()
        return self.scored_jobs[:self.top_n]

    def filter_by_minimum_score(self, min_score: int = 50) -> List[ScoredJob]:
        """
        Filter out jobs below minimum ATS score.

        Args:
            min_score: Minimum ATS score threshold

        Returns:
            Filtered list of ScoredJob objects
        """
        self.scored_jobs = [
            job for job in self.scored_jobs
            if job.ats_score >= min_score
        ]
        return self.scored_jobs

    def filter_by_sponsorship(self, include_unknown: bool = True) -> List[ScoredJob]:
        """
        Filter to only jobs that may offer sponsorship.

        Args:
            include_unknown: Whether to include jobs with unknown sponsorship

        Returns:
            Filtered list
        """
        valid_values = ["Yes"]
        if include_unknown:
            valid_values.append("Unknown")

        self.scored_jobs = [
            job for job in self.scored_jobs
            if job.evaluation.sponsorship_possible in valid_values
        ]
        return self.scored_jobs

    def get_statistics(self) -> Dict:
        """
        Get statistics about the scored jobs.

        Returns:
            Dictionary with statistics
        """
        if not self.scored_jobs:
            return {
                "total_jobs": 0,
                "avg_score": 0,
                "max_score": 0,
                "min_score": 0,
                "premium_jobs": 0,
                "premium_boost": self.premium_boost,
                "sponsorship_yes": 0,
                "sponsorship_no": 0,
                "sponsorship_unknown": 0
            }

        scores = [job.ats_score for job in self.scored_jobs]
        premium_count = sum(1 for job in self.scored_jobs if job.is_premium)

        return {
            "total_jobs": len(self.scored_jobs),
            "avg_score": sum(scores) / len(scores),
            "max_score": max(scores),
            "min_score": min(scores),
            "premium_jobs": premium_count,
            "premium_boost": self.premium_boost,
            "sponsorship_yes": sum(
                1 for job in self.scored_jobs
                if job.evaluation.sponsorship_possible == "Yes"
            ),
            "sponsorship_no": sum(
                1 for job in self.scored_jobs
                if job.evaluation.sponsorship_possible == "No"
            ),
            "sponsorship_unknown": sum(
                1 for job in self.scored_jobs
                if job.evaluation.sponsorship_possible == "Unknown"
            )
        }

    def print_summary(self):
        """Print a summary of scored jobs to console."""
        stats = self.get_statistics()

        print("\n" + "=" * 60)
        print("JOB EVALUATION SUMMARY")
        print("=" * 60)
        print(f"Total jobs evaluated: {stats['total_jobs']}")
        print(f"Premium/Featured jobs: {stats['premium_jobs']} (+{stats['premium_boost']} boost)")
        print(f"Average ATS score: {stats['avg_score']:.1f}")
        print(f"Score range: {stats['min_score']} - {stats['max_score']}")
        print(f"\nSponsorship breakdown:")
        print(f"  Yes: {stats['sponsorship_yes']}")
        print(f"  No: {stats['sponsorship_no']}")
        print(f"  Unknown: {stats['sponsorship_unknown']}")

        print("\n" + "-" * 60)
        print(f"TOP {self.top_n} JOBS")
        print("-" * 60)

        top_jobs = self.get_top_jobs()
        for i, scored_job in enumerate(top_jobs, 1):
            premium_tag = " [PREMIUM]" if scored_job.is_premium else ""
            print(f"\n{i}. {scored_job.job.job_title}{premium_tag}")
            print(f"   Company: {scored_job.job.company_name}")
            print(f"   ATS Score: {scored_job.ats_score}", end="")
            if scored_job.is_premium:
                print(f" (+{scored_job.premium_boost} Premium boost)")
            else:
                print()
            print(f"   Composite Score: {scored_job.composite_score:.1f}")
            print(f"   Sponsorship: {scored_job.evaluation.sponsorship_possible}")
            print(f"   Link: {scored_job.job.job_link[:60]}...")

        print("\n" + "=" * 60)

    def clear(self):
        """Clear all scored jobs."""
        self.scored_jobs = []
