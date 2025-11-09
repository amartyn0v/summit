import pino from 'pino';
import { getConfig } from '../config/index.ts';

const config = getConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: undefined
});
