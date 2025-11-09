import { OpenAI } from 'openai';
import { getConfig } from '../config/index.ts';
import { logger } from '../logger/index.ts';

const config = getConfig();

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const PROMPT = `Ты — научный редактор. Напиши краткое summary статьи простым языком (до ${config.SUMMARY_MAX_LENGTH} символов). Укажи ключевой результат и почему он важен. Избегай жаргона.`;

export interface SummarizeInput {
  title: string;
  abstract: string;
  language?: string;
}

export interface SummarizeResult {
  text: string;
  needsReview: boolean;
}

export async function generateSummary({ title, abstract }: SummarizeInput): Promise<SummarizeResult> {
  if (config.PROVIDER !== 'openai') {
    throw new Error('Only OpenAI provider is implemented in MVP');
  }

  const completion = await openai.responses.create({
    model: config.OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: PROMPT
      },
      {
        role: 'user',
        content: `Заголовок: ${title}\nАннотация: ${abstract}`
      }
    ],
    max_output_tokens: 800,
    temperature: 0.5
  });

  const text = completion.output_text.trim();
  const truncated = text.slice(0, config.SUMMARY_MAX_LENGTH);
  const needsReview = text.length > config.SUMMARY_MAX_LENGTH;

  if (needsReview) {
    logger.warn({ length: text.length }, 'Summary exceeded max length; truncated');
  }

  return {
    text: truncated,
    needsReview
  };
}
