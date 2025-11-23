// server/index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('./db');
const jobQueue = require('./queue');
const { fetchFeed, normalizeItem } = require('./fetcher');
const ImportLog = require('./models/importLog');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json()); // ensure body parsing for POST

const FEEDS = (process.env.FEEDS || 'https://jobicy.com/?feed=job_feed,https://www.higheredjobs.com/rss/articleFeed.cfm')
  .split(',').map(s => s.trim()).filter(Boolean);

app.get('/api/status', (req, res) => res.json({ message: 'Backend is running!' }));

// GET import-logs (paginated)
app.get('/debug/import-log/:runId', async (req, res) => {
  const doc = await ImportLog.findOne({ runId: req.params.runId });
  res.json(doc || {});
});

// Replace existing GET /api/import-logs with this:
app.get('/api/import-logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.max(1, parseInt(req.query.pageSize || '50', 10));
    const skip = (page - 1) * pageSize;

    const items = await ImportLog.find().sort({ importDateTime: -1 }).skip(skip).limit(pageSize);
    const total = await ImportLog.countDocuments();

    // send the same shape your frontend expects
    return res.json({ items, page, pageSize, total });
  } catch (err) {
    // log full stack to server console for debugging
    console.error('GET /api/import-logs error:', err && (err.stack || err));

    // return a safe payload so the UI does not crash (temporary)
    return res.status(200).json({
      items: [],
      page: 1,
      pageSize: parseInt(req.query.pageSize || '50', 10),
      total: 0,
      _error: String(err.message || err) // optional field so client can show the error message
    });
  }
});



async function triggerImportHandler(req, res) {
  try {
    // Support multiple input methods
    let feeds;
    if (req.method === 'POST' && req.body && Array.isArray(req.body.feeds)) {
      feeds = req.body.feeds;
    } else if (req.query && req.query.feeds) {
      // allow ?feeds=url1,url2
      feeds = String(req.query.feeds).split(',').map(s => s.trim()).filter(Boolean);
    } else {
      feeds = FEEDS;
    }

    if (!feeds || feeds.length === 0) {
      return res.status(400).json({ error: 'No feeds configured' });
    }

    const runId = uuidv4();
    await ImportLog.create({ runId, fileName: 'multiple', totalFetched: 0 });

    const results = [];
    for (const feedUrl of feeds) {
      try {
        const items = await fetchFeed(feedUrl);
        const normalized = items.map(normalizeItem);
        // enqueue each item (with basic retry / backoff)
        for (const it of normalized) {
          await jobQueue.add(
            { runId, feedUrl, item: it },
            { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
          );
        }
        // increment totalFetched
        await ImportLog.updateOne({ runId }, { $inc: { totalFetched: normalized.length }});
        results.push({ feedUrl, fetched: normalized.length });
      } catch (e) {
        console.error('fetch error', feedUrl, e?.message || e);
        results.push({ feedUrl, error: e?.message || String(e) });
      }
    }

    return res.json({ runId, results });
  } catch (err) {
    console.error('triggerImportHandler error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

// Register routes using the same handler
app.post('/api/trigger-import', triggerImportHandler);
app.get('/api/trigger-import', triggerImportHandler);

const start = async () => {
  await connectDB();
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`Server listening on ${port}`));

  // cron hourly at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      const runId = uuidv4();
      await ImportLog.create({ runId, fileName: 'multiple', totalFetched: 0 });
      for (const feedUrl of FEEDS) {
        try {
          const items = await fetchFeed(feedUrl);
          const normalized = items.map(normalizeItem);
          for (const it of normalized) {
            await jobQueue.add({ runId, feedUrl, item: it });
          }
          await ImportLog.updateOne({ runId }, { $inc: { totalFetched: normalized.length }});
          console.log(`Enqueued ${normalized.length} from ${feedUrl} for run ${runId}`);
        } catch (e) {
          console.error('cron fetch error', feedUrl, e?.message || e);
        }
      }
    } catch (e) {
      console.error('Cron import error', e?.message || e);
    }
  });
};

start();
