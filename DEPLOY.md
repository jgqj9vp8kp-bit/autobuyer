# Публикация Autobuyer

Приложение — один Next.js-сервер без базы данных: правила скоринга и кеш лежат в файлах в `DATA_DIR`,
всё остальное каждый раз берётся из дашборда баеров и PostHog. Поэтому хостингу нужны три вещи:
Node или Docker, постоянный диск для `DATA_DIR` и переменные окружения с ключами.

## Что обязательно перед публикацией

1. **Пароль.** Задайте `BASIC_AUTH_PASSWORD` (и при желании `BASIC_AUTH_USER`). Без пароля приложение
   открыто, а в нём расходы и ключи. Раздел «Источники» показывает, включена ли защита.
2. **Ключи источников:** `CAPSULED_API_KEY`, `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_API_KEY`, `DATA_MODE=live`.
3. **Постоянный диск** для `DATA_DIR` (в Docker-образе это `/data`). Без него правила скоринга сбросятся
   при каждом перезапуске.

Полный список переменных — в `.env.example`.

## Вариант 1 (рекомендуется): Render из GitHub

В репозитории лежит `render.yaml` (Blueprint): web-сервис из `Dockerfile` на бесплатном тарифе,
health check `/api/health`, переменные окружения. Регистрация на Render — через GitHub или email,
без телефона и карты.

1. render.com → Sign up через GitHub, дать доступ к репозиторию `jgqj9vp8kp-bit/autobuyer`.
2. Render Dashboard → New → Blueprint → выбрать репозиторий (или вставить публичный URL) → Render прочитает
   `render.yaml` и спросит секреты: `CAPSULED_API_KEY`, `POSTHOG_API_KEY` (из `.env.local`),
   `BASIC_AUTH_PASSWORD` (любой пароль). Остальное уже заполнено, включая бесплатный Key Value (Redis)
   `autobuyer-kv` для правил скоринга: его адрес Render сам подставляет в `REDIS_URL`.
3. Apply. Первая сборка 3–5 минут, адрес вида `https://autobuyer-….onrender.com`.
4. Обновления: после push в `main` на странице Blueprint нажать «Manual sync» (без подключения GitHub
   к Render автодеплоя нет).

Ограничения free: сервис засыпает без трафика (первый запрос ~30–60 с), 512 МБ RAM; у бесплатного Key Value
нет персистентности на диск: при его перезапуске правила вернутся к значениям по умолчанию. Надёжнее —
Upstash Redis (free, durable): задать `KV_REST_API_URL` и `KV_REST_API_TOKEN` в Environment, они имеют
приоритет над `REDIS_URL`. Платный Starter снимает сон, и тогда можно вместо Redis добавить диск 1 ГБ на `/data`.

Через API то же самое делается запросом `POST https://api.render.com/v1/services` с API-ключом
(Account Settings → API Keys), если нужно автоматизировать.

## Vercel

Next.js там родной, конфиг под него тоже готов (`vercel.json`, `maxDuration`, правила в Redis через
`KV_REST_API_URL`/`KV_REST_API_TOKEN` или интеграцию Upstash из вкладки Storage). Но регистрация Vercel
просит подтверждение по телефону (SMS), а функции ограничены по времени, поэтому основной вариант — Render.

## Railway

Аналогично: New Project → Deploy from GitHub repo, Volume на `/data`, Variables из `.env.example`,
Generate domain, healthcheck `/api/health`. На 30.10.2026 Railway не принимал новые регистрации
(«Sign ups are currently disabled»), поэтому основной вариант — Render. Fly.io тоже подходит (Dockerfile +
volume + secrets через `flyctl`).

## Вариант 2: свой сервер (VPS) с Docker

```bash
git clone https://github.com/jgqj9vp8kp-bit/autobuyer.git && cd autobuyer
cp .env.example .env.local   # заполнить ключи и пароль
docker build -t autobuyer .
docker run -d --name autobuyer --restart unless-stopped -p 3000:3000 -v autobuyer-data:/data --env-file .env.local autobuyer
```

Дальше обычный reverse proxy (Caddy или nginx) с HTTPS на порт 3000. Обновление: `git pull`, `docker build`, пересоздать контейнер.

## Вариант 3: без Docker (PM2 на VPS)

```bash
npm ci && npm run build
DATA_DIR=/var/lib/autobuyer BASIC_AUTH_PASSWORD=... DATA_MODE=live ... node .next/standalone/server.js
```

Статику нужно скопировать рядом: `cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public`.

## Vercel и другие serverless

Подходит только после переноса хранилища правил из файлов в базу (Vercel KV / Postgres): файловая система
там не сохраняется между запросами, а запросы к дашборду и PostHog за 60 дней (бенчмарки) могут
не укладываться в лимит времени функции. Если нужен именно Vercel — это отдельная задача на день.

## После первого запуска

- Откройте «Источники»: оба источника должны быть OK, защита паролем включена.
- Откройте «Правила» и сохраните правила для каждого продукта один раз, чтобы файлы появились на диске.
- Сеть хостинга стабильнее домашней: таймауты к Cloudflare-хостам (capsuled, PostHog), которые бывали локально, там не ожидаются.
