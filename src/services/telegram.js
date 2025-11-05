const fetch = require('node-fetch');
const config = require('../../config/env');

class TelegramService {
  constructor(options = {}) {
    const { botToken, chatId, dryRun } = {
      botToken: config.telegram.botToken,
      chatId: config.telegram.chatId,
      dryRun: config.telegram.dryRun,
      ...options,
    };

    this.botToken = botToken;
    this.chatId = chatId;
    this.dryRun = dryRun;

    if (!this.dryRun && (!this.botToken || !this.chatId)) {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be provided when dry run is disabled.');
    }
  }

  async sendMessage({ text, parseMode = 'MarkdownV2' }) {
    if (!text) {
      throw new Error('Cannot send an empty message to Telegram.');
    }

    if (this.dryRun) {
      return {
        dryRun: true,
        message: 'Dry run enabled. Message was not sent to Telegram.',
        payload: { text, parseMode },
      };
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: parseMode,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to send message to Telegram: ${response.status} ${response.statusText} ${body}`);
    }

    return response.json();
  }
}

module.exports = TelegramService;
