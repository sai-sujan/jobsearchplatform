# Checkpoint 36: Reference Spacing Alignment

Date: 2026-04-17
Branch: `design-2`

## What changed

- Re-tuned onboarding spacing against the UX Pilot reference screens.
- Expanded the outer stage to fill the viewport more like the reference artboard instead of floating with large dead margins.
- Balanced the left and right panes to a cleaner 50/50 split.
- Removed heavy bordered welcome callout boxes and converted them into lightweight feature rows.
- Tightened content width and CTA width so the left column reads as one intentional setup flow.
- Preserved the UX Pilot segmented top progress and split preview panel.

## Verification

- `npm run build` passed in `dashboard/`
- `npx eslint src/pages/OnboardingPage.jsx` passed in `dashboard/`

## Note

Full `npm run lint` currently also scans an untracked `dashboard/src/pages/OnboardingPage.test.jsx` file that contains unused variables. That file was not created or edited in this spacing slice.
