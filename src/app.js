const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const summariesRouter = require('./routes/summaries');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/uploads', express.static(path.resolve(config.uploadDir)));
app.use('/summaries', summariesRouter);

app.use((err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({
    message: 'Internal server error.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

module.exports = app;
