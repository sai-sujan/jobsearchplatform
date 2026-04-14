# Checkpoint 04: Industry Affinity

Date: 2026-04-14

## What landed
- Added a dedicated recommendation helper module for current user-feed scoring
- Added industry inference for jobs from title, company, search query, and description text
- Added sector-affinity scoring against the user's inferred/selected industries
- Added a measured industry boost to the current user-facing fit score
- Ranked `/api/jobs` by fit score instead of only by recency
- Surfaced industry-fit details in job payloads and the detail view

## Why this matters
- Users with proven experience in a sector now see those same-sector jobs rise naturally in the feed
- The scoring remains flexible: same-industry experience is a boost, not a hard filter
- This creates a better bridge toward the future `matched_jobs` delivery model by separating fit logic into a reusable recommendation helper

## Verified behavior
- For a healthcare-background user, a healthcare role with the same base skill score now ranks above a non-healthcare role
- The response payload includes:
  - industry label(s)
  - industry fit label
  - industry boost
  - fit reasons

## Remaining gap
- This is still applied in the legacy `jobs` feed, not yet in the future `matched_jobs` delivery pipeline
- Experience fit and resume match still need to become explicit stored scoring components
