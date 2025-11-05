# Summit Backend MVP

Минимальный бэкенд-сервис для сбора и публикации саммаризованных научных статей. Реализован на Node.js и включает базу данных SQLite, локальное хранилище файлов и отправку саммари в Telegram.

## Возможности

- REST API для создания и получения саммаризованных статей
- Хранение метаданных в локальной базе данных SQLite
- Локальное файловое хранилище для вложений (PDF, изображения и т.д.)
- Отправка саммари в Telegram (с поддержкой dry-run режима для проверки без реальной отправки)

## Быстрый старт

1. Скопируйте файл `.env.example` в `.env` и при необходимости обновите значения переменных окружения:

   ```bash
   cp .env.example .env
   ```

   Основные переменные:

   - `PORT` – порт HTTP-сервера
   - `DATABASE_PATH` – путь к файлу базы данных SQLite
   - `UPLOAD_DIR` – директория для сохранения загруженных файлов
   - `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` – реквизиты Telegram-бота для реальной отправки
   - `TELEGRAM_DRY_RUN` – если `true`, сервис имитирует отправку и возвращает payload без реального запроса к Telegram API

2. Установите зависимости и запустите сервер:

   ```bash
   npm install
   npm run start
   ```

   Сервер по умолчанию слушает `http://localhost:3000`.

## Основные эндпоинты

| Метод | Путь | Описание |
| --- | --- | --- |
| `GET` | `/health` | Проверка состояния сервера |
| `GET` | `/summaries` | Получить список саммаризованных статей |
| `GET` | `/summaries/:id` | Получить конкретную запись |
| `POST` | `/summaries` | Создать саммари. Поддерживает `multipart/form-data` с полями `title`, `summary`, `sourceUrl` и файлом `file` |
| `POST` | `/summaries/:id/send-telegram` | Отправить саммари в Telegram (использует настройки из `.env`) |

### Пример запроса на создание саммари

```bash
curl -X POST http://localhost:3000/summaries \
  -F "title=Новая статья" \
  -F "summary=Краткое содержание" \
  -F "sourceUrl=https://example.com/article" \
  -F "file=@/path/to/local/file.pdf"
```

### Пример отправки в Telegram

```bash
curl -X POST http://localhost:3000/summaries/1/send-telegram
```

- При `TELEGRAM_DRY_RUN=true` ответ содержит payload подготовленного сообщения.
- Для реальной отправки укажите корректные `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` в `.env` и установите `TELEGRAM_DRY_RUN=false`.

## Структура проекта

```
config/          – загрузка переменных окружения
src/
  app.js         – конфигурация Express-приложения
  server.js      – точка входа HTTP-сервера
  database.js    – инициализация SQLite и методы работы с таблицей summaries
  controllers/   – контроллеры HTTP-запросов
  routes/        – маршруты Express
  services/      – интеграции (Telegram)
  utils/         – вспомогательные функции (форматирование сообщений)
storage/         – база данных и загруженные файлы
```

## Проверка отправки в Telegram

1. Создайте бота через `@BotFather` и получите токен.
2. Добавьте бота в нужный чат и получите `chat_id` (например, через `curl` запрос к `getUpdates`).
3. Обновите `.env`:

   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABC...
   TELEGRAM_CHAT_ID=-1001234567890
   TELEGRAM_DRY_RUN=false
   ```

4. Отправьте POST-запрос `/summaries/:id/send-telegram`. При успешной отправке API вернет ответ Telegram.

## Лицензия

MIT
