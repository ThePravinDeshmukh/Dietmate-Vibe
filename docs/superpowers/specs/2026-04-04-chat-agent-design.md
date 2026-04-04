# Chat Agent Design — DietMate Vibe

**Date:** 2026-04-04  
**Branch:** 2-record-diet  
**Status:** Approved

---

## Overview

Add a conversational chat assistant to the existing React + Express + MongoDB app. The assistant allows the user to record diet entries, query remaining diet, and get recipe suggestions — all via natural language. The assistant is powered by OpenAI `gpt-4o-mini` with function calling (tool use) for reliable structured writes to MongoDB.

---

## UI Layout

### Main Tracker Page (revised)

```
┌─────────────────────────────────────────────────────────────────────┐
│  IEM Vibe                                           [Online] [📊]   │
├─────────────────────────────────────────────────────────────────────┤
│  Tracker | History | Table | Lab Reports                            │
├─────────────────────────────┬───────────────────────────────────────┤
│  Diet Assistant         [×] │                                       │
│─────────────────────────────│   Overall Completion                  │
│  [message history]          │   ████████░░░░  65%                   │
│                             │   Target for Current Time: 65%        │
│                             │                                       │
│                             │   Smart Suggestions                   │
│                             │   • Add 8 more cereal exchanges       │
│                             │                                       │
│                             │   Progress Chart                      │
│                             │                                       │
│─────────────────────────────│                                       │
│  [Type a message...] [Send] │                                       │
└─────────────────────────────┴───────────────────────────────────────┘
```

- Chat sidebar is **left**, ~350px wide, toggleable via 💬 icon in nav bar
- Main area (right) shows: summary, time target, smart suggestions, progress chart
- **Sliders moved to a modal dialog** triggered by 📊 "Edit Diet" button in nav bar
- On mobile: sidebar takes full screen when open
- Slider changes in modal live-update the main view

---

## Architecture

### Request Flow

```
Browser (React)
    │
    │  POST /api/chat  { message, date }
    ▼
Express backend (server.js → chatHandler.js)
    │  1. Load last 20 messages from MongoDB chat_history
    │  2. Build system prompt with PA constraints + daily requirements
    │  3. Call OpenAI gpt-4o-mini with messages + 4 function definitions
    │  4. If OpenAI invokes a function → execute against MongoDB
    │  5. Return tool result to OpenAI → get final text response
    │  6. Save user + assistant messages to chat_history
    │  7. Return { reply } to frontend
    ▼
OpenAI API (gpt-4o-mini)
    │  function calling (tool use)
    ▼
MongoDB Atlas
    • diet_entries     (existing)
    • chat_history     (new)
```

### OpenAI Functions (Tools)

| Function | Arguments | What it does |
|----------|-----------|--------------|
| `get_diet_entries` | `date: string` | Fetches all category amounts for a given IST date |
| `update_diet_entry` | `category, amount, date` | Upserts one diet entry (reuses existing DB logic) |
| `get_remaining_diet` | `date: string` | Returns per-category remaining amounts vs. daily requirements |
| `get_diet_history` | `start, end: string` | Returns daily completion percentages for a date range |

OpenAI decides when to call tools vs. answer conversationally. Multiple tool calls can happen in one turn (e.g., "log 5 cereal and 2 legumes" triggers two `update_diet_entry` calls).

---

## System Prompt

```
You are a diet assistant for a child with PA (Propionic Acidemia).

DIETARY CONSTRAINTS (never suggest these):
- No high-protein foods: meat, fish, eggs, dairy (except prescribed soy milk/formulas),
  nuts, regular bread/flour
- Protein must be carefully controlled — excess protein leads to dangerous propionic
  acid buildup
- The child uses special PA formula and Cal-C formula — these are medical foods, not
  optional
- Isoleucine (3g) and Valine (4g) are prescribed supplements, not food sources

DAILY REQUIREMENTS:
Cereal: 13 exchanges, Dried fruit: 1 exchange, Fresh fruit: 3 exchanges,
Legumes: 3 exchanges, Other vegetables: 3 exchanges, Root vegetables: 2 exchanges,
Free group: 3 exchanges, Jaggery: 20g, Soy milk: 120ml, Sugar: 10g,
Oil/ghee: 30g, PA formula: 32g, Cal-C formula: 24g, Isoleucine: 3g, Valine: 4g

CURRENT DATE: {today in IST}
CURRENT TIME TARGET: {current milestone %}

When recording diet, always confirm what was logged and show remaining.
When suggesting recipes, only use PA-safe ingredients from allowed categories.
Keep responses concise — this is a mobile-friendly chat.
```

---

## Data Model

### `chat_history` collection (new)

```json
{
  "sessionDate": "2026-04-04",
  "role": "user" | "assistant" | "tool",
  "content": "string",
  "timestamp": "ISODate"
}
```

- Indexed on `sessionDate` for fast retrieval
- Last 20 messages fetched per API call to cap context window and cost

---

## New Files

| File | Purpose |
|------|---------|
| `src/components/ChatSidebar.tsx` | Chat UI: message list, input box, toggle state |
| `src/hooks/useChat.ts` | API calls to `/api/chat`, message state, loading state |
| `diet-tracker-react/chatHandler.js` | All chat logic: history fetch, OpenAI call, tool execution, DB save |

## Modified Files

| File | Change |
|------|--------|
| `diet-tracker-react/server.js` | Add `POST /api/chat` route, import chatHandler |
| `diet-tracker-react/src/components/App.tsx` | Add ChatSidebar, toggle state, move sliders to modal |

---

## New Packages

```bash
npm install openai   # OpenAI Node.js SDK — function calling support
```

## New Environment Variables

```
OPENAI_API_KEY=sk-...   # Add to .env and Render dashboard
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| OpenAI API down | Return 503, show "Assistant unavailable" in UI — sliders still work |
| Invalid category in chat | OpenAI refuses with PA constraint explanation |
| Invalid amount (negative/out of range) | chatHandler validates before DB write, returns error to OpenAI |
| `OPENAI_API_KEY` not set | Server logs warning on startup, `/api/chat` returns 503 |
| Chat history fetch fails | Falls back to empty history, chat continues without context |

---

## Cost Estimate

| Component | Cost |
|-----------|------|
| Render web service | Free (cold starts after 15 min inactivity) |
| MongoDB Atlas | Free (512MB tier) |
| OpenAI gpt-4o-mini | ~$0.15–0.50/month at 10 messages/day |
| Total | < $1/month |

---

## Out of Scope

- Streaming responses (can be added later)
- Voice input
- MCP server (separate future project)
- Python backend migration (deferred)
- Recipe database / predefined recipes (OpenAI generates dynamically)
