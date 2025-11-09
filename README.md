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

1. Скопируйте `.env.example` в `.env` и заполните секреты. Значения по умолчанию уже настроены на инфраструктуру из `docker-compose.yml`.

2. Поднимите инфраструктуру (PostgreSQL, RabbitMQ, Redis) командой `docker compose up -d` (см. раздел ниже) или используйте собственные инстансы, скорректировав переменные окружения.

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

## Docker Compose (инфраструктура)

`docker-compose.yml` уже содержит все необходимые сервисы:

```bash
docker compose up -d        # старт инфраструктуры
docker compose down         # остановка и удаление контейнеров
docker compose logs -f      # просмотр логов
```

### Что поднимается

| Сервис | Порт (хост) | Доступ/ссылки | Комментарий |
| --- | --- | --- | --- |
| PostgreSQL 15 | `5432` | `postgres` / `postgres`, БД `summit` | Данные сохраняются в volume `postgres-data` |
| RabbitMQ 3.12 + management | `5672`, `15672` | Панель: http://localhost:15672 (`guest` / `guest`) | Очереди и настройки в volume `rabbitmq-data` |
| Redis 7 (AOF) | `6379` | `redis-cli -h localhost` | Volume `redis-data`, включён append-only режим |

Все сервисы имеют `healthcheck`, поэтому `docker compose ps` покажет статус готовности. Если вы запускаете Node.js сервисы напрямую на хосте, оставьте строки подключения из `.env.example` (`localhost`). При запуске приложений в Docker поменяйте хосты на имена сервисов (`postgres`, `rabbitmq`, `redis`).

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
- `npm run telegram:test -- "текст"` — ручная проверка отправки сообщения в канал SummIt! с выводом ссылки на опубликованное сообщение.
- `npm run ingest:naturescience` — скачивает **только первый найденный** PDF с указанных страниц журнала Nature Science, извлекает из него весь текст до секции `Abstract` и отправляет этот блок (обычно заголовок + авторы) в Telegram. После этого скрипт загружает тот же PDF в OpenAI, просит сформулировать простое summary и публикует ответ как отдельное сообщение. Локальная копия файла кладётся в `storage/naturescience/`, а ссылка заносится в `storage/naturescience/processed.json`, чтобы повторные запуски пропускали уже обработанный документ.
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
