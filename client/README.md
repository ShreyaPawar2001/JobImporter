Architecture Overview — Job Importer System

This document describes the complete architecture, design decisions, workflow, and scalability considerations for the Job Importer System built using:

Node.js + Express (Backend API)

Redis + Bull Queue (Background processing)

MongoDB (Job + ImportLog storage)

Next.js (Admin UI)

Worker Process (Consumes queue jobs)

Cron Jobs (Automated import every hour)

**1. High-Level System Design**
External XML Job Feeds
        │
        ▼
   fetcher.js (XML → JSON)
        │
        ▼
 Normalize Job Model
        │
        ▼
  Add each job → Redis Queue (BullMQ)
        │
        ▼
 Worker Process (Concurrent)
        │
        ├── Insert New Job into MongoDB
        ├── Update Existing Job
        └── Capture Failed Jobs
        │
        ▼
Write results → import_logs
        │
        ▼
Admin UI (Next.js) reads logs from backend


**2. Components**
2.1 Backend (Express Server)

Handles:

XML feed ingest routes

Trigger import (/api/trigger-import)

Logs listing (/api/import-logs)

Creates runId

Logs initial import metadata

Adds normalized jobs to Redis queue

Cron job (every hour fetch new jobs)

**Key Files**

File	:Responsibility
index.js	:REST APIs + trigger import logic + cron
fetcher.js	:Fetch and convert XML → JSON
queue.js	:Redis queue initializer
worker.js	:Queue consumer
models/job.js	:Job database model
models/importLog.js	:Import log model
**3. Queue System (Redis + Bull)**

Bull is used to process each job asynchronously.

Why Bull?

Built-in retry logic

Exponential backoff

Concurrency support

Event-based worker callbacks

Good production stability

Queue Flow

Server fetches all jobs from an XML feed

Each job is normalized

Each normalized job is queued:

jobQueue.add({ runId, feedUrl, item }, { attempts: 3, backoff: {...} })


Worker consumes them with concurrency (default: 5–10)

Worker updates ImportLog once complete
**4. Worker Process Architecture**

The worker:

Extracts job data

Checks if job exists (using externalId)

If not exists → insert (count as newJobs)

If exists → update (count as updatedJobs)

On error → push into failedJobs

Increment counters inside ImportLog

**Pseudo-flow:**

on JobReceived:
    if job exists:
        update job
        importLog.updatedJobs++
    else:
        insert job
        importLog.newJobs++

if error:
    importLog.failedJobs.push(error)

**5. Database Models**
Job Model

Stores:

externalId

title

company

location

description

raw XML converted JSON

runIds (history)

ImportLog Model

Stores all summary counters:

**Field**	**Purpose**
runId :	ID for each import session
fileName	:Feed name (multiple or URL)
totalFetched :	Jobs retrieved from XML
newJobs :	Inserted
updatedJobs :	Modified
failedJobs :	Array of failed items
failedJobsCount :	Count
importDateTime :	Timestamp

**6. Cron Job Scheduler**

Runs every hour (minute = 0):

0 * * * *


Tasks:

Generate runId

Fetch jobs

Queue them

Log summary

**7. Next.js Admin UI**

Located at:

/client/pages/index.js


**Shows:**

File name

Timestamp

Total fetched

New jobs

Updated jobs

Failed jobs

Modal view for failure list

Pagination

UI hits backend:

GET /api/import-logs
POST /api/trigger-import

**8. Error Handling Strategy Covered cases:**

XML parsing failure

Timeout fetching feeds

Invalid data format

Mongo insert/update failure

Worker-level runtime errors

Redis connection issues

Fixes:

Try/catch everywhere

Worker retries (3 attempts + exponential backoff)

Failed job logged inside ImportLog

Clear error messages on UI

**9. Scalability Considerations Horizontally Scalable**

Because:

Queue decouples “fetching jobs” from “processing jobs”

Worker processes can autoscale (multiple machines)

MongoDB handles upserts efficiently

Configurable:

Concurrency

Retry attempts

Cron frequency

Feed URLs

Batch size
**10. Deployment Plan Recommended:**

Frontend (Next.js) → Vercel
Backend + Worker → Render.com
MongoDB → MongoDB Atlas
Redis → Redis Cloud (Free tier)

**11. Assumptions**

XML feeds differ in structure → we built flexible parsing logic

Jobicy feed always returns 50 items max

Some feeds may return 0 data during downtime

Windows systems use Memurai instead of Redis

 **12. Future Enhancements**
Feature	Benefit
WebSockets / SSE	Real-time progress in UI
Retry dashboard	Requeue failed tasks
Batch group processing	Faster queue push
Feed health monitoring	Alert when feed is down
Microservices	Split worker + server


***Setup Instructions***
**Clone the repository**
git clone <your-public-github-url>
cd job-importer

**Backend Setup (/server)**
Install dependencies
cd server
npm install

Create .env file inside /server
PORT=3001
MONGO_URI=YOUR_MONGODB_ATLAS_URL
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
QUEUE_NAME=job_import_queue
CONCURRENCY=5
FEEDS=https://jobicy.com/?feed=job_feed,https://www.higheredjobs.com/rss/articleFeed.cfm

Start backend API
npm start

Start the worker (must run in separate terminal)
node worker.js

**Redis Setup (Required)**
Option A — Windows users (recommended)

Use Memurai (Redis alternative):

https://www.memurai.com/download

After installation Redis runs automatically on port 6379.


 **Frontend Setup (/client)**
Install frontend dependencies
cd client
npm install

Start the UI
npm run dev


The UI will open at:

 http://localhost:3000