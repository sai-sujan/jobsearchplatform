# Checkpoint 03: Recommendation Flexibility

Date: 2026-04-13

## What landed
- Added persistent `quality_filters` to the user profile model
- Added onboarding controls for:
  - preferred sources
  - minimum fit threshold
  - staffing/recruiter suppression
  - suspicious job suppression
  - salary visibility requirement
  - exclude keywords
- Added a `Feed filters` tab in Profile so users can adjust recommendation quality later
- Added a central `docs/PROJECT_TRACKER.md` file to keep the product plan and checkpoint trail in one place
- Resume intake now supports both:
  - uploaded files (`pdf`, `doc`, `docx`, `txt`)
  - pasted resume text
- `/api/jobs` now applies the saved quality filters so the user's feed reflects their chosen recommendation rules

## Why this matters
- Users now have direct control over job-source quality and feed strictness
- The product is better aligned with the goal of showing only jobs worth applying to
- Resume-first onboarding remains smooth even if the user uploads a file first and edits text later
- Project planning now has a durable home so the implementation trail does not get lost

## Remaining gap
- The feed still reads from the legacy `jobs` table instead of the future `matched_jobs` delivery model
- Quality filters are applied at read time today; they should move into delivery-time matching once `matched_jobs` exists
