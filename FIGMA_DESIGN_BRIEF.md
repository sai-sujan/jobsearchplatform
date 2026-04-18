# Job Application Platform - Design Brief for Figma

## Project Overview

**ClawdBot Job Application Dashboard** is a professional web platform that automates job discovery, evaluation, and application tracking. Users search jobs from multiple sources (LinkedIn, Indeed, Glassdoor), filter by relevance, score jobs with AI, and generate tailored resumes—all without auto-applying (manual application only).

### Target User
- **Primary**: AI/ML/Data Science professionals (entry-level to mid-level)
- **Secondary**: Job hunters in tech (any discipline)
- **Experience Level**: Comfortable with tech, want to optimize job search workflow

---

## Core Features & User Workflows

### 1. **Authentication & Onboarding**
- **Login Page**: Username/password, simple clean form
- **Home Page**: Quick stats dashboard showing job pipeline at a glance
- **No Registration UI**: Admin/single-user system for MVP (future: multi-tenant)

### 2. **Job Discovery & Search**
- **Sources**: LinkedIn, Indeed, Glassdoor
- **Search Interface**: 
  - Keyword input (e.g., "AI Engineer", "ML Engineer")
  - Filter by source (checkboxes)
  - Filter by location
  - Job level (Internship, Entry-level, Mid-level)
  - Job type (Full-time, Contract, Remote)
- **Background Scraping**: User clicks "Start Search" → backend scrapes in background
- **Status Polling**: UI polls progress every 3 seconds while scraping
- **Result Preview**: New jobs appear live in the dashboard as they're found

### 3. **Job Viewing & Filtering**
- **Job List Views** (3 main tabs):
  - **Today's Jobs**: Jobs posted in last 24 hours
  - **Applied**: Jobs where user clicked "Mark Applied"
  - **Tracker Board**: Kanban-style: Not Applied → Applied → Interviewing → Accepted/Rejected
  - **All Jobs**: Full database with filters
  
- **Job Card Design**:
  - Company logo (if available)
  - Job title
  - Company name
  - Location
  - Source badge (LinkedIn blue, Indeed red, Glassdoor green)
  - Skill score (0-100) with color coding (red < 50, yellow 50-75, green > 75)
  - ATS score (compatibility with applicant tracking system)
  - Status (Not Applied / Applied / Interviewing / Accepted / Rejected / Skipped)
  - Star/bookmark for special interest
  - Quick action buttons (View Details, Generate Resume, Mark Applied, Delete)

- **Filtering Options**:
  - By source (LinkedIn / Indeed / Glassdoor)
  - By status (Not Applied, Applied, Interviewing, etc.)
  - By tier (Perfect Match, Good Match, Standard, Lower Priority)
  - By skill score (min slider)
  - By date posted (Last 24h, 7 days, 30 days, Any)
  - Search by company name or job title

### 4. **Job Details Sidebar**
- **Expandable panel** when user clicks a job card
- **Content**:
  - Full job description (scrollable)
  - Matched skills (highlighted with green badges)
  - Missing skills (red badges)
  - AI evaluation summary (what makes it a good/bad fit)
  - ATS compatibility breakdown
  - Posted date & deadline (if available)
  - Application link (button to open in new tab)
  - Resume history for this job (list of generated versions)

### 5. **Resume Tailoring (AI-Powered)**
- **Generate Button**: Click "Generate Tailored Resume" on a job
- **Process Flow**:
  1. Backend calls Groq LLM with: job description + master resume + user skills
  2. Returns tailored resume optimized for the specific job
  3. Generates PDF and stores locally
- **Resume Preview**: 
  - Show generated resume in UI (PDF viewer or text preview)
  - Download button for PDF
  - Store version history (v1, v2, v3, etc.)
- **Bulk Actions**: 
  - Generate resumes for top 10 matches
  - Download all as ZIP

### 6. **Job Status Management**
- **Status Workflow**:
  - "Not Applied" (default)
  - "Applied" (user manually applied, record the date)
  - "Interviewing" (user in interview process)
  - "Accepted" (offer received)
  - "Rejected" (feedback or auto-rejection)
  - "Skipped" (decided not to apply)

- **Status Update**: 
  - Dropdown on job card
  - Bulk update: select multiple jobs → change status
  - Status transition validation (no auto-reject to accepted, etc.)

### 7. **Settings & Configuration**
- **5 Tabs in Settings**:
  1. **Search Config** (JSON editor):
     ```json
     {
       "keywords": ["AI Engineer", "ML Engineer"],
       "sources": ["linkedin", "indeed", "glassdoor"],
       "max_jobs": 40,
       "filters": {
         "level": "entry",
         "remote": true,
         "posted_within_days": 7
       }
     }
     ```
  2. **Environment Config** (API keys, etc.)
  3. **Company Blacklist** (companies to exclude)
  4. **Your Skills** (skill inventory for matching)
  5. **Resume** (master resume text editor)

