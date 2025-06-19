import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { db } = await connectToDatabase();
      const today = new Date().toISOString().split('T')[0];
      const entries = await db.collection('diet_entries')
        .find({ date: today })
        .toArray();
      
      res.status(200).json(entries);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch entries' });
    }
  } else if (req.method === 'POST') {
    try {
      const { db } = await connectToDatabase();
      const { category, amount } = req.body;
      const today = new Date().toISOString().split('T')[0];

      await db.collection('diet_entries').updateOne(
        { date: today, category },
        { 
          $set: { 
            amount,
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      );
      
      res.status(200).json({ message: 'Entry updated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update entry' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
