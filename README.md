# Autobuyer — AI-оценка рекламных кампаний для медиабаеров

Умный помощник, который берёт кампании Facebook из дашборда баеров, прохождение воронки — из PostHog,
и выставляет каждой кампании скор 0–100 по настраиваемым критериям с вердиктом
**Масштабировать / Держать / Оптимизировать / Остановить** и текстовыми рекомендациями.

## Запуск

```bash
npm install
cp .env.example .env.local   # заполнить ключи
npm run dev                  # http://localhost:3000
```

`DATA_MODE=demo` — работает без ключей на синтетических данных (14 кампаний разного качества).
`DATA_MODE=live` — реальные источники; если источник недоступен, UI показывает это в строке статусов и падает на демо.

## Архитектура

```
src/lib/types.ts              доменные типы (AdCampaignStats, FunnelMetrics, ScoringConfig, CampaignScore…)
src/lib/sources/capsuled.ts   клиент дашборда баеров: GET /fb-stats, толерантный маппер полей
src/lib/sources/posthog.ts    HogQL-запрос: уникальные персоны на каждом шаге воронки, GROUP BY utm_campaign
src/lib/sources/demo.ts       детерминированные демо-данные
src/lib/scoring/funnel.ts     FunnelCounts → FunnelMetrics (CR первого экрана, доходимости, CR пэйвола…)
src/lib/scoring/engine.ts     движок: пороги → баллы (линейная интерполяция), вердикт, инсайты, рекомендации
src/lib/scoring/defaultConfig.ts  критерии и шаги воронки по умолчанию
src/lib/configStore.ts        конфиг хранится в data/scoring-config.json (правится в UI /rules)
src/lib/evaluate.ts           оркестрация источников + кеш 2 мин
src/app/                      страницы: / (кампании), /campaigns/[id], /rules, /settings, /docs
src/app/api/                  evaluate, campaigns/:id, config (GET/PUT/DELETE), health
```

## Скоринг

Каждый критерий имеет вес (макс. баллов) и пороги `значение → баллы`; между порогами — линейная интерполяция.
Если выборка кампании меньше `minSample` критерия, критерий исключается из знаменателя (кампания не штрафуется
за нехватку данных), но отдельный критерий «Достаточность данных» снижает скор молодых кампаний.

| Группа       | Критерий                            | Метрика                 | Баллы |
|--------------|-------------------------------------|-------------------------|------:|
| Воронка      | CR первого экрана                   | landing → quiz_start    | 15 |
| Воронка      | Доходимость до середины квиза       | quiz_mid / landing      | 8 |
| Воронка      | Доходимость до email                | email / landing         | 7 |
| Воронка      | Доходимость до пэйвола              | paywall / landing       | 12 |
| Монетизация  | Конверсия пэйвола                   | trial / paywall         | 15 |
| Монетизация  | Конверсия воронки в триал           | trial / landing         | 15 |
| Монетизация  | Конверсия в апсейл 1                | upsell1 / trial         | 8 |
| Монетизация  | Конверсия в апсейл 2 (если есть)    | upsell2 / upsell1       | 4 |
| Реклама      | CPA триала к цели                   | CPA / targetCpa         | 10 |
| Реклама      | CTR креатива                        | %                       | 4 |
| Реклама      | Частота показов                     | impressions / reach     | 3 |
| Качество     | Тренд CPA за 7 дней                 | последние 3 дня vs 4    | 4 |
| Качество     | Достаточность данных                | visitors / minVisitors  | 5 |

Скор = набрано / доступно × 100. Вердикты: ≥75 масштабировать, ≥55 держать, ≥35 оптимизировать, иначе остановить.
Все веса, пороги, шаги воронки и границы вердиктов правятся в разделе **Правила**.

## Источники

**Дашборд баеров** — `GET {CAPSULED_API_URL}/fb-stats?dateFrom&dateTo&level=campaign&includeDaily=true&includeInactive=true&limit=10000`,
`Authorization: Bearer <key>`. При `includeDaily=true` каждая строка `rows[]` — одна кампания за один день
(`date, campaignId, campaignName, buyer, adAccountId, adAccountName, spend, fbPurchases, impressions, clicks, reach, …`);
`capsuled.ts` агрегирует их по `campaignId` в сводку + `daily[]`. Покупки берутся из `fbPurchases` (канонические покупки Meta).
Статуса кампании в API нет: «активная» = есть показы или расход за последний день, по которому у дашборда вообще есть данные; «неактивная» = открутка была раньше в периоде, но не в этот день.
Сырой ответ последнего запроса сохраняется в `data/cache/capsuled-last.json`.

**PostHog** — один HogQL-запрос через `POST /api/projects/:id/query` (personal API key с `query:read`):
для каждого шага `countDistinctIf(person_id, event = '…' [AND properties.x = '…'])`, группировка по
`coalesce(properties.utm_campaign, person.properties.$initial_utm_campaign)`. Ожидается, что в ссылках баеров
`utm_campaign={{campaign.id}}`. Имена событий воронки задаются в **Правила → Шаги воронки**.

## Дорожная карта (идеи)

См. раздел «Что добавить» в описании проекта: алерты в Telegram/Slack, история скора и дельты день-к-дню,
бенчмарки по гео/баеру, авто-правила (пауза/масштабирование через Marketing API с подтверждением),
оценка на уровне адсетов и креативов, LLM-чат по данным, A/B-сравнение воронок, прогноз CPA/окупаемости.

## Продукты и правила на продукт

Трафик льётся на несколько продуктов (Azora, Foxiq, Robella), у каждого свои правила скоринга:
`data/scoring-config.<product>.json`. Если файла продукта нет, берётся общий `data/scoring-config.json`,
а если нет и его — `DEFAULT_SCORING_CONFIG`. API: `GET/PUT/DELETE /api/config?product=azora|foxiq|robella`,
`GET /api/config?all=1`. В разделе «Правила» продукты переключаются вкладками, есть копирование правил
из другого продукта.

Продукт кампании определяется в `src/lib/products.ts` (по убыванию надёжности): домен воронки из PostHog
(`$host` событий кампании: azora-astro.com / foxiq.app / robella.app), URL воронки в названии кампании,
ключевые слова в названии кампании, ключевые слова в названии рекламного аккаунта. Неопределённые кампании
помечаются «продукт не определён» и считаются по правилам `DEFAULT_PRODUCT` (Azora). На дашборде
переключатель продукта (`?product=…`) фильтрует список и KPI.
