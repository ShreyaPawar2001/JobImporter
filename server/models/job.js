const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  runIds: [String],
  externalId: { type: String, index: true, required: true, unique: true },
  title: String,
  company: String,
  location: String,
  description: String,
  raw: Object
}, { timestamps: true });

module.exports = mongoose.model('Job', JobSchema);
