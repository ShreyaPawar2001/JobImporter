
const dotenv = require('dotenv');
dotenv.config();

const Queue = require('bull');
const connectDB = require('./db');
const Job = require('./models/job');
const ImportLog = require('./models/importLog');

const queueName = process.env.QUEUE_NAME || 'job_import_queue';
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

const jobQueue = new Queue(queueName, {
  redis: {
    host: redisHost,
    port: redisPort,
    // safe defaults; adjust if needed
    maxRetriesPerRequest: 10,
    connectTimeout: 10000
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  }
});

async function start() {
  await connectDB();
  console.log('Worker: connected to MongoDB');

  const concurrency = parseInt(process.env.CONCURRENCY || '5', 10);
  console.log(`Worker: starting with concurrency=${concurrency}`);

  jobQueue.process(concurrency, async (job) => {
    const { runId, feedUrl, item } = job.data || {};
    if (!runId || !item || !item.externalId) {
      // invalid payload
      const reason = 'Invalid job payload (missing runId or item.externalId)';
      console.error('Worker:', reason, job.id);
      if (runId) {
        await ImportLog.updateOne(
          { runId },
          { $inc: { failedJobsCount: 1 }, $push: { failedJobs: { item, reason } } }
        );
      }
      throw new Error(reason);
    }

    try {
      // Try to create a new job document (fast path)
      await Job.create({
        externalId: item.externalId,
        title: item.title,
        company: item.company,
        location: item.location,
        description: item.description,
        raw: item.raw,
        runIds: [runId]
      });

      // created successfully
      await ImportLog.updateOne({ runId }, { $inc: { newJobs: 1, totalImported: 1 } });
      console.log(`Worker: created job ${item.externalId} run=${runId}`);
      return { status: 'created' };

    } catch (err) {
      // Duplicate key? then it's an update scenario.
      const isDup = err && (err.code === 11000 || (err.message && err.message.includes('duplicate key')));
      if (isDup) {
        try {
          await Job.updateOne(
            { externalId: item.externalId },
            {
              $set: {
                title: item.title,
                company: item.company,
                location: item.location,
                description: item.description,
                raw: item.raw
              },
              $addToSet: { runIds: runId }
            }
          );

          await ImportLog.updateOne({ runId }, { $inc: { updatedJobs: 1, totalImported: 1 } });
          console.log(`Worker: updated job ${item.externalId} run=${runId}`);
          return { status: 'updated' };

        } catch (updateErr) {
          console.error('Worker: updateErr', updateErr);
          await ImportLog.updateOne(
            { runId },
            { $inc: { failedJobsCount: 1 }, $push: { failedJobs: { item, reason: String(updateErr.message || updateErr) } } }
          );
          throw updateErr;
        }
      }

      // other errors (validation, mongo down, etc.)
      console.error('Worker: createErr', err);
      await ImportLog.updateOne(
        { runId },
        { $inc: { failedJobsCount: 1 }, $push: { failedJobs: { item, reason: String(err.message || err) } } }
      );
      throw err;
    }
  });

  jobQueue.on('error', e => console.error('[queue][error]', e && e.message ? e.message : e));
  jobQueue.on('failed', (job, err) => console.warn(`[queue] job failed ${job.id}`, err && err.message ? err.message : err));
  jobQueue.on('completed', job => console.log(`[queue] job completed ${job.id}`));
}

start().catch(e => {
  console.error('Worker startup failed', e && e.stack ? e.stack : e);
  process.exit(1);
});
