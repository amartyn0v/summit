import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .string()
  .trim()
  .transform((value) => {
    const normalized = value.toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    throw new Error(`Invalid boolean value: ${value}`);
  });

const booleanFromEnv = z.union([z.boolean(), booleanString]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  BOT_TOKEN: z.string(),
  OWNER_TELEGRAM_USER_ID: z.string(),
  CHANNEL_CHAT_ID: z.string(),
  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  PROVIDER: z.enum(['openai', 'ollama']).default('openai'),
  CRAWL_WINDOW: z.string().default('03:00-05:00'),
  TIMEZONE_PUBLICATION: z.string().default('Europe/Moscow'),
  TZ_ADMIN: z.string().default('Europe/Amsterdam'),
  SUMMARY_MAX_LENGTH: z.coerce.number().default(1000),
  STORAGE_DIR: z.string().default('storage'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DRY_RUN_TELEGRAM: booleanFromEnv.default(true),
  SCHEDULER_START_HOUR: z.coerce.number().min(0).max(23).default(3),
  SCHEDULER_END_HOUR: z.coerce.number().min(0).max(23).default(5),
  PUBLICATION_HOUR_MSK: z.coerce.number().min(0).max(23).default(11)
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration', parsed.error.flatten());
    throw new Error('Invalid environment configuration');
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}
