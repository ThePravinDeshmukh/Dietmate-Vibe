# Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable left-sidebar chat assistant to the diet tracker that can record entries, query remaining diet, and suggest PA-safe recipes via OpenAI gpt-4o-mini function calling.

**Architecture:** A new `chatHandler.js` module on the Express backend handles all OpenAI communication and MongoDB reads/writes. The React frontend adds a `ChatSidebar` component (left sidebar, toggled via nav button) and moves the existing sliders into a modal dialog. A `useChat` hook manages frontend message state.

**Tech Stack:** React 19 + TypeScript + MUI 7 (frontend), Express.js (backend), OpenAI Node SDK (`openai` npm package), MongoDB Atlas (`chat_history` collection added).

---

## File Map

| Status | File | Change |
|--------|------|--------|
| Create | `diet-tracker-react/chatHandler.js` | All chat logic: history, OpenAI call, tool execution, DB save |
| Create | `diet-tracker-react/src/hooks/useChat.ts` | Frontend: message state, POST /api/chat |
| Create | `diet-tracker-react/src/components/ChatSidebar.tsx` | Chat UI: message list + input |
| Modify | `diet-tracker-react/server.js` | Add POST /api/chat route |
| Modify | `diet-tracker-react/src/components/App.tsx` | Layout: chat sidebar left, sliders in modal |
| Modify | `diet-tracker-react/.env` | Add OPENAI_API_KEY |

---

## Task 1: Install openai package and add env var

**Files:**
- Modify: `diet-tracker-react/package.json` (via npm install)
- Modify: `diet-tracker-react/.env`

- [ ] **Step 1: Install the OpenAI SDK**

```bash
cd diet-tracker-react
npm install openai
```

Expected output: `added 1 package` (or similar — no errors)

- [ ] **Step 2: Add OPENAI_API_KEY to .env**

Open `diet-tracker-react/.env` and add this line (get key from platform.openai.com → API keys):

```
OPENAI_API_KEY=sk-proj-your-key-here
```

The full `.env` should now have:
```
MONGODB_URI=<existing>
MONGODB_DATABASE=diet_tracker
PORT=5000
VAPID_PUBLIC_KEY=<existing>
VAPID_PRIVATE_KEY=<existing>
OPENAI_API_KEY=sk-proj-your-key-here
```

- [ ] **Step 3: Verify server still starts**

```bash
npm run server
```

Expected: `Server is running on port 5000` — no errors about missing modules.

- [ ] **Step 4: Commit**

```bash
cd diet-tracker-react
git add package.json package-lock.json
git commit -m "feat: install openai sdk"
```

---

## Task 2: Create chatHandler.js

**Files:**
- Create: `diet-tracker-react/chatHandler.js`

This file contains all OpenAI function-calling logic. It exports a single `handleChat(req, res, db)` function called from `server.js`.

- [ ] **Step 1: Create the file**

Create `diet-tracker-react/chatHandler.js` with this content:

