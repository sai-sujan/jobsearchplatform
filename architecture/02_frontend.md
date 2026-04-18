# 02 — Frontend Architecture

**Project:** ClawdBot — Job Application Automation Platform
**Audience:** Beginner-to-intermediate developers joining the project
**Purpose:** Understand every decision made, every folder created, and every pattern used — before writing a single line of code.

---

## Table of Contents

1. [Tech Stack Decisions](#1-tech-stack-decisions)
2. [Complete Folder Structure](#2-complete-folder-structure)
3. [Pages and Routes](#3-pages-and-routes)
4. [Key Components](#4-key-components)
5. [State Management Strategy](#5-state-management-strategy)
6. [API Layer](#6-api-layer)
7. [Real-Time Updates](#7-real-time-updates)
8. [Performance](#8-performance)
9. [Error Handling](#9-error-handling)

---

## 1. Tech Stack Decisions

### React 19 + Vite

**React** is the UI library that lets you build the interface as a tree of components — small, reusable pieces like `<JobCard>`, `<ResumeUploader>`, and `<NotificationBadge>`. React re-renders only the parts of the page that changed, so the browser stays fast.

**Why React 19 specifically?** It ships with the new `use()` hook, improved `Suspense` boundaries, and better concurrent rendering. When ClawdBot is tailoring a resume with AI (a slow background task), React 19's concurrent features let the rest of the page stay interactive while that process runs.

**Vite vs Webpack — the analogy:** Imagine you are cooking in a restaurant kitchen. Webpack is the old sous chef who preps every single ingredient before the first order arrives — slow startup, but everything is ready. Vite is the modern chef who only preps what the first customer actually ordered, and uses the browser's native ES Modules to serve files directly during development. The result: Vite's development server starts in under a second even on large projects. Webpack might take 30–60 seconds on the same codebase.

Vite also uses Rollup under the hood for production builds, which produces smaller, faster bundles than Webpack's defaults.

```
npm create vite@latest clawdbot-frontend -- --template react-ts
```

---

### TypeScript

JavaScript is dynamically typed — you can pass a string where a number is expected and JavaScript will shrug and try. TypeScript adds a type checker that runs before the code even reaches the browser.

**Analogy:** TypeScript is like spell-check for logic. If your function expects a `Job` object with an `id` field and you accidentally pass it a `Resume` object, TypeScript underlines the mistake in red in your editor — before you hit Save, let alone before a user sees a bug in production.

**Concrete ClawdBot example:**

```ts
// Without TypeScript — you find out at runtime that job.companyName is undefined
function renderJobCard(job) {
  return job.companyNamme; // typo — no warning
}

// With TypeScript — you find out immediately in your editor
interface Job {
  id: string;
  title: string;
  companyName: string;
  location: string;
  postedAt: string;
  status: "saved" | "applied" | "interviewing" | "rejected" | "offer";
}

function renderJobCard(job: Job) {
  return job.companyNamme; // TypeScript error: Property 'companyNamme' does not exist
}
```

Types also serve as living documentation. When a teammate opens `src/types/job.ts`, they immediately understand the shape of every job object in the system.

---

### TanStack Query (formerly React Query)

Every time the Jobs Dashboard loads, it needs to fetch the list of jobs from the backend. Without a caching layer, every page navigation triggers a fresh network request, and the user stares at a loading spinner every single time.

**TanStack Query is a smart data fetcher with memory.** It:

- Fetches data from the API and stores it in a cache by a "query key" (like a label on a file cabinet drawer)
- Returns cached data instantly on re-render while silently refetching in the background
- Automatically retries failed requests
- Invalidates (marks stale) the cache when you mutate data — so the job list updates after you save a new job

**Analogy:** Think of TanStack Query as a really smart assistant. You ask it to "get all jobs." The first time it actually goes and fetches. The next time you ask within 5 minutes, it hands you the answer from memory instantly, while quietly double-checking with the server in the background in case anything changed.

```ts
// Fetching jobs — cache key is ["jobs", filters]
const { data: jobs, isLoading, error } = useQuery({
  queryKey: ["jobs", { status: "saved", page: 1 }],
  queryFn: () => jobsApi.getJobs({ status: "saved", page: 1 }),
  staleTime: 1000 * 60 * 5, // data is "fresh" for 5 minutes
});
```

---

### Zustand for UI State

Some state does not come from the server — it lives only in the browser. Is the sidebar collapsed? Which modal is open? What filter chips has the user selected on the Jobs Dashboard?

Redux (the old standard) requires enormous boilerplate: actions, action creators, reducers, dispatchers. Zustand does the same thing in a fraction of the code.

**Analogy:** Redux is like a large government department — everything goes through formal paperwork. Zustand is like a shared Google Doc that anyone can open and edit directly.

```ts
// The entire sidebar store — 10 lines
import { create } from "zustand";

interface SidebarStore {
  isCollapsed: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isCollapsed: false,
  toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
}));
```

Any component can call `useSidebarStore()` and get `isCollapsed` without prop drilling through ten layers of components.

---

### shadcn/ui + Tailwind CSS

**Tailwind CSS** is a utility-first CSS framework. Instead of writing `.card { padding: 16px; border-radius: 8px; }` in a separate CSS file, you write the styles directly in your JSX as class names: `className="p-4 rounded-lg"`. This keeps styles co-located with the component they style, making it easy to read and change.

**shadcn/ui** is a component library built on top of Tailwind and Radix UI (an accessible headless component primitives library). Unlike other libraries (Material UI, Ant Design) where components live inside a node_modules package you cannot edit, shadcn/ui copies the source code of each component directly into your project under `src/components/ui/`. You own the code. You can change any pixel.

**Why this matters for ClawdBot:** The resume scoring interface, the AI tailoring drawer, and the notification timeline need custom styling that would be painful to override inside a locked third-party library. With shadcn/ui, we just open `src/components/ui/card.tsx` and change it.

---

### React Router v7

React Router handles navigation — it reads the URL and decides which page component to render. Version 7 is a significant upgrade that aligns with the Remix framework model, supporting:

- **Nested routes** — the main layout (sidebar + topbar) wraps all pages without re-mounting on navigation
- **Route loaders** — fetch data before a page renders, so there is no flash of empty content
- **File-based routing (optional)** — routes can mirror the folder structure

```ts
// src/app/router.tsx
import { createBrowserRouter } from "react-router-dom";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/jobs" /> },
      { path: "jobs", element: <JobsDashboard /> },
      { path: "jobs/:jobId", element: <JobDetail /> },
      { path: "resumes", element: <ResumeManager /> },
      { path: "resumes/:resumeId/tailor", element: <AITailoring /> },
      { path: "score", element: <ResumeScoring /> },
      { path: "notifications", element: <NotificationCenter /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "/login", element: <Login /> },
  { path: "/signup", element: <Signup /> },
]);
```

---

## 2. Complete Folder Structure

```
src/
├── app/                          # App-level wiring — router, providers, global config
│   ├── router.tsx                # All routes defined in one place
│   ├── providers.tsx             # Wraps the app: QueryClientProvider, AuthProvider, ThemeProvider
│   └── queryClient.ts            # TanStack Query client configuration (cache time, retries, error handler)
│
├── pages/                        # One file per page/route — thin shells that compose features
│   ├── jobs/
│   │   ├── JobsDashboard.tsx     # Main jobs list page — search, filter, kanban or list view
│   │   └── JobDetail.tsx         # Single job expanded view — notes, timeline, tailoring link
│   ├── resumes/
│   │   ├── ResumeManager.tsx     # Grid of uploaded resumes — upload, delete, version history
│   │   └── AITailoring.tsx       # Side-by-side: job description vs tailored resume draft
│   ├── scoring/
│   │   └── ResumeScoring.tsx     # Upload resume + job description → get ATS score + suggestions
│   ├── notifications/
│   │   └── NotificationCenter.tsx # Timeline of all email alerts, AI completions, status changes
│   ├── settings/
│   │   └── Settings.tsx          # Account, notification preferences, integrations, API keys
│   ├── auth/
│   │   ├── Login.tsx             # Email + password login form
│   │   └── Signup.tsx            # New account registration form
│   └── errors/
│       ├── NotFound.tsx          # 404 page
│       └── ServerError.tsx       # 500 / unexpected error page
│
├── features/                     # Business logic grouped by domain — the meat of the app
│   ├── jobs/
│   │   ├── components/
│   │   │   ├── JobCard.tsx           # Single job card — title, company, status badge, quick actions
│   │   │   ├── JobBoard.tsx          # Kanban board with drag-and-drop columns by status
│   │   │   ├── JobList.tsx           # Table/list view of jobs with virtual scrolling
│   │   │   ├── JobFilters.tsx        # Filter chips: status, location, date range, source
│   │   │   ├── JobSearchBar.tsx      # Debounced search input tied to query params
│   │   │   ├── JobStatusBadge.tsx    # Colored pill: Saved / Applied / Interviewing / Offer
│   │   │   ├── JobForm.tsx           # Add/edit job form — manual entry or paste from URL
│   │   │   └── JobNotes.tsx          # Rich text notes panel for a specific job
│   │   ├── hooks/
│   │   │   ├── useJobs.ts            # TanStack Query hook — fetches paginated job list
│   │   │   ├── useJob.ts             # Fetches a single job by ID
│   │   │   ├── useCreateJob.ts       # Mutation hook — POST new job
│   │   │   ├── useUpdateJob.ts       # Mutation hook — PATCH job status or fields
│   │   │   └── useDeleteJob.ts       # Mutation hook — DELETE job + optimistic removal
│   │   └── types.ts                  # Job, JobStatus, JobFilters TypeScript interfaces
│   │
│   ├── resumes/
│   │   ├── components/
│   │   │   ├── ResumeCard.tsx         # Thumbnail card — filename, upload date, version badge
│   │   │   ├── ResumeUploader.tsx     # Drag-and-drop PDF upload zone with progress bar
│   │   │   ├── ResumeViewer.tsx       # Embedded PDF viewer using react-pdf
│   │   │   ├── ResumeVersionHistory.tsx # Accordion list of past versions with diff highlight
│   │   │   └── TailoringPanel.tsx     # Right-side panel showing AI-tailored resume draft
│   │   ├── hooks/
│   │   │   ├── useResumes.ts          # Fetch all resumes for current user
│   │   │   ├── useResume.ts           # Fetch single resume by ID
│   │   │   ├── useUploadResume.ts     # Mutation — multipart/form-data file upload
│   │   │   └── useTailorResume.ts     # Mutation — trigger AI tailoring, track SSE progress
│   │   └── types.ts                   # Resume, ResumeVersion, TailoringJob interfaces
│   │
│   ├── scoring/
│   │   ├── components/
│   │   │   ├── ScoreCard.tsx          # Big circular score display (e.g. 78/100) with color ring
│   │   │   ├── SectionBreakdown.tsx   # Expandable list: Keywords 65%, Formatting 90%, etc.
│   │   │   ├── SuggestionList.tsx     # Bulleted list of AI improvement suggestions
│   │   │   └── ScoreUploadForm.tsx    # Form to paste job description + select resume
│   │   ├── hooks/
│   │   │   ├── useScoreResume.ts      # Mutation — POST resume + JD, returns score object
│   │   │   └── useScoreHistory.ts     # Fetch past scoring sessions for a resume
│   │   └── types.ts                   # ScoreResult, SectionScore, ScoreSuggestion interfaces
│   │
│   ├── notifications/
│   │   ├── components/
│   │   │   ├── NotificationItem.tsx   # Single notification row — icon, message, timestamp
│   │   │   ├── NotificationTimeline.tsx # Chronological list grouped by date
│   │   │   ├── NotificationBadge.tsx  # Red dot / count badge on the sidebar bell icon
│   │   │   └── NotificationFilters.tsx # Filter by type: AI, email, system, job update
│   │   ├── hooks/
│   │   │   ├── useNotifications.ts    # Fetch paginated notification list
│   │   │   ├── useMarkRead.ts         # Mutation — mark one or all as read
│   │   │   └── useUnreadCount.ts      # Lightweight poll for unread badge count
│   │   └── types.ts                   # Notification, NotificationType interfaces
│   │
│   ├── auth/
│   │   ├── components/
│   │   │   ├── LoginForm.tsx          # Controlled form — email, password, submit, error display
│   │   │   ├── SignupForm.tsx         # Registration form with validation
│   │   │   └── ProtectedRoute.tsx     # Wrapper that redirects to /login if not authenticated
│   │   ├── hooks/
│   │   │   ├── useLogin.ts            # Mutation — POST credentials, store token
│   │   │   ├── useLogout.ts           # Clear token, redirect to /login
│   │   │   └── useCurrentUser.ts      # Fetch /me endpoint, populate auth store
│   │   └── types.ts                   # User, AuthTokens interfaces
│   │
│   └── settings/
│       ├── components/
│       │   ├── ProfileSettings.tsx    # Name, email, password change form
│       │   ├── NotificationPreferences.tsx # Toggle which events trigger email/in-app alerts
│       │   ├── IntegrationSettings.tsx # Connect Gmail, LinkedIn, job boards
│       │   └── DangerZone.tsx         # Delete account button with confirmation dialog
│       ├── hooks/
│       │   ├── useUpdateProfile.ts    # Mutation — PATCH /me
│       │   └── useIntegrations.ts     # Fetch + toggle integration status
│       └── types.ts                   # UserProfile, NotificationPrefs, Integration interfaces
│
├── components/                   # Shared UI components used across multiple features
│   ├── ui/                        # shadcn/ui generated components — DO NOT manually edit patterns
│   │   ├── button.tsx             # Button with variants: default, destructive, outline, ghost
│   │   ├── card.tsx               # Card container with header/content/footer slots
│   │   ├── dialog.tsx             # Modal dialog built on Radix Dialog primitive
│   │   ├── dropdown-menu.tsx      # Contextual menu built on Radix DropdownMenu
│   │   ├── input.tsx              # Styled text input
│   │   ├── badge.tsx              # Small label pill with variants
│   │   ├── skeleton.tsx           # Loading placeholder with shimmer animation
│   │   ├── toast.tsx              # Toast notification container
│   │   └── tooltip.tsx            # Accessible hover tooltip
│   ├── layout/
│   │   ├── RootLayout.tsx         # Shell with sidebar + topbar + <Outlet /> for page content
│   │   ├── Sidebar.tsx            # Left navigation — logo, nav links, user avatar, collapse toggle
│   │   ├── Topbar.tsx             # Page title, notification bell, breadcrumbs, user menu
│   │   └── PageContainer.tsx      # Consistent max-width + padding wrapper for page body
│   ├── feedback/
│   │   ├── LoadingSpinner.tsx     # Centered spinner for full-page loading states
│   │   ├── EmptyState.tsx         # Illustration + message when a list is empty
│   │   ├── ErrorMessage.tsx       # Styled error display with optional retry button
│   │   └── ProgressBar.tsx        # Linear progress bar for upload and AI processing
│   └── common/
│       ├── ConfirmDialog.tsx      # "Are you sure?" modal used for destructive actions
│       ├── SearchInput.tsx        # Debounced search field with clear button
│       ├── Pagination.tsx         # Page navigation controls (prev, next, page numbers)
│       └── StatusBadge.tsx        # Generic colored badge used by jobs and notifications
│
├── hooks/                         # App-wide custom hooks not tied to one feature
│   ├── useDebounce.ts             # Returns a debounced value — prevents search on every keystroke
│   ├── useMediaQuery.ts           # Detects screen size for responsive layout decisions
│   ├── useOnClickOutside.ts       # Fires callback when user clicks outside a ref'd element
│   ├── useLocalStorage.ts         # Typed wrapper around localStorage with JSON serialization
│   └── useSSE.ts                  # Hook for subscribing to Server-Sent Event streams
│
├── services/                      # All HTTP API calls — no fetch/axios calls outside this folder
│   ├── api.ts                     # Axios instance with base URL, auth interceptor, error handler
│   ├── jobs.api.ts                # All /jobs endpoints: list, get, create, update, delete
│   ├── resumes.api.ts             # All /resumes endpoints: list, get, upload, tailor, delete
│   ├── scoring.api.ts             # POST /score, GET /score/history
│   ├── notifications.api.ts       # GET /notifications, PATCH /notifications/:id/read
│   ├── auth.api.ts                # POST /login, POST /signup, POST /logout, GET /me
│   └── settings.api.ts            # GET/PATCH /me/profile, GET/PATCH /me/integrations
│
├── stores/                        # Zustand stores for client-only UI state
│   ├── sidebar.store.ts           # isCollapsed, toggle()
│   ├── auth.store.ts              # currentUser, accessToken, setUser(), clearAuth()
│   ├── jobs.store.ts              # activeFilters, viewMode (kanban | list), setFilter(), setView()
│   └── modal.store.ts             # openModal, closeModal, activeModal, modalProps
│
├── types/                         # Shared TypeScript types used across features
│   ├── api.types.ts               # Generic API response shapes: PaginatedResponse<T>, ApiError
│   ├── job.types.ts               # Job, JobStatus, CreateJobDto, UpdateJobDto
│   ├── resume.types.ts            # Resume, ResumeVersion, TailoringStatus
│   ├── notification.types.ts      # Notification, NotificationType, NotificationStatus
│   ├── user.types.ts              # User, UserProfile, AuthTokens
│   └── common.types.ts            # SelectOption, DateRange, SortOrder, etc.
│
└── utils/                         # Pure utility functions — no side effects, easy to unit test
    ├── date.utils.ts              # formatRelativeTime("2 hours ago"), formatDate("Apr 17")
    ├── string.utils.ts            # truncate(), slugify(), capitalizeFirst()
    ├── file.utils.ts              # formatFileSize(), isPDF(), extractFilename()
    ├── validation.utils.ts        # isValidEmail(), isValidPassword(), isEmpty()
    └── cn.ts                      # Tailwind class merging utility (clsx + tailwind-merge)
```

---

## 3. Pages and Routes

| Path | Component | What It Shows | Auth Required |
|---|---|---|---|
| `/` | Redirect | Redirects to `/jobs` | Yes |
| `/jobs` | `JobsDashboard` | Full job tracker — list/kanban, search, filters, status columns | Yes |
| `/jobs/:jobId` | `JobDetail` | Expanded view of one job — description, notes, timeline, tailoring button | Yes |
| `/resumes` | `ResumeManager` | Grid of uploaded resumes — upload new, view versions, delete, start tailoring | Yes |
| `/resumes/:resumeId/tailor` | `AITailoring` | Side-by-side editor — original resume on left, AI-tailored draft on right, progress indicator | Yes |
| `/score` | `ResumeScoring` | Form to upload/select resume + paste job description — shows ATS score + improvement list | Yes |
| `/notifications` | `NotificationCenter` | Chronological feed of all alerts — AI completions, email events, status updates | Yes |
| `/settings` | `Settings` | Tabbed settings — profile, notification preferences, integrations, danger zone | Yes |
| `/login` | `Login` | Email/password form with "Forgot password?" link | No |
| `/signup` | `Signup` | Registration form — name, email, password | No |
| `*` | `NotFound` | 404 page with link back to `/jobs` | No |

**How auth protection works:**

`ProtectedRoute.tsx` wraps every authenticated route. It reads from `auth.store.ts` — if there is no valid token, it calls `<Navigate to="/login" state={{ from: location }} />`. After login, React Router reads the `from` state and redirects back to the page the user originally tried to visit.

---

## 4. Key Components

### `JobCard`
**File:** `src/features/jobs/components/JobCard.tsx`

**Props:**
```ts
interface JobCardProps {
  job: Job;
  onStatusChange: (jobId: string, newStatus: JobStatus) => void;
  onDelete: (jobId: string) => void;
  onTailor: (jobId: string) => void;
}
```

**What it renders:** A card with the job title, company name, location, time since posting, and a colored status badge. A three-dot menu opens a dropdown with "Change Status," "Tailor Resume," "Add Note," and "Delete" actions.

**API calls:** None directly. It receives data via props from the parent `JobList` or `JobBoard`. Mutations are triggered through the callback props, which call `useUpdateJob` and `useDeleteJob` hooks in the parent.

---

### `JobBoard`
**File:** `src/features/jobs/components/JobBoard.tsx`

**Props:**
```ts
interface JobBoardProps {
  jobs: Job[];
  isLoading: boolean;
}
```

**What it renders:** A horizontal kanban board with five columns: Saved, Applied, Interviewing, Offer, Rejected. Each column contains `JobCard` components filtered to that status. Drag-and-drop between columns calls `useUpdateJob` to change the job's status in the backend.

**Library used:** `@dnd-kit/core` for drag-and-drop (lighter than react-beautiful-dnd, still actively maintained).

**API calls:** `useUpdateJob` mutation on drop — sends `PATCH /jobs/:id` with `{ status: newStatus }`.

---

### `ResumeUploader`
**File:** `src/features/resumes/components/ResumeUploader.tsx`

**Props:**
```ts
interface ResumeUploaderProps {
  onUploadComplete: (resume: Resume) => void;
  maxFileSizeMb?: number; // default: 10
}
```

**What it renders:** A dashed drop zone that accepts PDF files. On drop or file-input selection, it validates the file type and size, then calls `useUploadResume` which sends a `multipart/form-data` POST to `/resumes`. A progress bar fills as the upload proceeds. On completion, calls `onUploadComplete` with the new resume object.

**API calls:** `POST /resumes` via `useUploadResume` hook with upload progress tracking using axios `onUploadProgress`.

---

### `TailoringPanel`
**File:** `src/features/resumes/components/TailoringPanel.tsx`

**Props:**
```ts
interface TailoringPanelProps {
  resumeId: string;
  jobId: string;
  tailoringJobId: string | null; // null means tailoring hasn't started yet
}
```

**What it renders:** The right-hand panel on the AI Tailoring page. Shows "Start Tailoring" button if `tailoringJobId` is null. Once tailoring starts, subscribes to an SSE stream for that job and shows a progress bar with status messages ("Analyzing job requirements...", "Matching keywords...", "Rewriting bullet points..."). When complete, renders the tailored resume text with change highlights.

**API calls:** `POST /resumes/:resumeId/tailor` to start, then `useSSE` hook for `GET /tailoring/:tailoringJobId/stream` to track progress.

---

### `ScoreCard`
**File:** `src/features/scoring/components/ScoreCard.tsx`

**Props:**
```ts
interface ScoreCardProps {
  score: number;      // 0–100
  label?: string;     // e.g. "ATS Compatibility Score"
  breakdown: SectionScore[];
}
```

**What it renders:** A large circular progress ring (built with SVG) showing the score number inside. Below it, an expandable list of score dimensions (Keywords, Formatting, Action Verbs, Quantifiable Results, Section Completeness) with individual percentages and short explanations.

**API calls:** None — display only. Receives score data from parent `ResumeScoring` page which calls `useScoreResume`.

---

### `Sidebar`
**File:** `src/components/layout/Sidebar.tsx`

**Props:** None — reads all state from `useSidebarStore` and `useAuthStore`.

**What it renders:** The left navigation rail. ClawdBot logo at the top, then nav links (Jobs, Resumes, Score, Notifications, Settings), and the current user's avatar with name at the bottom. A collapse toggle button shrinks the sidebar to icon-only mode. The active route is highlighted using `useLocation()` from React Router.

**API calls:** None — reads current user from Zustand auth store (populated by `useCurrentUser` hook on app init).

---

### `NotificationItem`
**File:** `src/features/notifications/components/NotificationItem.tsx`

**Props:**
```ts
interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}
```

**What it renders:** A row with a left-side icon (robot icon for AI events, envelope for email events, briefcase for job updates), the notification message, a relative timestamp ("3 hours ago"), and a subtle blue dot if unread. Clicking the row calls `onMarkRead` and optionally navigates to the relevant resource (e.g. clicking a "Resume tailored" notification goes to the tailoring result).

**API calls:** None directly. `onMarkRead` calls `useMarkRead` mutation in the parent.

---

### `ProtectedRoute`
**File:** `src/features/auth/components/ProtectedRoute.tsx`

**Props:**
```ts
interface ProtectedRouteProps {
  children: React.ReactNode;
}
```

**What it renders:** Either `children` if the user is authenticated, or a redirect to `/login`. Also handles the "token refresh" logic — if the access token is expired but a refresh token exists, it fires a silent refresh before deciding whether to show the page or redirect.

**API calls:** `POST /auth/refresh` via `useTokenRefresh` (fires silently on mount if access token is within 60 seconds of expiry).

---

## 5. State Management Strategy

The rule is simple: **server data belongs to TanStack Query, UI state belongs to Zustand, form state belongs to useState.**

Never put server data (jobs, resumes, notifications) in Zustand. Never put UI state (modal open/closed, sidebar collapsed) in TanStack Query. They solve different problems.

---

### TanStack Query — Server Data

TanStack Query is for data that lives on the backend and needs to be kept in sync.

**Query Client configuration** (`src/app/queryClient.ts`):
```ts
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // 5 minutes — don't refetch if data is younger than this
      gcTime: 1000 * 60 * 10,       // 10 minutes — remove from cache if unused this long
      retry: 2,                      // retry failed requests twice before showing error
      refetchOnWindowFocus: true,    // silently refetch when user switches back to the tab
    },
    mutations: {
      onError: (error: unknown) => {
        // global mutation error handler — show a toast
        const message = error instanceof ApiError ? error.message : "Something went wrong";
        toast.error(message);
      },
    },
  },
});
```

**Fetching the jobs list:**
```ts
// src/features/jobs/hooks/useJobs.ts
export function useJobs(filters: JobFilters) {
  return useQuery({
    queryKey: ["jobs", filters],            // cache is keyed by filters — different filters = different cache
    queryFn: () => jobsApi.getJobs(filters),
    placeholderData: keepPreviousData,       // show old results while new page loads (no blank flash)
  });
}
```

**Mutating — updating a job status:**
```ts
// src/features/jobs/hooks/useUpdateJob.ts
export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, data }: { jobId: string; data: UpdateJobDto }) =>
      jobsApi.updateJob(jobId, data),

    // Optimistic update — update the UI immediately, before the server responds
    onMutate: async ({ jobId, data }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] }); // stop any in-flight fetches
      const previousJobs = queryClient.getQueryData(["jobs"]);  // save current state to roll back if needed
      queryClient.setQueryData(["jobs"], (old: Job[]) =>
        old.map((job) => (job.id === jobId ? { ...job, ...data } : job))
      );
      return { previousJobs }; // pass to onError for rollback
    },

    onError: (_err, _variables, context) => {
      queryClient.setQueryData(["jobs"], context?.previousJobs); // rollback on failure
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] }); // refetch to sync with server
    },
  });
}
```

**Why optimistic updates matter for ClawdBot:** When a user drags a job card from "Applied" to "Interviewing" on the kanban board, they should see the card move instantly. Without an optimistic update, the card would snap back to the old column for 300ms while waiting for the API — jarring and confusing. With the optimistic update, the card stays where the user dragged it, and if the server fails, it snaps back with an error toast.

---

### Zustand — UI State

Zustand stores are for things that are purely visual and do not need to survive a page refresh.

**Jobs filter store** (`src/stores/jobs.store.ts`):
```ts
import { create } from "zustand";
import { JobFilters, ViewMode } from "@/types/job.types";

interface JobsUIStore {
  filters: JobFilters;
  viewMode: ViewMode;                             // "list" | "kanban"
  setFilter: (key: keyof JobFilters, value: unknown) => void;
  clearFilters: () => void;
  setViewMode: (mode: ViewMode) => void;
}

export const useJobsUIStore = create<JobsUIStore>((set) => ({
  filters: { status: "all", page: 1 },
  viewMode: "kanban",
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value, page: 1 } })),
  clearFilters: () => set({ filters: { status: "all", page: 1 } }),
  setViewMode: (mode) => set({ viewMode: mode }),
}));
```

**Modal store** (`src/stores/modal.store.ts`) — a single store handles all modals:
```ts
type ModalType = "createJob" | "deleteJob" | "uploadResume" | "confirmAction" | null;

interface ModalStore {
  activeModal: ModalType;
  modalProps: Record<string, unknown>;
  openModal: (modal: ModalType, props?: Record<string, unknown>) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  activeModal: null,
  modalProps: {},
  openModal: (modal, props = {}) => set({ activeModal: modal, modalProps: props }),
  closeModal: () => set({ activeModal: null, modalProps: {} }),
}));
```

Usage in any component:
```ts
const { openModal } = useModalStore();
// Open the delete confirmation, passing the job ID as a prop
<Button onClick={() => openModal("deleteJob", { jobId: job.id })}>Delete</Button>
```

---

### useState — Local Form State

For form inputs that only matter until the user submits or cancels, `useState` is correct and sufficient.

```ts
// Inside LoginForm.tsx
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
```

No need to put this in Zustand or TanStack Query. The moment the user submits, the mutation takes over. If they navigate away, the form state is gone — which is exactly what we want.

---

## 6. API Layer

All HTTP calls go through a single axios instance. No component or hook should ever call `fetch()` or `axios.create()` directly — they always import from `src/services/api.ts`.

### The Axios Instance (`src/services/api.ts`)

```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth.store";
import { queryClient } from "@/app/queryClient";

// Base instance — all requests inherit these defaults
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // from .env file: VITE_API_BASE_URL=http://localhost:8000/api
  timeout: 15000,                               // abort requests that take longer than 15 seconds
  headers: {
    "Content-Type": "application/json",
  },
});

// REQUEST INTERCEPTOR — runs before every request leaves the browser
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`; // attach JWT to every request
  }
  return config;
});

// RESPONSE INTERCEPTOR — runs after every response arrives
apiClient.interceptors.response.use(
  (response) => response, // success — pass through unchanged

  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized — try to refresh the token once
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true; // flag to prevent infinite retry loop

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/auth/refresh`,
          { refreshToken }
        );
        useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest); // retry the original request with new token
      } catch {
        // Refresh failed — log the user out and clear all cached data
        useAuthStore.getState().clearAuth();
        queryClient.clear();
        window.location.href = "/login";
      }
    }

    // For all other errors, wrap in a consistent ApiError shape
    const message =
      (error.response?.data as { message?: string })?.message ??
      error.message ??
      "An unexpected error occurred";

    return Promise.reject(new ApiError(message, error.response?.status ?? 0));
  }
);

// Custom error class so we can type-check errors throughout the app
export class ApiError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "ApiError";
  }
}
```

**What the interceptor does, in plain English:**

The request interceptor is like a security guard at the door — every request that leaves your app must show an ID badge (the JWT token). The response interceptor is like a mail room — when a letter comes back marked "addressee not found" (401), it tries to get a new address (refresh token) before forwarding it once more. If the new address also fails, it tells the user to go back to the front desk (login page).

---

### Feature API Files

Each feature owns its API calls. Example: `src/services/jobs.api.ts`:

```ts
import { apiClient } from "./api";
import type { Job, CreateJobDto, UpdateJobDto, JobFilters } from "@/types/job.types";
import type { PaginatedResponse } from "@/types/api.types";

export const jobsApi = {
  // GET /jobs?status=saved&page=1&limit=20
  getJobs: async (filters: JobFilters): Promise<PaginatedResponse<Job>> => {
    const { data } = await apiClient.get("/jobs", { params: filters });
    return data;
  },

  // GET /jobs/:id
  getJob: async (jobId: string): Promise<Job> => {
    const { data } = await apiClient.get(`/jobs/${jobId}`);
    return data;
  },

  // POST /jobs
  createJob: async (dto: CreateJobDto): Promise<Job> => {
    const { data } = await apiClient.post("/jobs", dto);
    return data;
  },

  // PATCH /jobs/:id
  updateJob: async (jobId: string, dto: UpdateJobDto): Promise<Job> => {
    const { data } = await apiClient.patch(`/jobs/${jobId}`, dto);
    return data;
  },

  // DELETE /jobs/:id
  deleteJob: async (jobId: string): Promise<void> => {
    await apiClient.delete(`/jobs/${jobId}`);
  },
};
```

**Pattern for file uploads** (`src/services/resumes.api.ts` excerpt):
```ts
uploadResume: async (
  file: File,
  onProgress?: (percent: number) => void
): Promise<Resume> => {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await apiClient.post("/resumes", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
},
```

---

## 7. Real-Time Updates

### Server-Sent Events (SSE) for AI Processing

When a user clicks "Tailor Resume," the AI processing can take 10–30 seconds. Instead of making them stare at a frozen screen, ClawdBot uses Server-Sent Events (SSE) to stream live status updates from the backend.

**What is SSE?** SSE is a one-way channel — the server pushes text events to the browser over a persistent HTTP connection. Unlike WebSockets (two-way), SSE is simpler, uses standard HTTP, and automatically reconnects if the connection drops. Perfect for progress updates where the browser never needs to send anything back.

**The `useSSE` hook** (`src/hooks/useSSE.ts`):
```ts
import { useEffect, useState, useRef } from "react";

interface SSEState<T> {
  data: T | null;
  error: string | null;
  isConnected: boolean;
}

export function useSSE<T>(url: string | null) {
  const [state, setState] = useState<SSEState<T>>({ data: null, error: null, isConnected: false });
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return; // don't connect until we have a URL

    const token = useAuthStore.getState().accessToken;
    // SSE requires credentials in the URL because EventSource doesn't support custom headers
    const authUrl = `${url}?token=${token}`;

    const es = new EventSource(authUrl);
    eventSourceRef.current = es;

    es.onopen = () => setState((s) => ({ ...s, isConnected: true }));

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T;
        setState((s) => ({ ...s, data: parsed }));
      } catch {
        setState((s) => ({ ...s, error: "Failed to parse event data" }));
      }
    };

    es.onerror = () => {
      setState((s) => ({ ...s, isConnected: false, error: "Connection lost" }));
      es.close();
    };

    return () => {
      es.close(); // cleanup when component unmounts or URL changes
    };
  }, [url]);

  return state;
}
```

**How it is used in `TailoringPanel`:**
```ts
const { data: progress } = useSSE<TailoringProgress>(
  tailoringJobId ? `/api/tailoring/${tailoringJobId}/stream` : null
);

// progress.status: "analyzing" | "matching" | "rewriting" | "complete" | "failed"
// progress.percent: 0–100
// progress.message: "Matching keywords to job description..."
```

**SSE event stream from server (what the backend sends):**
```
data: {"status":"analyzing","percent":10,"message":"Reading job description..."}

data: {"status":"matching","percent":40,"message":"Identifying missing keywords..."}

data: {"status":"rewriting","percent":75,"message":"Strengthening bullet points..."}

data: {"status":"complete","percent":100,"message":"Your tailored resume is ready!","resultId":"abc123"}
```

---

### Polling Fallback

If SSE is unavailable (some corporate proxies block persistent connections), fall back to polling.

```ts
// In useTailorResume.ts — check every 3 seconds if SSE is not connected
const { isConnected: sseConnected } = useSSE(tailoringUrl);

const { data: polledProgress } = useQuery({
  queryKey: ["tailoring", tailoringJobId],
  queryFn: () => tailoringApi.getStatus(tailoringJobId!),
  enabled: !!tailoringJobId && !sseConnected, // only poll if SSE is not working
  refetchInterval: 3000,                        // poll every 3 seconds
  refetchIntervalInBackground: false,           // stop polling when tab is hidden
});
```

---

### Notification Badge Polling

The notification bell badge in the sidebar shows unread count. This uses lightweight polling (not SSE) because it is a simple integer, not a real-time stream.

```ts
// src/features/notifications/hooks/useUnreadCount.ts
export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 1000 * 30, // poll every 30 seconds
    refetchIntervalInBackground: false,
  });
}
```

---

## 8. Performance

### Code Splitting by Route

By default, Vite bundles everything into one large JavaScript file. With code splitting, each route gets its own chunk that only downloads when the user visits that route.

**Analogy:** Instead of downloading the entire encyclopedia when you open a book, you only download the chapter you are reading.

```ts
// src/app/router.tsx — lazy load every page
import { lazy, Suspense } from "react";

const JobsDashboard = lazy(() => import("@/pages/jobs/JobsDashboard"));
const ResumeManager = lazy(() => import("@/pages/resumes/ResumeManager"));
const AITailoring = lazy(() => import("@/pages/resumes/AITailoring"));
const ResumeScoring = lazy(() => import("@/pages/scoring/ResumeScoring"));
const NotificationCenter = lazy(() => import("@/pages/notifications/NotificationCenter"));
const Settings = lazy(() => import("@/pages/settings/Settings"));

// Wrap the router outlet in Suspense to show a fallback while the chunk loads
<Suspense fallback={<PageLoadingSkeleton />}>
  <Outlet />
</Suspense>
```

The result: the initial JavaScript bundle only contains the login page and the layout shell. The Jobs Dashboard code downloads only when the user navigates to `/jobs`.

---

### Virtualizing the Job List

If a user has 500 saved jobs, rendering 500 `<JobCard>` components simultaneously would make the browser sluggish — that is 500 DOM nodes with event listeners, all in memory.

**Virtualization** renders only the cards that are currently visible on screen (maybe 10–15), and swaps them out as the user scrolls. The DOM stays small and fast regardless of how many total jobs exist.

```ts
// src/features/jobs/components/JobList.tsx
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

export function JobList({ jobs }: { jobs: Job[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88, // estimated height of each JobCard in pixels
    overscan: 5,            // render 5 extra rows above and below visible area
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              width: "100%",
            }}
          >
            <JobCard job={jobs[virtualRow.index]} ... />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### PDF Optimization

PDFs in the Resume Manager are displayed using `react-pdf`. Large PDFs are slow to render. Optimizations:

1. **Lazy load `react-pdf`** — the PDF rendering library is large (~1MB). Import it only when the user opens a resume viewer:
   ```ts
   const ResumeViewer = lazy(() => import("@/features/resumes/components/ResumeViewer"));
   ```

2. **Render only the visible page** — for multi-page resumes, only render the current page number. Show "Page 2 of 5" controls rather than rendering all 5 pages at once.

3. **Use `URL.createObjectURL`** — when displaying a just-uploaded file, create a local object URL rather than uploading and downloading the file again:
   ```ts
   const previewUrl = useMemo(
     () => (file ? URL.createObjectURL(file) : null),
     [file]
   );
   // Revoke URL on cleanup to free memory
   useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
   ```

4. **Cache worker** — configure `react-pdf` to reuse its PDF.js web worker across renders rather than creating a new one per component mount.

---

### Query Cache as Performance Tool

Because TanStack Query caches by query key, navigating away from the Jobs Dashboard and back does not re-fetch the list — it uses the cached data and renders instantly. This makes navigation feel instant, like a native app. Only when the data is older than `staleTime` (5 minutes) does a background refetch occur.

---

## 9. Error Handling

### Error Boundaries

**Analogy:** A React Error Boundary is like a circuit breaker in your home's electrical panel. If one circuit (component subtree) has a fault, the circuit breaker trips and cuts off just that circuit — the rest of your house keeps working. Without Error Boundaries, a single thrown error in one component would crash the entire React app into a white screen.

```tsx
// src/components/feedback/ErrorBoundary.tsx
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log to error tracking service (e.g., Sentry)
    console.error("Error boundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-8 text-center">
          <h2 className="text-lg font-semibold text-destructive">Something went wrong</h2>
          <p className="text-muted-foreground mt-2">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Placement strategy:** Wrap each major feature independently so that a crash in the AI Tailoring panel does not break the Jobs Dashboard or Sidebar.

```tsx
// In RootLayout.tsx
<Sidebar />
<main>
  <ErrorBoundary fallback={<PageError />}>
    <Outlet />   {/* each page is protected by this boundary */}
  </ErrorBoundary>
</main>
```

---

### Toast Notifications

Toasts are small pop-up messages that appear in the corner of the screen. ClawdBot uses the `sonner` library (built specifically for React, works well with Tailwind).

**When to use each toast type:**

| Toast Type | When to Use | Example |
|---|---|---|
| `toast.success()` | After a successful mutation | "Job saved successfully" |
| `toast.error()` | When a mutation or fetch fails | "Failed to update job status" |
| `toast.info()` | For neutral information | "Tailoring job queued — we'll notify you when done" |
| `toast.loading()` | For multi-step async operations | "Uploading resume..." |

**Global error toast** — the TanStack Query `defaultOptions.mutations.onError` handler (defined in `queryClient.ts`) shows a `toast.error()` for every mutation failure, so individual hooks do not need to repeat this logic. Specific hooks can override this if they need custom error messages.

**Setup in `app/providers.tsx`:**
```tsx
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

---

### Loading and Skeleton States

Never show a blank white area while data loads. Show a skeleton — a gray shimmer placeholder in the same shape as the content that is loading.

**Why skeletons over spinners?** Spinners give no information about what is loading or how long it will take. Skeletons show the user the shape of the content they are about to see, which reduces perceived load time.

**Job list skeleton:**
```tsx
// Shown when useJobs isLoading is true
function JobListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
```

**Pattern for every data-fetching component:**
```tsx
function JobsDashboard() {
  const { data: jobs, isLoading, error } = useJobs(filters);

  if (isLoading) return <JobListSkeleton />;
  if (error) return <ErrorMessage message={error.message} onRetry={() => refetch()} />;
  if (!jobs?.items.length) return <EmptyState message="No jobs found. Add your first job to get started." />;

  return <JobList jobs={jobs.items} />;
}
```

This three-state pattern (loading → error → data) is used consistently across every page and feature.

---

### Field-Level Form Validation

For form validation before API calls, ClawdBot uses **Zod** schemas paired with **React Hook Form**:

```ts
// src/features/jobs/components/JobForm.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const createJobSchema = z.object({
  title: z.string().min(2, "Job title must be at least 2 characters"),
  companyName: z.string().min(1, "Company name is required"),
  location: z.string().optional(),
  url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type CreateJobFormData = z.infer<typeof createJobSchema>;

export function JobForm({ onSubmit }: { onSubmit: (data: CreateJobFormData) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateJobFormData>({
    resolver: zodResolver(createJobSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register("title")} placeholder="Software Engineer" />
      {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}
      {/* ... */}
    </form>
  );
}
```

Zod validates on submit. Inline error messages appear directly under the offending field. The form does not call the API if validation fails — saving a round trip and giving the user immediate feedback.

---

*End of 02_frontend.md*