- **Design**: Sidebar tabs (300px) + right panel (main editor)
- **Actions**: Save, Reset, Clear all

### 8. **Dashboard Stats**
- **Top Summary Cards**:
  - Total jobs found
  - Jobs applied to
  - Jobs in interview process
  - Acceptance rate
  - Skill match avg
  - Last search time

- **Visualizations**:
  - Pie chart: Status distribution (Not Applied / Applied / Interviewing / Accepted)
  - Bar chart: Jobs by source (LinkedIn vs Indeed vs Glassdoor)
  - Trend chart: Jobs found over time (last 30 days)

---

## Data Model

### Jobs Table
```
ID | Company | Title | Job Link | Source | Location | Posted Date | Date Added
Status | Skill Score | ATS Score | Tier | Special Interest | Notes
Matched Skills | Missing Skills | AI Evaluation (JSON)
Resume Path | Date Applied
```

### Fields with Color Coding
- **Skill Score**: 
  - 0-50: 🔴 Red (poor match)
  - 50-75: 🟡 Yellow (decent match)
  - 75-100: 🟢 Green (great match)
- **Status Colors**:
  - Not Applied: Gray
  - Applied: Blue
  - Interviewing: Purple
  - Accepted: Green
  - Rejected: Red
  - Skipped: Gray

### Sources Badges
- **LinkedIn**: #0A66C2 (LinkedIn blue)
- **Indeed**: #003DA5 (Indeed blue) or red
- **Glassdoor**: #0CAA41 (Glassdoor green)

---

## Navigation Structure

```
/login              → Login page (username/password)
/                   → Dashboard (stats + today's jobs)
/all                → All jobs (with full filters)
/applied            → Jobs where user applied
/tracker            → Kanban board (status workflow)
/settings           → Configuration (5 tabs)
```

---

## Design System Requirements

### Typography
- **Headlines**: Serif font (elegant, professional) - "Iowan Old Style" or similar
  - H1: 2.5rem, bold
  - H2: 1.75rem, bold
  - H3: 1.25rem, semibold
- **Body**: Sans-serif (readable)
  - Body text: 0.95rem, regular
  - Labels: 0.85rem, semibold
  - Small text: 0.75rem, regular

