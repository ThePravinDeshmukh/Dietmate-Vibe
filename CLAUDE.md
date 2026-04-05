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

## Architecture

### Monorepo Layout

- `diet-tracker-react/` — **Active app**: React SPA + Express backend
- `modules/`, `api.py`, `app.py` — Legacy Python Streamlit/FastAPI (ignore)

### Full-Stack Structure

**Frontend** (`diet-tracker-react/src/`): React 19 + TypeScript + Material UI 7 + Vite

**Backend** (`diet-tracker-react/server.js`): Express.js serving REST API on port 5000. Vite dev server proxies `/api/*` to it.

**Database**: MongoDB Atlas — two collections:
- `diet_entries` — daily food intake records per category
- `lab_reports` — extracted PDF lab report parameters

### Shared Code

`diet-tracker-react/shared/requirements.js` defines `DAILY_REQUIREMENTS` — the reference amounts for 15 food categories (cereal, fruits, vegetables, legumes, milk, formulas, amino acids, etc.) used by both frontend components and backend calculations.

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
| POST | `/api/lab-reports/upload` | Upload & extract PDF lab report |
| GET | `/api/lab-reports/parameters` | All tracked parameter names |
| GET | `/api/lab-reports/trends?params=...` | Parameter trend data |
| POST | `/api/remind-missing-diet` | Trigger push notification |

### Key Components

- `App.tsx` — Main daily tracking view with date picker, per-category sliders, and overall progress
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
```

### Notable Features

- **Web Push Notifications**: VAPID-based push reminders for missing diet entries; service worker registered in `main.tsx`
- **Offline support**: Service worker for caching; connection status tracked in UI
- **Excel export**: Monthly data exported as `.xlsx` from `DietHistoryTable`
- **PDF extraction**: Lab report PDFs parsed with `pdf2json`, parameters stored in MongoDB
