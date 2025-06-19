import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

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
  const [year, month, day] = dateParam.split('-').map(Number);
  // JS months are 0-based
  // Create a UTC date for the start of the day in IST
  const startUTC = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - (5.5 * 60 * 60 * 1000);
  const endUTC = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - (5.5 * 60 * 60 * 1000);
  return {
    startIST: new Date(startUTC),
    endIST: new Date(endUTC)
  };
}

// Get entries for a specific date (or today if not provided), always query by IST day
app.get('/api/entries', async (req, res) => {
  try {
    const dateParam = req.query.date || new Date().toISOString().split('T')[0];
    console.log('Querying for date (IST):', dateParam);
    const { startIST, endIST } = getISTDayRange(dateParam);
    const entries = await db.collection('daily_entries').find({
      date: { $gte: startIST, $lte: endIST }
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
    const dateParam = date || new Date();
    const dateObj = typeof dateParam === 'string' ? new Date(dateParam) : dateParam;
    // Set to IST start of day
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(dateObj.getTime() + istOffset);
    const entryDate = new Date(istDate.getFullYear(), istDate.getMonth(), istDate.getDate(), 0, 0, 0, 0);

    await db.collection('daily_entries').updateOne(
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
    const bulkOps = entries.map(entry => ({
      updateOne: {
        filter: { date, category: entry.category },
        update: {
          $set: {
            amount: entry.amount,
            unit: entry.unit,
            date,
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

// Get history data
app.get('/api/history', async (req, res) => {
  try {
    const history = await db.collection('diet_entries')
      .find({})
      .sort({ date: -1 })
      .limit(7)
      .toArray();
    res.json(history);
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

connectToMongoDB().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
});