### Color Palette
- **Background**: Light slate (#F1F5F9)
- **Cards/Surface**: White (#FFFFFF)
- **Border**: Light gray (#E2E8F0)
- **Text Primary**: Dark slate (#0F172A)
- **Text Secondary**: Muted slate (#64748B)
- **Accent**: Indigo (#4F46E5)
- **Status Colors**:
  - Applied: Blue (#3B82F6)
  - Interviewing: Purple (#A855F7)
  - Accepted: Green (#10B981)
  - Rejected: Red (#EF4444)
  - Skipped: Gray (#94A3B8)

### Component Patterns
- **Cards**: White background, 1px gray border, rounded corners (12px), subtle shadow on hover
- **Buttons**: 
  - Primary (blue): Solid indigo, white text, 8px rounded, hover: darker indigo
  - Secondary (outline): Transparent, 1px gray border, rounded
- **Inputs**: Gray border, light gray background on focus, rounded 6px
- **Badges**: Pill-shaped (20px height), various colors for skill tags
- **Dropdowns**: Inline form elements, chevron icon
- **Modals**: Centered, semi-transparent overlay, rounded dialog

### Layout Patterns
- **Sidebar Navigation**: 60px width (collapsed) / 280px (expanded)
- **Top Bar**: 60px height, shows branding + current user + logout
- **Main Content**: Full width minus sidebar, padding 24px
- **Grid**: 12-column for responsive design

### Responsive Breakpoints
- **Desktop**: 1440px and up (full features)
- **Tablet**: 768-1439px (simplified job cards, sidebar collapses)
- **Mobile**: <767px (stacked layout, minimal features)

---

## Key Screens to Design

### 1. Login Screen
- Centered form, background gradient or minimal
- Username & password inputs
- "Sign In" button
- Simple branding (logo + app name)

### 2. Dashboard / Home
- Top bar with nav
- 4 stat cards (jobs found, applied, interviewing, acceptance rate)
- "Today's Jobs" section (list of last 24h)
- Search button to trigger scraping
- Last search timestamp

### 3. All Jobs View
- Sidebar filters (source, status, tier, skill score, date)
- Job cards in grid or list view
- Pagination (10 / 25 / 50 per page)
- Sort options (newest first, highest score, company A-Z)
- Bulk actions toolbar (select multiple → mark as applied)

### 4. Job Details Sidebar
- Expands from right when job is clicked
- Full job description with formatting
- Skill tags (matched: green, missing: red)
- AI evaluation summary
- Action buttons (apply link, generate resume, mark applied, delete)
- Close button (X)

### 5. Tracker (Kanban Board)
- 5 columns: Not Applied | Applied | Interviewing | Accepted | Rejected
- Drag-and-drop job cards between columns
- Count badges on each column
- Filter by source/date at top

### 6. Settings
- Sidebar with 5 tabs (Search Config, Env, Blacklist, Skills, Resume)
- Active tab highlighted
- Large text editor area (monospace font for JSON)
- Save & Reset buttons at bottom

### 7. Modal: Generate Resume
- Job name displayed
- Loading spinner while generating
- Preview of generated resume (PDF or text)
- Download button
- Version history dropdown

### 8. Modal: Search Progress
- Source selection (checkboxes: LinkedIn, Indeed, Glassdoor)
- Start button
- Progress bar showing % complete
- Live job counter ("Found 23 jobs...")
- Estimated time remaining
- Cancel button

---

## Interaction Patterns

### Filtering & Sorting
- **Real-time**: Filters update list instantly (no "apply" button)
- **Persistence**: Selected filters saved to localStorage
- **Clear All**: Single button to reset filters

### Job Actions (from card context menu or details panel)
- **Mark Applied**: Opens date picker, records date applied
- **Generate Resume**: Shows modal with generated resume
- **Delete**: Confirms deletion, removes from view
- **Star**: Toggles heart icon, updates special_interest flag
- **Open Link**: Opens job link in new tab

### Status Updates
- **Drag-and-Drop** (Tracker view): Drag card to column = update status
- **Dropdown** (Card view): Click status → select from dropdown
- **Bulk Select**: Checkbox per card → bulk status update

### Search Flow
1. Click "New Search" button
2. Modal opens: select sources + confirm
3. "Start Scraping" button
4. Progress modal with live updates
5. Auto-dismiss when complete
6. New jobs appear in dashboard

---

## Performance & Constraints

- **Page Load**: < 2 seconds (paginated results)
- **Filter Response**: < 500ms
- **Search**: Triggered in background, user sees progress
- **Resume Generation**: 10-30 seconds (AI inference), show spinner
- **Download**: Batch operations (ZIPs) max 50 files
- **Mobile**: Simplified views, no drag-and-drop on mobile

---

## Accessibility Requirements

- **WCAG 2.1 AA** compliance
- All buttons have accessible labels
- Color not sole indicator (use icons + text for status)
- Keyboard navigation (Tab, Enter, Escape)
- Screen reader support (semantic HTML)
- Min 4.5:1 contrast ratio for text

---

## Brand & Tone

- **Professional but friendly** (SaaS vibe, not corporate)
- **Clear & direct** (no jargon except job-search terms)
- **Minimal visual clutter** (white space is good)
- **Animated feedback** (loading spinners, toast notifications)
- **Emphasis on data**: Show scores, matches, insights

---

## Success Metrics for Design

✅ Users can discover jobs in <30 seconds
✅ Status updates are intuitive (drag-and-drop preferred)
✅ Resume generation is clear & trustworthy
✅ Filtering doesn't feel overwhelming (3-4 filters initially, expandable)
✅ Mobile UX is functional (not full-featured, but usable)
✅ Accessibility: no color-only indicators, keyboard nav works

---

## Next Steps for Figma

1. **Create component library** (buttons, cards, badges, modals)
2. **Design 8 key screens** listed above
3. **Create 2-3 responsive variants** (desktop, tablet, mobile)
4. **Add interaction specs** (hover, active, disabled states)
5. **Define spacing & sizing** system (8px grid)
6. **Create style guide** (colors, typography, shadows)

---

## Design Tokens (for implementation)

```css
/* Colors */
--bg: #f1f5f9;
--surface: #ffffff;
--border: #e2e8f0;
--text-primary: #0f172a;
--text-secondary: #64748b;
--accent: #4f46e5;
--danger: #ef4444;
--success: #10b981;
--warning: #f59e0b;
--info: #3b82f6;

/* Typography */
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
--font-serif: 'Iowan Old Style', 'Palatino Linotype', serif;

/* Spacing (8px grid) */
--space-0: 0;
--space-1: 0.5rem;
--space-2: 1rem;
--space-3: 1.5rem;
--space-4: 2rem;

/* Shadows */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.1);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
```

---

*Last Updated: 2026-04-11*
*Created for UI/UX design phase*