```javascript
import OpenAI from 'openai';
import { DAILY_REQUIREMENTS } from './shared/requirements.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Tool definitions sent to OpenAI ──────────────────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_diet_entries',
      description: 'Get all diet entries logged for a specific date',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format (IST)' }
        },
        required: ['date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_diet_entry',
      description: 'Set the logged amount for a diet category on a specific date. Amount replaces the current value (it is not additive).',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Food category name, e.g. "cereal", "legumes", "soy milk"' },
          amount: { type: 'number', description: 'Amount to set (not add). Must be >= 0.' },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format (IST)' }
        },
        required: ['category', 'amount', 'date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_remaining_diet',
      description: 'Get remaining diet requirements (required minus logged) for a specific date',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format (IST)' }
        },
        required: ['date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_diet_history',
      description: 'Get daily overall completion percentages for a date range',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date YYYY-MM-DD (IST)' },
          end:   { type: 'string', description: 'End date YYYY-MM-DD (IST)' }
        },
        required: ['start', 'end']
      }
    }
  }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getISTDayRange(dateParam) {
  const [year, month, day] = dateParam.split('-').map(Number);
  const startIST = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const endIST   = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  const startUTC = new Date(startIST.getTime() - 5.5 * 60 * 60 * 1000);
  const endUTC   = new Date(endIST.getTime()   - 5.5 * 60 * 60 * 1000);
  return { startUTC, endUTC };
}

function getCurrentTimeTargetPct() {
  const milestones = [
    { hour: 7,  minute: 0,  pct: 0.15 },
    { hour: 10, minute: 30, pct: 0.25 },
    { hour: 13, minute: 0,  pct: 0.5  },
    { hour: 16, minute: 30, pct: 0.65 },
    { hour: 19, minute: 30, pct: 0.85 },
    { hour: 21, minute: 0,  pct: 1.0  }
  ];
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const m of milestones) {
    if (mins < m.hour * 60 + m.minute) return m.pct;
  }
  return 1.0;
}

function buildSystemPrompt() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dateStr = ist.toISOString().slice(0, 10);
  const targetPct = Math.round(getCurrentTimeTargetPct() * 100);
  const reqList = DAILY_REQUIREMENTS
    .map(r => `${r.category}: ${r.amount} ${r.unit}`)
    .join(', ');

  return `You are a diet assistant for a child with PA (Propionic Acidemia).

DIETARY CONSTRAINTS (never suggest these):
- No high-protein foods: meat, fish, eggs, dairy (except prescribed soy milk/formulas), nuts, regular bread/flour
- Protein must be carefully controlled — excess protein leads to dangerous propionic acid buildup
- The child uses special PA formula and Cal-C formula — these are medical foods, not optional
- Isoleucine and Valine are prescribed supplements taken as powders, not food sources

DAILY REQUIREMENTS:
${reqList}

CURRENT DATE: ${dateStr} (IST)
CURRENT TIME TARGET: ${targetPct}% of daily diet should be completed by now

