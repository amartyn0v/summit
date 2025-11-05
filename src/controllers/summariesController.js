const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../../config/env');
const { createSummary, getSummaryById, listSummaries } = require('../database');
const TelegramService = require('../services/telegram');
const { buildSummaryMessage } = require('../utils/telegramFormatter');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(config.uploadDir)) {
      fs.mkdirSync(config.uploadDir, { recursive: true });
    }
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${timestamp}-${safeOriginal}`);
  },
});

const upload = multer({ storage });

const mapSummaryRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    sourceUrl: row.source_url,
    filePath: row.file_path,
    createdAt: row.created_at,
  };
};

const handleCreateSummary = async (req, res, next) => {
  try {
    const { title, summary, sourceUrl } = req.body;
    if (!title || !summary) {
      return res.status(400).json({ message: 'Fields "title" and "summary" are required.' });
    }

    const filePath = req.file ? path.relative(process.cwd(), req.file.path) : null;

    const created = await createSummary({
      title,
      summary,
      sourceUrl,
      filePath,
    });

    res.status(201).json({
      message: 'Summary created successfully.',
      summary: mapSummaryRow(created),
    });
  } catch (error) {
    next(error);
  }
};

const handleListSummaries = async (req, res, next) => {
  try {
    const summaries = await listSummaries();
    res.json({ summaries: summaries.map(mapSummaryRow) });
  } catch (error) {
    next(error);
  }
};

const handleGetSummary = async (req, res, next) => {
  try {
    const summary = await getSummaryById(req.params.id);
    if (!summary) {
      return res.status(404).json({ message: 'Summary not found.' });
    }
    res.json({ summary: mapSummaryRow(summary) });
  } catch (error) {
    next(error);
  }
};

const handleSendToTelegram = async (req, res, next) => {
  try {
    const summary = await getSummaryById(req.params.id);
    if (!summary) {
      return res.status(404).json({ message: 'Summary not found.' });
    }

    const telegram = new TelegramService();
    const formatted = mapSummaryRow(summary);
    const text = buildSummaryMessage(formatted);
    const response = await telegram.sendMessage({ text });

    res.json({
      message: telegram.dryRun
        ? 'Dry run: message was not sent to Telegram. See payload for details.'
        : 'Summary was sent to Telegram successfully.',
      summary: formatted,
      telegram: response,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upload,
  handleCreateSummary,
  handleListSummaries,
  handleGetSummary,
  handleSendToTelegram,
};
