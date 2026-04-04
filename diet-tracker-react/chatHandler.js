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
      description: 'Get remaining diet requirements for a specific date',
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