Rules:
- When recording diet, confirm what was logged and show remaining amount for that category.
- When suggesting recipes, only use PA-safe ingredients from the allowed food categories above.
- Keep responses concise — this is a mobile-friendly chat interface.
- If asked to log an amount, use update_diet_entry. Do not ask for confirmation before writing.`;
}

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name, args, db) {
  if (name === 'get_diet_entries') {
    const { startUTC, endUTC } = getISTDayRange(args.date);
    const entries = await db.collection('diet_entries').find({
      date: { $gte: startUTC, $lte: endUTC }
    }).toArray();
    return entries.map(e => ({ category: e.category, amount: e.amount, unit: e.unit }));
  }

  if (name === 'update_diet_entry') {
    const { category, amount, date } = args;
    const validCategories = DAILY_REQUIREMENTS.map(r => r.category);
    if (!validCategories.includes(category)) {
      return { error: `Unknown category "${category}". Valid: ${validCategories.join(', ')}` };
    }
    if (typeof amount !== 'number' || amount < 0 || amount > 10000) {
      return { error: 'Amount must be a number between 0 and 10000' };
    }
    const [year, month, day] = date.split('-').map(Number);
    const entryDate = new Date(
      new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).getTime() - 5.5 * 60 * 60 * 1000
    );
    const req = DAILY_REQUIREMENTS.find(r => r.category === category);
    await db.collection('diet_entries').updateOne(
      { date: entryDate, category },
      { $set: { amount, unit: req.unit, date: entryDate } },
      { upsert: true }
    );
    return { success: true, category, amount, unit: req.unit, date };
  }

  if (name === 'get_remaining_diet') {
    const { startUTC, endUTC } = getISTDayRange(args.date);
    const entries = await db.collection('diet_entries').find({
      date: { $gte: startUTC, $lte: endUTC }
    }).toArray();
    const catMap = {};
    entries.forEach(e => { catMap[e.category] = Number(e.amount) || 0; });
    return DAILY_REQUIREMENTS.map(req => ({
      category: req.category,
      required: req.amount,
      logged: catMap[req.category] || 0,
      remaining: Math.max(0, req.amount - (catMap[req.category] || 0)),
      unit: req.unit
    }));
  }

  if (name === 'get_diet_history') {
    const { start, end } = args;
    const [sY, sM, sD] = start.split('-').map(Number);
    const [eY, eM, eD] = end.split('-').map(Number);
    const startIST = new Date(Date.UTC(sY, sM - 1, sD, 0, 0, 0));
    const endIST   = new Date(Date.UTC(eY, eM - 1, eD, 23, 59, 59, 999));
    const startUTC = new Date(startIST.getTime() - 5.5 * 60 * 60 * 1000);
    const endUTC   = new Date(endIST.getTime()   - 5.5 * 60 * 60 * 1000);
    const entries = await db.collection('diet_entries').find({
      date: { $gte: startUTC, $lte: endUTC }
    }).toArray();
    const byDate = {};
    entries.forEach(e => {
      const dstr = new Date(new Date(e.date).getTime() + 5.5 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      if (!byDate[dstr]) byDate[dstr] = [];
      byDate[dstr].push(e);
    });
    const results = [];
    let cur = new Date(startIST);
    while (cur <= endIST) {
      const dstr = cur.toISOString().slice(0, 10);
      const dayEntries = byDate[dstr] || [];
      const catMap = {};
      dayEntries.forEach(e => { catMap[e.category] = Number(e.amount) || 0; });
      const pcts = DAILY_REQUIREMENTS.map(req =>
        Math.min((catMap[req.category] || 0) / req.amount * 100, 100)
      );
      results.push({
        date: dstr,
        completion: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
      });
      cur.setDate(cur.getDate() + 1);
    }
    return results;
  }

  return { error: `Unknown tool: ${name}` };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleChat(req, res, db) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Chat assistant unavailable: OPENAI_API_KEY not configured' });
  }

  const { message, date } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const today = date || new Date().toISOString().slice(0, 10);

  // Load last 20 messages from chat_history (oldest first)
  let history = [];
  try {
    const docs = await db.collection('chat_history')
      .find({})
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();
    history = docs.reverse().map(d => ({ role: d.role, content: d.content }));
  } catch (_) {
    // fall through with empty history — chat still works
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
    { role: 'user', content: message }
  ];

  try {
    // OpenAI function-calling loop (max 5 rounds)
    let response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto'
    });

    let assistantMessage = response.choices[0].message;

    for (let round = 0; round < 5 && assistantMessage.tool_calls?.length; round++) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        let result;
        try {
          const args = JSON.parse(toolCall.function.arguments);
          result = await executeTool(toolCall.function.name, args, db);
        } catch (e) {
          result = { error: e.message };
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }

      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto'
      });
      assistantMessage = response.choices[0].message;
    }

    const reply = assistantMessage.content || 'Done.';

    // Save user + assistant messages to chat_history (non-fatal if fails)
    try {
      await db.collection('chat_history').insertMany([
        { role: 'user',      content: message, sessionDate: today, timestamp: new Date() },
        { role: 'assistant', content: reply,   sessionDate: today, timestamp: new Date() }
      ]);
    } catch (_) {}

    res.json({ reply });
  } catch (e) {
    console.error('OpenAI error:', e.message);
    res.status(503).json({ error: 'Assistant unavailable, please try again' });
  }
}
```

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
cd diet-tracker-react
node --input-type=module < /dev/null && node -e "import('./chatHandler.js').then(() => console.log('OK')).catch(e => console.error(e.message))"
```

Expected: `OK` (or a dotenv/MongoDB error is fine — we just want no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add chatHandler.js
git commit -m "feat: add chatHandler with OpenAI function calling"
```

---

## Task 3: Add /api/chat route to server.js

**Files:**
- Modify: `diet-tracker-react/server.js`

- [ ] **Step 1: Add the import at the top of server.js**

After the existing imports (around line 12), add:

```javascript
import { handleChat } from './chatHandler.js';
```

- [ ] **Step 2: Add the route**

Add this route just before the `app.get('/api/ping', ...)` line (around line 381):

```javascript
// Chat assistant
app.post('/api/chat', (req, res) => handleChat(req, res, db));
```

- [ ] **Step 3: Start the server and test with curl**

```bash
npm run server
```

In a second terminal:

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"what are today's remaining diet items?\", \"date\": \"2026-04-04\"}"
```

Expected: JSON response like `{"reply":"Here are today's remaining items: cereal needs 13 more exchanges..."}` (exact wording varies)

- [ ] **Step 4: Test diet recording via curl**

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"log 5 exchanges of cereal for today\", \"date\": \"2026-04-04\"}"
```

Expected: `{"reply":"Done! I've logged 5 exchanges of cereal..."}` and a new document in the `diet_entries` MongoDB collection.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: add /api/chat route"
```

---

## Task 4: Create useChat.ts hook

**Files:**
- Create: `diet-tracker-react/src/hooks/useChat.ts`

- [ ] **Step 1: Create the hooks directory and file**

```bash
mkdir -p diet-tracker-react/src/hooks
```

Create `diet-tracker-react/src/hooks/useChat.ts`:

```typescript
import { useState, useCallback } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useChat(date: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    setMessages(prev => [...prev, { role: 'user', content }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, date })
      });

      if (!res.ok) throw new Error('Assistant unavailable');

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Sorry, I'm unavailable right now. Please try again." }
      ]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  return { messages, sendMessage, loading };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd diet-tracker-react
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat: add useChat hook"
```

---

## Task 5: Create ChatSidebar.tsx component

**Files:**
- Create: `diet-tracker-react/src/components/ChatSidebar.tsx`

- [ ] **Step 1: Create the file**

Create `diet-tracker-react/src/components/ChatSidebar.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, IconButton,
  CircularProgress, Stack
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import type { ChatMessage } from '../hooks/useChat';

interface ChatSidebarProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  loading: boolean;
  onClose: () => void;
}

