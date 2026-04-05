import { GoogleGenerativeAI } from '@google/generative-ai';
import { DAILY_REQUIREMENTS } from './shared/requirements.js';
import { FOOD_EXCHANGES } from './shared/foodExchanges.js';


// ── Tool definitions ──────────────────────────────────────────────────────────

const functionDeclarations = [
  {
    name: 'get_diet_entries',
    description: 'Get all diet entries logged for a specific date',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'Date in YYYY-MM-DD format (IST)' }
      },
      required: ['date']
    }
  },
  {
    name: 'update_diet_entry',
    description: 'Set the logged amount for a diet category on a specific date. Amount replaces the current value (it is not additive).',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'Food category name, e.g. "cereal", "legumes", "soy milk"' },
        amount: { type: 'NUMBER', description: 'Amount to set (not add). Must be >= 0.' },
        date: { type: 'STRING', description: 'Date in YYYY-MM-DD format (IST)' }
      },
      required: ['category', 'amount', 'date']
    }
  },
  {
    name: 'get_remaining_diet',
    description: 'Get remaining diet requirements for a specific date',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'Date in YYYY-MM-DD format (IST)' }
      },
      required: ['date']
    }
  },
  {
    name: 'get_diet_history',
    description: 'Get daily overall completion percentages for a date range',
    parameters: {
      type: 'OBJECT',
      properties: {
        start: { type: 'STRING', description: 'Start date YYYY-MM-DD (IST)' },
        end:   { type: 'STRING', description: 'End date YYYY-MM-DD (IST)' }
      },
      required: ['start', 'end']
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
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const m of milestones) {
    if (mins < m.hour * 60 + m.minute) return m.pct;
  }
  return 1.0;
}

function buildFoodExchangeList() {
  return Object.entries(FOOD_EXCHANGES)
    .map(([category, items]) => {
      const itemList = items
        .map(i => `${i.name} (${i.gramsPerExchange}${i.unit || 'g'}/exchange)`)
        .join(', ');
      return `${category}: ${itemList}`;
    })
    .join('\n');
}

export function buildSystemPrompt() {
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

TEXTURE & SWALLOWING CONSTRAINTS (critical — child has swallowing difficulty and is prone to vomiting):
- Food must be thin, smooth, or semi-liquid — easy to gulp without chewing effort
- Avoid thick, sticky, dense, or dry textures: thick porridge, dry rotis, sticky rice, raw hard fruits/vegetables
- Prefer: thin rice kanji, diluted khichdi, thin dal, mashed vegetables with water, thin fruit purees, juices, soups
- Cooked/softened forms are always preferred over raw: soft-cooked rice over raw, pureed fruit over whole fruit
- When suggesting food items from the exchange list, default to their cooked/softened/pureed form
- Never suggest foods that require significant chewing or that clump together in the mouth

DAILY REQUIREMENTS:
${reqList}

CURRENT DATE: ${dateStr} (IST)
CURRENT TIME TARGET: ${targetPct}% of daily diet should be completed by now

FOOD EXCHANGE DATA (grams per 1 exchange, from dietitian charts):
${buildFoodExchangeList()}

Rules:
- When recording diet, confirm what was logged and show remaining amount for that category.
- When suggesting remaining diet or recipes, ALWAYS use the food exchange data above. Calculate actual grams: grams = exchanges_remaining × grams_per_exchange. List 3-5 practical food options per category with their weight in grams. Example: "5 cereal exchanges = Rice 36.5g OR Pohe 43.5g OR Ragi 43.5g OR Jowar 39g".
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

export async function listModels(_req, res) {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
  }
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const models = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini'))
      .map(m => ({ id: m.name.replace('models/', ''), displayName: m.displayName || m.name.replace('models/', '') }));
    res.json({ models });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
}

export async function handleChat(req, res, db) {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Chat assistant unavailable: GEMINI_API_KEY not configured' });
  }

  if (!db) {
    return res.status(503).json({ error: 'Database not ready, please try again' });
  }

  const { message, date, model: requestedModel } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const today = date || new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const selectedModel = typeof requestedModel === 'string' && requestedModel ? requestedModel : 'gemini-flash-lite-latest';

  // Load last 20 messages from chat_history as Gemini history format
  let history = [];
  try {
    const docs = await db.collection('chat_history')
      .find({ sessionDate: today })
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();
    history = docs.reverse().map(d => ({
      role: d.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: d.content }]
    }));
    // Gemini requires history to start with 'user'
    while (history.length > 0 && history[0].role !== 'user') history.shift();
  } catch (_) {
    // fall through with empty history
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: selectedModel,
      tools: [{ functionDeclarations }],
      systemInstruction: buildSystemPrompt()
    });

    const chat = model.startChat({ history });
    let result = await chat.sendMessage(message);

    // Function calling loop (max 5 rounds)
    for (let round = 0; round < 5 && result.response.functionCalls()?.length; round++) {
      const calls = result.response.functionCalls();
      const responses = await Promise.all(
        calls.map(async (call) => {
          let response;
          try {
            response = await executeTool(call.name, call.args, db);
          } catch (e) {
            response = { error: e.message };
          }
          const payload = Array.isArray(response) ? { items: response } : response;
          return { functionResponse: { name: call.name, response: payload } };
        })
      );
      result = await chat.sendMessage(responses);
    }

    const reply = result.response.text() || 'Done.';

    // Save user + assistant messages to chat_history (non-fatal if fails)
    try {
      const userTs = new Date();
      const assistantTs = new Date(userTs.getTime() + 1);
      await db.collection('chat_history').insertMany([
        { role: 'user',      content: message, sessionDate: today, timestamp: userTs },
        { role: 'assistant', content: reply,   sessionDate: today, timestamp: assistantTs }
      ]);
    } catch (_) {}

    res.json({ reply });
  } catch (e) {
    console.error('Gemini error:', e.message);
    res.status(503).json({ error: 'Assistant unavailable, please try again' });
  }
}
