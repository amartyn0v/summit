import { logger } from '../packages/logger/index.ts';
import { getConfig } from '../packages/config/index.ts';
import { sendPlainTextToChannel } from '../packages/telegram/index.ts';

const config = getConfig();

function buildPermalink(rawMessageId: string): string | null {
  const [rawChatId, rawTelegramMessageId] = rawMessageId.split(':');
  if (!rawChatId || !rawTelegramMessageId) {
    return null;
  }

  const channelSlugCandidate = config.CHANNEL_CHAT_ID.replace(/^@/, '');
  if (/^[A-Za-z0-9_]+$/.test(channelSlugCandidate)) {
    return `https://t.me/${channelSlugCandidate}/${rawTelegramMessageId}`;
  }

  if (rawChatId.startsWith('-100')) {
    const internalId = rawChatId.slice(4);
    if (/^\d+$/.test(internalId)) {
      return `https://t.me/c/${internalId}/${rawTelegramMessageId}`;
    }
  }

  return null;
}

async function main() {
  const [, , ...args] = process.argv;
  const customMessage = args.join(' ').trim();
  const message = customMessage.length > 0 ? customMessage : 'SummIt! тестовое сообщение';

  try {
    const messageId = await sendPlainTextToChannel(`🤖 SummIt! test: ${message}`);
    if (messageId) {
      const permalink = buildPermalink(messageId);
      logger.info({ messageId, permalink }, 'Test message delivered to channel');
    } else {
      logger.info('DRY RUN: message not delivered (DRY_RUN_TELEGRAM=true)');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to send test message to Telegram channel');
    process.exitCode = 1;
  }
}

void main();
