import clsx from "clsx";
import { Card, Kicker } from "@/components/ui";
import { defaultRange, evaluateCached, isLiveMode } from "@/lib/evaluate";

export const dynamic = "force-dynamic";

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
          Ключи задаются в <code>.env.local</code> (см. <code>.env.example</code>). Режим: <b>{isLiveMode() ? "LIVE" : "DEMO"}</b>. После изменения env перезапустите dev-сервер.
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
              <dd className="truncate font-mono text-xs">{env.POSTHOG_CAMPAIGN_EXPR || "coalesce(properties.utm_campaign, person.properties.$initial_utm_campaign, '')"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Пользователь привязывается к кампании по <code>utm_campaign</code> (ожидается id кампании FB). Считаем уникальных персон на каждом шаге воронки одним HogQL-запросом через <code>/api/projects/:id/query</code>. Нужен personal API key с правом <code>query:read</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}
