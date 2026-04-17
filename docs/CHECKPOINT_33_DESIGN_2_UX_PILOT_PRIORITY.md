# Checkpoint 33: Design 2 UX Pilot Direction

Date: 2026-04-17
Branch: `design-2`

## Why this checkpoint exists

`design-1` preserved the previous CareerOS marketplace-style UI. The next branch, `design-2`, is now dedicated to the UX Pilot design direction from:

- `/Users/saisujan/Desktop/internships_apply/clawdbot_automation/design_help`
- `/Users/saisujan/Desktop/internships_apply/clawdbot_automation/design_help/design-photos`

The UI is now the top execution priority before additional product breadth. The product already has enough backend structure to continue, but the user-facing experience must feel polished, credible, and easy before more features are layered on.

## Design 2 visual thesis

Design 2 should feel like a polished career operating system:

- clean split-screen auth and onboarding
- bold but restrained blue/purple primary actions
- soft slate-blue workspace backgrounds
- white rounded surfaces with careful borders and shadows
- calm left navigation for logged-in product screens
- dense but readable job discovery and application management
- resume tailoring screens that feel like an editor/workbench, not a raw form

This should not copy ZipRecruiter or the previous reference app exactly. It should use the UX Pilot screens as the source of truth for structure, spacing, and interaction quality while keeping the product ownable.

## UX Pilot screens reviewed

- Auth/login split screen
- Onboarding welcome
- Resume upload / paste step
- Role and skill targeting step
- Preferences step
- Final setup/search step
- All Jobs Discovery with split list/detail workspace
- Applied Jobs dashboard with metrics, table, interviews, and activity rail
- AI Resume Tailor editor
- Tailored Resume Final Preview

## Top-priority implementation order

1. Preserve branch safety
   - Keep `design-1` untouched as the previous approved style checkpoint.
   - Use `design-2` for all UX Pilot redesign work.
   - Commit and push each visible slice.

2. Auth and onboarding redesign
   - Convert login/signup into the split UX Pilot layout.
   - Rebuild onboarding as a 5-step guided flow with progress bars.
   - Make resume upload/paste visually primary and auto-filled suggestions obvious.
   - Use the right-side preview/illustration panel to reduce the heavy form feeling.

3. App shell redesign
   - Move the logged-in app toward the UX Pilot left-nav workspace.
   - Keep navigation calm, icon-led, and stable.
   - Remove prototype-looking controls and loud empty zero states.

4. Job discovery redesign
   - Implement the split discovery layout: job list on the left, selected job detail on the right.
   - Keep filters compact across the top.
   - Make match reasoning visible in the detail panel.
   - Avoid oversized full-width action buttons inside cards.

5. Applied jobs redesign
   - Add metric cards, application history table, interview rail, and recent activity rail.
   - Use this page for operational tracking, not job browsing.

6. AI resume tailor redesign
   - Rework the tailor into a two-pane document editor.
   - Show base resume, AI tailored version, ATS score, suggestions, and final preview.

7. Tracker and settings follow-up
   - Bring tracker into the same visual language after the main discovery/applied/tailor flow is stable.
   - Simplify settings and keep automation/internal pipeline controls hidden from standard users.

## Acceptance criteria

- A fresh user sees a polished login/onboarding path, not developer setup concepts.
- Resume upload/paste feels like the center of onboarding.
- Users see only matched/relevant jobs in the web app.
- Job discovery feels fast: list, filters, selected detail, match reasoning, and actions are visible without clutter.
- Applied jobs feels operational with metrics and next actions.
- Resume tailor feels like a serious editor with AI assistance.
- The old marketplace style remains recoverable through `design-1`.

## Notes

- The UX Pilot exported HTML and images are reference material, not runtime dependencies.
- Reusable visual assets may be copied into the frontend only if they improve production polish and do not create brittle external links.
- Keep the project tracker updated after every design-2 slice.