export function ChatSidebar({ messages, onSendMessage, loading, onClose }: ChatSidebarProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Paper
      elevation={2}
      sx={{
        width: 320,
        minWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: 'calc(100vh - 180px)',
        position: 'sticky',
        top: 80,
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" fontWeight="bold">Diet Assistant</Typography>
        <IconButton size="small" onClick={onClose} aria-label="close chat">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* Message list */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
            Ask me to log entries, check remaining intake, or suggest recipes.
          </Typography>
        )}
        {messages.map((msg, i) => (
          <Box
            key={i}
            sx={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
              color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
              px: 1.5,
              py: 1,
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </Typography>
          </Box>
        ))}
        {loading && (
          <Box sx={{ alignSelf: 'flex-start', pl: 1 }}>
            <CircularProgress size={16} />
          </Box>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Input */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          multiline
          maxRows={3}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          aria-label="send message"
        >
          <SendIcon />
        </IconButton>
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd diet-tracker-react
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatSidebar.tsx
git commit -m "feat: add ChatSidebar component"
```

---

## Task 6: Refactor App.tsx — sliders modal + chat sidebar + new layout

**Files:**
- Modify: `diet-tracker-react/src/components/App.tsx`

This is the largest change. The goal:
1. Move sliders into a `<Dialog>` opened by an "Edit Diet" button
2. Add chat toggle button (💬) in the nav bar
3. Add `ChatSidebar` as a left sidebar (shown when `chatOpen` is true)
4. Make main content (summary, suggestions, chart) occupy the right area

- [ ] **Step 1: Add new imports at the top of App.tsx**

Replace the existing import block (lines 1–14) with:

```tsx
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import {
  Box, Container, Stack, Paper, Typography, Snackbar, Alert,
  Button, LinearProgress, Chip, CircularProgress, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Tooltip
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ChatIcon from '@mui/icons-material/Chat';
import EditIcon from '@mui/icons-material/Edit';
import type { NutrientEntry, DailyProgress } from '../types';
import { NutrientSlider } from './NutrientSlider';
import { ProgressChart } from './ProgressChart';
import { DietHistory } from './DietHistory';
import DietHistoryTable from './DietHistoryTable';
import LabReports from './LabReports';
import { CloudDone, CloudOff } from '@mui/icons-material';
import { urlBase64ToUint8Array } from '../pushUtils';
import { ChatSidebar } from './ChatSidebar';
import { useChat } from '../hooks/useChat';
```

- [ ] **Step 2: Add state variables inside the App() function**

After the existing state declarations (after line `const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');`), add:

```tsx
const [chatOpen, setChatOpen] = useState(false);
const [slidersOpen, setSlidersOpen] = useState(false);
const dateStr = formatDateLocal(selectedDate);
const { messages: chatMessages, sendMessage, loading: chatLoading } = useChat(dateStr);
```

- [ ] **Step 3: Replace the Route "/" JSX**

Find the `<Route path="/" element={` block and replace everything inside the `<>...</>` fragment with:

```tsx
<>
  {/* ── Sticky toolbar ── */}
  <Stack
    direction="row"
    spacing={1}
    alignItems="center"
    flexWrap="wrap"
    sx={{
      mb: 2,
      position: 'sticky',
      top: 0,
      zIndex: 1100,
      bgcolor: 'background.paper',
      py: 1.5,
      borderBottom: 1,
      borderColor: 'divider',
    }}
  >
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DatePicker
        label="Date"
        value={selectedDate}
        onChange={(date) => date && setSelectedDate(date)}
        slotProps={{ textField: { size: 'small', sx: { width: 140 } } }}
        disableFuture
      />
    </LocalizationProvider>
    <Tooltip title="Reset All Values">
      <Button variant="outlined" color="secondary" onClick={handleResetAll} size="small">Reset</Button>
    </Tooltip>
    <Tooltip title="Copy from Yesterday">
      <Button variant="outlined" color="primary" onClick={handleCopyFromYesterday} size="small">Copy</Button>
    </Tooltip>
    <Tooltip title="Save All Changes">
      <Button variant="contained" color="primary" onClick={handleSaveAll} size="small">Save</Button>
    </Tooltip>
    <Tooltip title="Edit Diet Entries">
      <Button
        variant="outlined"
        startIcon={<EditIcon />}
        onClick={() => setSlidersOpen(true)}
        size="small"
      >
        Edit Diet
      </Button>
    </Tooltip>
    <Tooltip title="Diet Assistant">
      <IconButton
        color={chatOpen ? 'primary' : 'default'}
        onClick={() => setChatOpen(o => !o)}
        aria-label="toggle chat"
      >
        <ChatIcon />
      </IconButton>
    </Tooltip>
  </Stack>

  {/* ── Main content row ── */}
  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">

    {/* Left: Chat Sidebar */}
    {chatOpen && (
      <ChatSidebar
        messages={chatMessages}
        onSendMessage={sendMessage}
        loading={chatLoading}
        onClose={() => setChatOpen(false)}
      />
    )}

    {/* Right: Summary + Chart */}
    <Box sx={{ flex: 1, minWidth: 0 }}>
      {/* Summary */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1">Overall Completion</Typography>
            <LinearProgress
              variant="determinate"
              value={dailyProgress?.overallCompletion || 0}
              sx={{ height: 10, borderRadius: 5, mb: 1 }}
            />
            <Typography variant="body2">{Math.round(dailyProgress?.overallCompletion || 0)}%</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle1">Target for Current Time</Typography>
            <Chip
              color="primary"
              label={`Expected: ${Math.round(getCurrentTimeTargetPct() * 100)}% of daily diet`}
            />
          </Box>
        </Stack>
      </Paper>

      {/* Save status */}
      <Stack direction="row" sx={{ mb: 1 }}>
        {saveStatus === 'saving' && <Chip icon={<CircularProgress size={16} />} label="Saving..." color="info" variant="outlined" />}
        {saveStatus === 'saved'  && <Chip label="All changes saved" color="success" variant="outlined" />}
        {saveStatus === 'error'  && <Chip label="Save failed" color="error" variant="outlined" />}
      </Stack>

      {/* Smart Suggestions */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>Smart Suggestions</Typography>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {getSmartSuggestions(nutrients).map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </Paper>

      {/* Chart */}
      {!loading && (
        <Paper sx={{ p: 2 }}>
          <ProgressChart nutrients={nutrients} />
        </Paper>
      )}
      {loading && <Typography>Loading...</Typography>}
    </Box>
  </Stack>

  {/* ── Sliders Modal ── */}
  <Dialog open={slidersOpen} onClose={() => setSlidersOpen(false)} maxWidth="sm" fullWidth>
    <DialogTitle>Edit Diet Entries</DialogTitle>
    <DialogContent>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {saveStatus === 'saving' && <Chip icon={<CircularProgress size={16} />} label="Saving..." color="info" variant="outlined" />}
        {saveStatus === 'saved'  && <Chip label="All changes saved" color="success" variant="outlined" />}
        {saveStatus === 'error'  && <Chip label="Save failed" color="error" variant="outlined" />}
      </Stack>
      {nutrients.map((nutrient) => (
        <Box key={nutrient.category} sx={{ mb: 2 }}>
          <NutrientSlider
            category={nutrient.category}
            amount={nutrient.amount}
            maxAmount={nutrient.required}
            unit={nutrient.unit}
            onChange={(value) => handleNutrientChange(nutrient.category, value)}
          />
        </Box>
      ))}
    </DialogContent>
    <DialogActions>
      <Button onClick={handleResetAll} color="secondary">Reset All</Button>
      <Button onClick={handleSaveAll} variant="contained">Save All</Button>
      <Button onClick={() => setSlidersOpen(false)}>Close</Button>
    </DialogActions>
  </Dialog>

  <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
    <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
  </Snackbar>
</>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd diet-tracker-react
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run the full app and visually verify**

```bash
npm run start
```

Open `http://localhost:5173` and verify:
- Main page shows summary + target + suggestions + chart (no sliders visible by default)
- "Edit Diet" button opens a modal with all sliders; changes save immediately and close button works
- 💬 (chat) button in nav bar toggles the left sidebar open/closed
- Chat sidebar: typing a message and pressing Enter (or clicking Send) sends it; assistant responds
- Try: "log 3 exchanges of cereal for today" — check that the completion % on the main page updates after the dialog closes

- [ ] **Step 6: Commit**

```bash
git add src/components/App.tsx
git commit -m "feat: chat sidebar left, sliders in modal, new layout"
```

---

## Task 7: Add OPENAI_API_KEY to Render dashboard

This is a manual step done in the Render web UI — not automated.

- [ ] **Step 1: Add the env var on Render**

1. Go to your Render dashboard → select the `iem-vibe` service
2. Click **Environment** in the left nav
3. Add: key = `OPENAI_API_KEY`, value = your key from platform.openai.com
4. Click **Save Changes** — Render will redeploy automatically

- [ ] **Step 2: Verify the deployed app**

Once the deploy completes, open the production URL and repeat the chat test:
- Toggle the chat sidebar open
- Send: "what's remaining for today?"
- Expected: assistant responds with remaining diet items

---

## Self-Review Notes

- All 4 OpenAI tools are implemented in `chatHandler.js` and match the spec ✓
- PA dietary constraints are in the system prompt ✓
- Chat history capped at last 20 messages ✓
- `OPENAI_API_KEY` missing → 503 (not a 500 crash) ✓
- Slider changes in modal still call `handleNutrientChange` → live DB writes ✓
- `formatDateLocal` is already defined at the bottom of App.tsx — `dateStr` computed from it ✓
- Mobile: `Stack direction={{ xs: 'column', md: 'row' }}` collapses chat above main content on small screens ✓
