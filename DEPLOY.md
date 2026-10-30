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

## Вариант 1 (рекомендуется): Railway из GitHub

1. railway.app → New Project → Deploy from GitHub repo → `jgqj9vp8kp-bit/autobuyer`. Railway увидит `Dockerfile`.
2. Settings → Volumes → Add volume, mount path `/data`.
3. Variables → добавить переменные из `.env.example` (как минимум `DATA_MODE`, ключи capsuled и PostHog,
   `BASIC_AUTH_PASSWORD`). `DATA_DIR` оставить `/data` (уже задан в образе), `PORT` Railway подставит сам.
4. Settings → Networking → Generate domain. Healthcheck path: `/api/health`.

Render и Fly.io работают так же (Dockerfile + persistent disk/volume + env vars).

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
