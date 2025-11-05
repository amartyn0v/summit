import { logger } from '../packages/logger/index.ts';
import { sendPlainTextToChannel } from '../packages/telegram/index.ts';

async function main() {
  const [, , ...args] = process.argv;
  const customMessage = args.join(' ').trim();
  const message = customMessage.length > 0 ? customMessage : 'SummIt! тестовое сообщение';

  try {
    const messageId = await sendPlainTextToChannel(`🤖 SummIt! test: ${message}`);
    if (messageId) {
      logger.info({ messageId }, 'Test message delivered to channel');
    } else {
      logger.info('DRY RUN: message not delivered (DRY_RUN_TELEGRAM=true)');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to send test message to Telegram channel');
    process.exitCode = 1;
  }
}

void main();
