# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DietMate Vibe is a specialized diet tracking app for a child with specific daily nutritional requirements. The active application is a React + Express + MongoDB stack in `diet-tracker-react/`. Legacy Python/Streamlit/FastAPI code exists at the root but is no longer actively used.

## Commands

All commands run from `diet-tracker-react/`:

```bash
npm run start      # Run both Express backend and Vite dev server concurrently
npm run dev        # Vite dev server only (frontend, proxies /api to :5000)
npm run server     # Express backend only (port 5000)
npm run build      # tsc -b && vite build
npm run lint       # ESLint check
npm run preview    # Preview production build
npm run debug      # Node with --inspect-brk for debugging server.js
```

There is no test suite.

## Developer Workflow

### Spec-Driven Development

New features follow a spec-first approach:

1. **Write a spec** in `docs/specs/<feature-name>.md` before touching code. The spec should cover: problem statement, proposed solution, API changes, data model changes, and UI behavior.
2. **Get alignment** — review the spec before implementation begins. Changes to scope happen in the spec, not mid-implementation.
3. **Implement against the spec** — backend API first, then frontend. Keep PRs focused on one spec at a time.
4. **Verify** — manually test the golden path and edge cases against the spec's acceptance criteria. There is no automated test suite.

### Branching

Work on feature branches named `<issue-number>-<short-description>` (e.g. `12-push-notification-settings`). PRs target `main`.

### Making Changes

- **Backend changes** (`server.js`, `chatHandler.js`): restart `npm run server` to pick up changes.
- **Frontend changes** (`src/`): Vite HMR picks up changes automatically during `npm run dev`.
- **Shared code** (`shared/`): used by both sides — changes affect both Express routes and React components.
- After any change, run `npm run lint` before committing.

## Architecture

### Monorepo Layout

- `diet-tracker-react/` — **Active app**: React SPA + Express backend
- `modules/`, `api.py`, `app.py` — Legacy Python Streamlit/FastAPI (ignore)

### Full-Stack Structure

**Frontend** (`diet-tracker-react/src/`): React 19 + TypeScript + Material UI 7 + Vite

**Backend** (`diet-tracker-react/server.js`): Express.js serving REST API on port 5000. Vite dev server proxies `/api/*` to it.

**Database**: MongoDB Atlas — three collections:
- `diet_entries` — daily food intake records per category
- `lab_reports` — extracted PDF lab report parameters
- `day_notes` — free-text notes per date

### Shared Code

- `diet-tracker-react/shared/requirements.js` — `DAILY_REQUIREMENTS`: reference amounts for 15 food categories used by both frontend and backend
- `diet-tracker-react/shared/foodExchanges.js` — `FOOD_EXCHANGES`: food exchange mappings used by the chat agent
- `diet-tracker-react/chatHandler.js` — Gemini-backed AI chat agent with tool-use (get/update diet entries, get remaining requirements, get notes)

### Date/Timezone Handling

All dates are stored in UTC in MongoDB. The client sends `YYYY-MM-DD` strings in IST (UTC+5:30). The server uses `getISTDayRange(dateParam)` to convert IST dates to UTC ranges for queries. Be careful when adding any date logic — always account for IST offset.

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ping` | Health check |
| GET | `/api/entries?date=YYYY-MM-DD` | Get entries for a date |
| POST | `/api/entries` | Create/update entry |
| POST | `/api/entries/batch` | Batch update multiple entries |
| GET | `/api/entries/batch/:start/:end` | Get range of entries |
| GET | `/api/history?start=...&end=...` | Daily completion percentages |
| GET | `/api/entries/all` | All entries (no date filter) |
| POST | `/api/lab-reports/upload` | Upload & extract PDF lab report |
| GET | `/api/lab-reports/parameters` | All tracked parameter names |
| GET | `/api/lab-reports/trends?params=...` | Parameter trend data |
| GET | `/api/notes?date=YYYY-MM-DD` | Get notes for a date |
| POST | `/api/notes` | Add note for a date |
| DELETE | `/api/notes` | Delete a note by `createdAt` |
| GET | `/api/chat/models` | List available Gemini models |
| POST | `/api/chat` | Send message to AI chat agent |
| GET | `/api/chat/system-prompt` | Get the current system prompt |
| GET | `/api/vapid-public-key` | Get VAPID public key for push |
| POST | `/api/save-subscription` | Save push subscription |
| POST | `/api/remind-missing-diet` | Trigger push notification |

### Key Components

- `App.tsx` — Main daily tracking view with date picker, per-category sliders, and overall progress
- `ChatSidebar.tsx` — AI chat panel (Gemini) with Notes tab; uses `useChat` and `useNotes` hooks
- `SystemPromptDialog.tsx` — Editable system prompt viewer for the chat agent
- `DietHistoryTable.tsx` — Monthly grid view with Excel export (xlsx + file-saver)
- `LabReports.tsx` — PDF upload, parameter extraction, trend visualization
- `ProgressChart.tsx` — Visual completion charts
- `NutrientSlider.tsx` — Input control for each food category

### Environment Variables

`diet-tracker-react/.env`:
```
MONGODB_URI=
MONGODB_DATABASE=diet_tracker
PORT=5000
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
GEMINI_API_KEY=
```

### Notable Features

- **AI Chat Agent**: Gemini-backed chat sidebar (`chatHandler.js`) with tool-use to read/write diet entries and notes. Model is selectable at runtime. System prompt is editable via `SystemPromptDialog`.
- **Day Notes**: Per-date free-text notes stored in `day_notes` collection; accessible from chat sidebar Notes tab via `useNotes` hook.
- **Web Push Notifications**: VAPID-based push reminders for missing diet entries; service worker registered in `main.tsx`
- **Offline support**: Service worker for caching; connection status tracked in UI
- **Excel export**: Monthly data exported as `.xlsx` from `DietHistoryTable`
- **PDF extraction**: Lab report PDFs parsed with `pdf2json`, parameters stored in MongoDB
