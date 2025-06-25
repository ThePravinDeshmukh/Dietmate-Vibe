import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import multer from 'multer';
import PDFParser from 'pdf2json';
import webpush from 'web-push';

import path from 'path';
import { fileURLToPath } from 'url';
import { DAILY_REQUIREMENTS } from './shared/requirements.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Multer setup for PDF uploads
const upload = multer({ storage: multer.memoryStorage() });

// Global request logger for debugging
app.use((req, res, next) => {
  console.log('Received request:', req.method, req.url);
  next();
});

let db;

async function connectToMongoDB() {
  try {
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    db = client.db(process.env.MONGODB_DATABASE);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Helper to get start and end of day in IST (UTC+5:30)
function getISTDayRange(dateParam) {
  // dateParam: 'YYYY-MM-DD' in IST
  const [year, month, day] = dateParam.split('-').map(Number);
  // Start of day in IST
  const startIST = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  // End of day in IST
  const endIST = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  // Convert IST to UTC by subtracting 5.5 hours
  const startUTC = new Date(startIST.getTime() - (5.5 * 60 * 60 * 1000));
  const endUTC = new Date(endIST.getTime() - (5.5 * 60 * 60 * 1000));
  return { startUTC, endUTC };
}

// --- LAB REPORTS API (pdf2json version) ---
// Upload PDF, extract parameters, and store in MongoDB
app.post('/api/lab-reports/upload', upload.single('file'), async (req, res) => {
    try {
        const { date } = req.body;
        let parametersToExtract = [];
        // Assuming parametersToExtract now contains just the names like ["Total Carnitine", "Glycine"]
        if (req.body.parameters) {
            try {
                parametersToExtract = JSON.parse(req.body.parameters);
            } catch (e) {
                parametersToExtract = [];
            }
        }
        if (!req.file || !date || !parametersToExtract.length) return res.status(400).json({ error: 'Missing file, date, or parameters to extract' });

        const pdfParser = new PDFParser();
        pdfParser.parseBuffer(req.file.buffer);

        pdfParser.on('pdfParser_dataError', errData => {
            res.status(500).json({ error: errData.parserError });
        });

        pdfParser.on('pdfParser_dataReady', async pdfData => {
            let pages = null;
            if (pdfData.formImage && Array.isArray(pdfData.formImage.Pages)) {
                pages = pdfData.formImage.Pages;
            } else if (Array.isArray(pdfData.Pages)) {
                pages = pdfData.Pages;
            }

            if (!pages) {
                return res.status(400).json({ error: 'Could not extract text from PDF. The file may be encrypted, malformed, or unsupported.' });
            }

            // Extract text from all pages
            const text = pages.map(page =>
                page.Texts.map(t => decodeURIComponent(t.R.map(r => r.T).join(''))).join(' ')
            ).join('\n');

            const result = {};

            parametersToExtract.forEach(param => {
                // This regex is still for "param: value (Normal: range)" format
                // If you only want the value, the regex can be simpler, but this one still works by capturing just the value.
                const regex = new RegExp(`${param.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}[:\\s]+([0-9.]+)(?:[^\\d\\n]*Normal[:\\s]*([0-9.\\-–]+))?`, 'i');
                const match = text.match(regex);

                if (match) {
                    // Store only the value
                    result[param] = match[1]; // match[1] is the captured value
                } else {
                    // If not found, store null
                    result[param] = null;
                }
            });

            // Upsert: replace if date+fileName exists, otherwise insert new
            await db.collection('lab_reports').updateOne(
                { date, fileName: req.file.originalname },
                {
                    $set: {
                        parameters: result, // result now contains only parameter names and their values
                        uploadedAt: new Date(),
                    }
                },
                { upsert: true }
            );

            res.json({ success: true, parameters: result });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all unique parameters
app.get('/api/lab-reports/parameters', async (req, res) => {
  try {
    const docs = await db.collection('lab_reports').find({}).toArray();
    const paramSet = new Set();
    docs.forEach(doc => {
      if (doc.parameters) Object.keys(doc.parameters).forEach(p => paramSet.add(p));
    });
    res.json(Array.from(paramSet));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trend data for selected parameters
app.get('/api/lab-reports/trends', async (req, res) => {
  try {
    const params = (req.query.params || '').split(',').map(p => p.trim()).filter(Boolean);
    if (!params.length) return res.json({ dates: [], });
    const docs = await db.collection('lab_reports').find({}).sort({ date: 1 }).toArray();
    const dates = docs.map(doc => doc.date);
    const result = { dates };
    params.forEach(param => {
      result[param] = docs.map(doc => doc.parameters ? doc.parameters[param] ?? null : null);
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get entries for a specific date (or today if not provided), always query by IST day
app.get('/api/entries', async (req, res) => {
  try {
    const dateParam = req.query.date || new Date().toISOString().split('T')[0];
    console.log('Querying for date (IST):', dateParam);
    const { startUTC, endUTC } = getISTDayRange(dateParam);
    const entries = await db.collection('diet_entries').find({
      date: { $gte: startUTC, $lte: endUTC }
    }).toArray();
    console.log(`Found ${entries.length} entries for date (IST): ${dateParam}`);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update or create entry for a specific date (in IST)
app.post('/api/entries', async (req, res) => {
  try {
    const { category, amount, date } = req.body;
    // Use provided date or default to today (in IST)
    const dateParam = date || new Date().toISOString().split('T')[0];
    // Always treat dateParam as 'YYYY-MM-DD' in IST
    const [year, month, day] = typeof dateParam === 'string' ? dateParam.split('-').map(Number) : [dateParam.getFullYear(), dateParam.getMonth() + 1, dateParam.getDate()];
    // Start of day in IST
    const startIST = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    // Convert IST to UTC by subtracting 5.5 hours
    const entryDate = new Date(startIST.getTime() - (5.5 * 60 * 60 * 1000));

    await db.collection('diet_entries').updateOne(
      { date: entryDate, category },
      {
        $set: {
          amount,
          unit: 'exchange',
          date: entryDate,
        }
      },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch update or create entries for a specific date
app.post('/api/entries/batch', async (req, res) => {
  try {
    const { date, entries } = req.body;
    if (!date || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'Missing date or entries array' });
    }
    // Always treat date as 'YYYY-MM-DD' in IST
    const [year, month, day] = date.split('-').map(Number);
    const startIST = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const entryDate = new Date(startIST.getTime() - (5.5 * 60 * 60 * 1000));
    const bulkOps = entries.map(entry => ({
      updateOne: {
        filter: { date: entryDate, category: entry.category },
        update: {
          $set: {
            amount: entry.amount,
            unit: entry.unit,
            date: entryDate,
          }
        },
        upsert: true
      }
    }));
    if (bulkOps.length > 0) {
      await db.collection('diet_entries').bulkWrite(bulkOps);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get history data: overall completion percent for each day in a date range
app.get('/api/history', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Missing start or end date' });
    }
    // Parse dates as IST
    const [startY, startM, startD] = start.split('-').map(Number);
    const [endY, endM, endD] = end.split('-').map(Number);
    const startIST = new Date(Date.UTC(startY, startM - 1, startD, 0, 0, 0));
    const endIST = new Date(Date.UTC(endY, endM - 1, endD, 23, 59, 59, 999));
    const startUTC = new Date(startIST.getTime() - (5.5 * 60 * 60 * 1000));
    const endUTC = new Date(endIST.getTime() - (5.5 * 60 * 60 * 1000));

    // Use shared requirements
    const reqMap = {};
    let totalRequired = 0;
    DAILY_REQUIREMENTS.forEach(r => {
      reqMap[r.category] = Number(r.amount) || 0;
      totalRequired += Number(r.amount) || 0;
    });
    if (totalRequired === 0) totalRequired = 1;

    // Query all entries in range
    const entries = await db.collection('diet_entries').find({
      date: { $gte: startUTC, $lte: endUTC }
    }).toArray();

    // Group by date (IST)
    const byDate = {};
    entries.forEach(e => {
      // Convert UTC date to IST date string
      const utc = new Date(e.date);
      const ist = new Date(utc.getTime() + (5.5 * 60 * 60 * 1000));
      const dstr = ist.toISOString().slice(0, 10);
      if (!byDate[dstr]) byDate[dstr] = [];
      byDate[dstr].push(e);
    });

    // For each day in range, calculate percent
    const results = [];
    let cur = new Date(startIST);
    while (cur <= endIST) {
      const dstr = cur.toISOString().slice(0, 10);
      const entriesForDay = byDate[dstr] || [];
      // Map category to amount for this day
      const catMap = {};
      entriesForDay.forEach(e => { catMap[e.category] = Number(e.amount) || 0; });
      // For each required category, compute capped percent
      const perCategoryPercents = DAILY_REQUIREMENTS.map(req => {
        const amt = catMap[req.category] || 0;
        const reqAmt = Number(req.amount) || 1;
        return Math.min((amt / reqAmt) * 100, 100);
      });
      const percent = Math.round(perCategoryPercents.reduce((a, b) => a + b, 0) / perCategoryPercents.length);
      results.push({ date: dstr, overallCompletion: percent });
      cur.setDate(cur.getDate() + 1);
    }
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all entries without date filter
app.get('/api/entries/all', async (req, res) => {
  try {
    const entries = await db.collection('diet_entries').find({}).toArray();
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all entries for a date range, grouped by IST date and category
app.get('/api/entries/batch/:start/:end', async (req, res) => {
  try {
    const { start, end } = req.params;
    if (!start || !end) {
      return res.status(400).json({ error: 'Missing start or end date' });
    }
    // Parse dates as IST
    const [startY, startM, startD] = start.split('-').map(Number);
    const [endY, endM, endD] = end.split('-').map(Number);
    const startIST = new Date(Date.UTC(startY, startM - 1, startD, 0, 0, 0));
    const endIST = new Date(Date.UTC(endY, endM - 1, endD, 23, 59, 59, 999));
    const startUTC = new Date(startIST.getTime() - (5.5 * 60 * 60 * 1000));
    const endUTC = new Date(endIST.getTime() - (5.5 * 60 * 60 * 1000));

    // Query all entries in range
    const entries = await db.collection('diet_entries').find({
      date: { $gte: startUTC, $lte: endUTC }
    }).toArray();

    // Group by IST date string
    const byDate = {};
    entries.forEach(e => {
      const utc = new Date(e.date);
      const ist = new Date(utc.getTime() + (5.5 * 60 * 60 * 1000));
      const dstr = ist.toISOString().slice(0, 10);
      if (!byDate[dstr]) byDate[dstr] = [];
      byDate[dstr].push(e);
    });

    // For each day in range, ensure all categories are present (fill missing with null)
    const result = {};
    let cur = new Date(startIST);
    while (cur <= endIST) {
      const dstr = cur.toISOString().slice(0, 10);
      const entriesForDay = byDate[dstr] || [];
      // Map by category for fast lookup
      const catMap = {};
      entriesForDay.forEach(e => { catMap[e.category] = e; });
      // For each required category, fill in value or null
      result[dstr] = DAILY_REQUIREMENTS.map(req => {
        const entry = catMap[req.category];
        return entry ? {
          category: req.category,
          amount: entry.amount,
          unit: entry.unit
        } : {
          category: req.category,
          amount: null,
          unit: req.unit
        };
      });
      cur.setDate(cur.getDate() + 1);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Ping endpoint for health check ---
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok' });
});

// --- Remind missing diet entries for yesterday (single user, WhatsApp placeholder) ---
app.post('/api/remind-missing-diet', async (req, res) => {
  try {
    // Hardcoded user phone number (WhatsApp)
    const userPhone = '+911234567890'; // Change to your number
    // Get yesterday's date in IST
    const now = new Date();
    const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    istNow.setDate(istNow.getDate() - 1); // yesterday
    const y = istNow.getFullYear();
    const m = String(istNow.getMonth() + 1).padStart(2, '0');
    const d = String(istNow.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const { startUTC, endUTC } = getISTDayRange(dateStr);
    // Query all entries for yesterday
    const entries = await db.collection('diet_entries').find({ date: { $gte: startUTC, $lte: endUTC } }).toArray();
    // Map by category
    const catMap = {};
    entries.forEach(e => { catMap[e.category] = Number(e.amount) || 0; });
    // Find missing/incomplete categories
    const missing = DAILY_REQUIREMENTS.filter(req => {
      const amt = catMap[req.category] || 0;
      return amt < req.amount;
    });
    if (missing.length > 0) {
      // Placeholder for WhatsApp send
      const missingList = missing.map(m => `${m.category} (${catMap[m.category] || 0}/${m.amount} ${m.unit})`).join(', ');
      const message = `Reminder: You have not completed your diet entries for yesterday (${dateStr}). Missing or incomplete: ${missingList}`;
      console.log(`[WhatsApp] To: ${userPhone} | Message: ${message}`);
      // Send push notification
      await sendPushToAll({
        title: 'Diet Reminder',
        body: message
      });
      res.json({ success: true, sent: true, message });
    } else {
      res.json({ success: true, sent: false, message: 'All entries complete for yesterday.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Web Push Setup ---
webpush.setVapidDetails(
  'mailto:your@email.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
let pushSubscriptions = [];


app.get('/api/vapid-public-key', (req, res) => {
  res.send(process.env.VAPID_PUBLIC_KEY);
});

app.post('/api/save-subscription', (req, res) => {
  pushSubscriptions.push(req.body);
  res.json({ success: true });
});

// Helper to send push notification to all subscribers
async function sendPushToAll(payload) {
  for (const sub of pushSubscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (e) {
      // Remove invalid subscriptions in production
      console.error('Push error:', e);
    }
  }
}

connectToMongoDB().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
});


