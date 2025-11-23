const Queue = require('bull');
const dotenv = require('dotenv');
dotenv.config();

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
  }
};

const queueName = process.env.QUEUE_NAME || 'job_import_queue';
const jobQueue = new Queue(queueName, redisConfig);

module.exports = jobQueue;
