const express = require('express');
const {
  upload,
  handleCreateSummary,
  handleListSummaries,
  handleGetSummary,
  handleSendToTelegram,
} = require('../controllers/summariesController');

const router = express.Router();

router.get('/', handleListSummaries);
router.get('/:id', handleGetSummary);
router.post('/', upload.single('file'), handleCreateSummary);
router.post('/:id/send-telegram', handleSendToTelegram);

module.exports = router;
