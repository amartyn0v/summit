const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const numberFromEnv = (value, fallback) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  port: numberFromEnv(process.env.PORT, 3000),
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'storage', 'summaries.db'),
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'storage', 'uploads'),
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    dryRun: String(process.env.TELEGRAM_DRY_RUN || '').toLowerCase() === 'true',
  },
};
