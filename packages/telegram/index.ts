import { Telegraf } from 'telegraf';
import { getConfig } from '../config/index.ts';
import { logger } from '../logger/index.ts';

const config = getConfig();

const bot = new Telegraf(config.BOT_TOKEN, {
  handlerTimeout: 30_000
});

export interface TelegramDraftPayload {
  title: string;
  summary: string;
  url: string;
  authors: string[];
  doi?: string | null;
  journal?: string | null;
  year?: number | null;
  isPreprint?: boolean;
}

function formatAuthors(authors: string[]): string {
  if (authors.length <= 3) {
    return authors.join(', ');
  }
  return `${authors.slice(0, 3).join(', ')}, et al.`;
}

export function buildDraftMessage(payload: TelegramDraftPayload): string {
  const header = payload.title;
  const summary = payload.summary;
  const lines = [header, '', summary, '', `Оригинал: ${payload.url}`];

  if (payload.authors.length > 0) {
    lines.push(`Авторы (до 3): ${formatAuthors(payload.authors)}`);
  }

  if (payload.doi || payload.journal || payload.year) {
    const doiPart = payload.doi ? `DOI: ${payload.doi}` : '';
    const journalPart = payload.journal ? `Журнал: ${payload.journal}` : '';
    const yearPart = payload.year ? `Год: ${payload.year}` : '';
    const meta = [doiPart, journalPart, yearPart].filter(Boolean).join(' · ');
    if (meta) {
      lines.push(`DOI/Журнал/Год: ${meta}`);
    }
  }

  if (payload.isPreprint) {
    lines.push('Примечание: preprint, без peer-review');
  }

  return lines.join('\n');
}

export async function sendDraftToOwner(payload: TelegramDraftPayload): Promise<string | null> {
  const message = buildDraftMessage(payload);
  if (config.DRY_RUN_TELEGRAM) {
    logger.info({ message }, 'DRY RUN: Telegram draft prepared');
    return null;
  }

  const result = await bot.telegram.sendMessage(config.OWNER_TELEGRAM_USER_ID, message, {
    parse_mode: 'HTML'
  });

  return `${result.chat.id}:${result.message_id}`;
}

export async function sendPublicationToChannel(message: string): Promise<string | null> {
  if (config.DRY_RUN_TELEGRAM) {
    logger.info({ message }, 'DRY RUN: Telegram channel message');
    return null;
  }

  const result = await bot.telegram.sendMessage(config.CHANNEL_CHAT_ID, message, {
    parse_mode: 'HTML'
  });

  return `${result.chat.id}:${result.message_id}`;
}

export async function sendPlainTextToChannel(message: string): Promise<string | null> {
  if (config.DRY_RUN_TELEGRAM) {
    logger.info({ message }, 'DRY RUN: Telegram channel plain-text message');
    return null;
  }

  const result = await bot.telegram.sendMessage(config.CHANNEL_CHAT_ID, message, {
    parse_mode: 'HTML'
  });

  return `${result.chat.id}:${result.message_id}`;
}

export function getBotInstance(): Telegraf {
  return bot;
}
