
const mongoose = require('mongoose');

const importLogSchema = new mongoose.Schema({
  runId: { type: String, required: true, index: true, unique: true },
  fileName: String,
  importDateTime: { type: Date, default: Date.now },
  totalFetched: { type: Number, default: 0 },
  totalImported: { type: Number, default: 0 },
  newJobs: { type: Number, default: 0 },
  updatedJobs: { type: Number, default: 0 },
  failedJobsCount: { type: Number, default: 0 },
  failedJobs: { type: Array, default: [] },
}, { timestamps: true });

module.exports = mongoose.models.ImportLog || mongoose.model('ImportLog', importLogSchema);
