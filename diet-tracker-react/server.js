import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

import path from 'path';
import { fileURLToPath } from 'url';


dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

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

    // Get requirements for all categories
    const requirementsArr = await db.collection('diet_requirements').find({}).toArray();
    const reqMap = {};
    let totalRequired = 0;
    requirementsArr.forEach(r => {
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
      // Get IST date string
      const dstr = cur.toISOString().slice(0, 10);
      const entriesForDay = byDate[dstr] || [];
      let total = 0;
      entriesForDay.forEach(e => {
        const cat = e.category;
        const amt = Number(e.amount) || 0;
        const req = reqMap[cat] || 0;
        total += Math.min(amt, req);
      });
      const percent = Math.round((total / totalRequired) * 100);
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

// Serve static files from the dist directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback (must be last route)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

connectToMongoDB().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
});


