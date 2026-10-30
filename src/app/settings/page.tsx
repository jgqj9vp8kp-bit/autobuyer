import clsx from "clsx";
import { Card, Kicker } from "@/components/ui";
import { storageInfo } from "@/lib/configStore";
import { defaultRange, evaluateCached, isLiveMode } from "@/lib/evaluate";
import { DEFAULT_PRODUCT, PRODUCTS } from "@/lib/products";
import { DEFAULT_CAMPAIGN_EXPR } from "@/lib/sources/posthog";

export const dynamic = "force-dynamic";
// Vercel: запросы к дашборду и PostHog (60-дневные бенчмарки) могут занимать больше 10 с по умолчанию
export const maxDuration = 60;

const mask = (v?: string) => (v ? `${v.slice(0, 4)}…${v.slice(-3)}` : "не задан");

export default async function SettingsPage() {
  const r = defaultRange();
  const data = await evaluateCached(r.dateFrom, r.dateTo);
  const env = process.env;

  return (
    <div className="fade-up space-y-6">
      <header>
        <div className="kicker">Источники данных</div>
        <h1 className="mt-1 text-3xl font-bold">Подключения</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Ключи задаются в <code>.env.local</code> (см. <code>.env.example</code>). Режим: <b>{isLiveMode() ? "LIVE" : "DEMO"}</b>. После изменения env перезапустите dev-сервер. Доступ по паролю:{" "}
          <b className={env.BASIC_AUTH_PASSWORD ? "text-success" : "text-danger"}>{env.BASIC_AUTH_PASSWORD ? "включён (Basic Auth)" : "выключен — задайте BASIC_AUTH_PASSWORD перед публикацией"}</b>. Хранилище правил:{" "}
          <b className={storageInfo().kind !== "files" || !(env.VERCEL || env.RENDER) ? "text-success" : "text-danger"}>
            {storageInfo().kind === "kv"
              ? `Redis REST (${storageInfo().detail})`
              : storageInfo().kind === "redis"
                ? `Redis (${storageInfo().detail})`
                : env.VERCEL || env.RENDER
                  ? "файлы — на этом хостинге не сохранятся между перезапусками, подключите Redis"
                  : `файлы (${storageInfo().detail})`}
          </b>
          .
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {data.sources.map((s) => (
          <Card key={s.source}>
            <div className="flex items-center justify-between">
              <Kicker>{s.source}</Kicker>
              <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{s.ok ? "OK" : "Ошибка"}</span>
            </div>
            <div className="mt-2 text-sm">{s.message}</div>
            <div className="mt-1 text-xs text-muted">проверено {new Date(s.checkedAt).toLocaleString("ru-RU")}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <Kicker>Дашборд баеров</Kicker>
          <h2 className="mb-2 text-lg font-bold">capsuled.space</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">CAPSULED_API_URL</dt>
              <dd className="truncate font-mono text-xs">{env.CAPSULED_API_URL || "https://capsuled.space/api/external/v1"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">CAPSULED_API_KEY</dt>
              <dd className="font-mono text-xs">{mask(env.CAPSULED_API_KEY)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Запрос: <code>GET /fb-stats?dateFrom&dateTo&level=campaign&includeDaily=true&includeInactive=true&limit=10000</code> с заголовком <code>Authorization: Bearer …</code>. Сырой ответ последнего успешного запроса сохраняется в <code>data/cache/capsuled-last.json</code> — по нему сверяется маппинг полей.
          </p>
        </Card>
        <Card>
          <Kicker>Воронка</Kicker>
          <h2 className="mb-2 text-lg font-bold">PostHog</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">POSTHOG_HOST</dt>
              <dd className="font-mono text-xs">{env.POSTHOG_HOST || "https://eu.posthog.com"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">POSTHOG_PROJECT_ID</dt>
              <dd className="font-mono text-xs">{env.POSTHOG_PROJECT_ID || "не задан"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">POSTHOG_API_KEY</dt>
              <dd className="font-mono text-xs">{mask(env.POSTHOG_API_KEY)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">POSTHOG_CAMPAIGN_EXPR</dt>
              <dd className="truncate font-mono text-xs" title={env.POSTHOG_CAMPAIGN_EXPR || DEFAULT_CAMPAIGN_EXPR}>
                {env.POSTHOG_CAMPAIGN_EXPR || DEFAULT_CAMPAIGN_EXPR}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Пользователь привязывается к кампании по <code>utm_campaign</code> (ожидается id кампании FB). Считаем уникальных персон на каждом шаге воронки одним HogQL-запросом через <code>/api/projects/:id/query</code>. Нужен personal API key с правом <code>query:read</code>.
          </p>
        </Card>
      </div>

      <Card>
        <Kicker>Продукты</Kicker>
        <h2 className="mb-2 text-lg font-bold">Как кампания относится к продукту</h2>
        <p className="text-xs leading-relaxed text-muted">
          Сначала по домену воронки в PostHog (<code>$host</code> событий кампании), затем по URL воронки в названии кампании, затем по ключевым словам в названии кампании и рекламного аккаунта. Если ничего не подошло,
          кампания помечается «продукт не определён» и считается по правилам {PRODUCTS.find((p) => p.key === DEFAULT_PRODUCT)?.label}. Правила скоринга задаются для каждого продукта отдельно в разделе «Правила».
        </p>
        <table className="table mt-3 w-full text-xs">
          <thead>
            <tr>
              <th>Продукт</th>
              <th>Домены воронок</th>
              <th>Ключевые слова в названии</th>
              <th>Что это</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCTS.map((p) => (
              <tr key={p.key}>
                <td className="font-semibold">{p.label}</td>
                <td className="font-mono">{p.hosts.join(", ")}</td>
                <td className="font-mono text-muted">{p.namePatterns.map((re) => re.source).join(" ")}</td>
                <td className="text-muted">{p.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
