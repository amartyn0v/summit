# Summit Scientific Summarizer MVP

Минимальный MVP-сервис для сбора научных статей, генерации саммари и публикации в Telegram-канал. Архитектура повторяет требования технического описания: несколько микросервисов в монорепозитории, PostgreSQL для данных, RabbitMQ для очередей и интеграция с OpenAI и Telegram.

## Архитектура сервисов

| Сервис | Назначение |
| --- | --- |
| `api-gateway` | REST API для админки: управление источниками, постановка статей в очередь, апрув публикаций. Basic Auth. |
| `scheduler` | Cron-планировщик: ежедневный обход источников (03:00–05:00 MSK) и публикация утверждённых постов в 11:00 MSK. |
| `summarizer` | Консьюмер очереди `summarize.request`, вызывает OpenAI API и создаёт черновики публикаций. |
| `publisher` | Обрабатывает очереди `publication.draft.request` и `publication.schedule`, отправляет превью в DM владельцу и публикует посты в канал. |

Общая схема обмена повторяет pipeline из техдока: `crawl.start → fetch.request → parse.request → dedup.request → summarize.request → publication.draft.request → publication.approved → publication.schedule` (часть этапов пока заглушена).

## Технологический стек

- Node.js 20+ и TypeScript
- Fastify, Zod, Pino
- Prisma ORM + PostgreSQL
- RabbitMQ (amqplib)
- OpenAI API (Responses API)
- Telegraf для Telegram Bot API
- node-cron для планировщика

## Начало работы

1. Скопируйте пример окружения и укажите реальные значения:

   ```bash
   cp .env.example .env
   ```

2. Поднимите инфраструктуру (PostgreSQL, RabbitMQ, Redis) через Docker Compose (см. раздел ниже) или используйте собственные инстансы.

3. Установите зависимости и сгенерируйте Prisma Client:

   ```bash
   npm install
   npm run prisma:generate
   ```

4. Примените миграции (создайте директорию `prisma/migrations` при первом запуске):

   ```bash
   npm run prisma:migrate -- --name init
   ```

5. Запустите нужные сервисы локально (используются `tsx` + hot reload):

   ```bash
   npm run dev:api
   npm run dev:scheduler
   npm run dev:summarizer
   npm run dev:publisher
   ```

   Для интеграционного прогона одновременно понадобятся PostgreSQL, RabbitMQ, OpenAI API key и Telegram bot token. Сервис Telegram поддерживает режим `DRY_RUN_TELEGRAM=true` для безопасного теста без отправки сообщений.

## Docker Compose (пример)

Создайте файл `docker-compose.yml` рядом с репозиторием со следующим содержимым, чтобы поднять инфраструктуру:

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: summit
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data

  rabbitmq:
    image: rabbitmq:3-management
    restart: unless-stopped
    ports:
      - '5672:5672'
      - '15672:15672'
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest

  redis:
    image: redis:7
    restart: unless-stopped
    ports:
      - '6379:6379'

volumes:
  postgres-data:
```

(Подключение Redis пока не используется, но добавлено согласно техдоку.)

## API (выдержка)

- `GET /health` — проверка статуса.
- `GET /sources` / `POST /sources` — управление источниками.
- `POST /summaries` — постановка статьи в очередь на суммаризацию. Требует `sourceId` (созданный через `/sources`).
- `GET /summaries` — последние саммари с метаданными.
- `GET /publications` — последние публикации.
- `POST /publications/:id/approve` — апрув черновика (после DM). Триггерит очередь `publication.approved`, которую обрабатывает планировщик.

Все запросы защищены Basic Auth (`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`).

## Локальное файловое хранилище

Тексты статей сохраняются в каталоге `storage/articles/<articleId>/`. Модуль `packages/storage` позволяет записывать и читать файлы; в текущем MVP файлы создаются при обработке источников и могут использоваться дальнейшими сервисами (crawler/fetcher/parse), которые пока не реализованы.

## Тестирование и отладка

- `npm run lint` — проверка стиля кода (ESLint + @typescript-eslint).
- В разработке используйте `DRY_RUN_TELEGRAM=true`, чтобы не слать реальные сообщения.
- Для имитации pipeline можно вручную:
  1. Создать источник через `/sources`.
  2. Отправить статью через `/summaries` (в теле указать текст/аннотацию).
  3. Дождаться генерации саммари (сервис `summarizer`).
  4. Получить черновик в DM (если `DRY_RUN_TELEGRAM=false`).
  5. Апрувнуть публикацию (`POST /publications/:id/approve`).
  6. Проверить публикацию после срабатывания планировщика (`scheduler`).

## Дальнейшие шаги

- Реализовать отсутствующие сервисы (`crawler`, `fetcher`, `parser`, `deduplicator`).
- Добавить UI админки и фронтенд.
- Расширить мониторинг (Prometheus + Grafana), алерты и бэкапы.
- Поддержать альтернативные провайдеры LLM (Ollama) и OCR.

## Лицензия

MIT
