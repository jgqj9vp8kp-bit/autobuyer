import { Card, Kicker } from "@/components/ui";
import { loadConfig } from "@/lib/configStore";
import { GROUP_LABEL } from "@/lib/verdict";

export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const cfg = await loadConfig();
  const total = cfg.criteria.filter((c) => c.enabled).reduce((s, c) => s + c.maxPoints, 0);
  return (
    <div className="fade-up max-w-4xl space-y-6">
      <header>
        <div className="kicker">Методика</div>
        <h1 className="mt-1 text-3xl font-bold">Как считается скор</h1>
      </header>

      <Card>
        <Kicker>Шаг 1 · Данные</Kicker>
        <p className="mt-2 text-sm leading-relaxed">
          Для каждой кампании берём рекламную статистику из дашборда баеров (расход, показы, клики, покупки по дням) и воронку из PostHog — число уникальных пользователей на каждом шаге, сгруппированное по <code>utm_campaign</code>.
          Из воронки считаем: CR первого экрана, доходимость до ключевых точек и до пэйвола, конверсию пэйвола, сквозную конверсию в триал, конверсии в апсейлы.
        </p>
      </Card>

      <Card>
        <Kicker>Шаг 2 · Баллы</Kicker>
        <p className="mt-2 text-sm leading-relaxed">
          Каждый критерий имеет вес (максимум баллов) и пороги «значение → баллы». Между порогами баллы интерполируются линейно. Если выборка меньше <code>minSample</code> критерия, он исключается из знаменателя — кампания не штрафуется за нехватку данных, но отдельный критерий «Достаточность данных» снижает скор молодых кампаний.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Критерий</th>
                <th>Группа</th>
                <th>Метрика</th>
                <th className="text-right">Макс.</th>
                <th>Пороги</th>
              </tr>
            </thead>
            <tbody>
              {cfg.criteria.map((c) => (
                <tr key={c.key} className={c.enabled ? "" : "opacity-40"}>
                  <td className="font-medium">{c.label}</td>
                  <td className="text-muted">{GROUP_LABEL[c.group]}</td>
                  <td className="font-mono text-xs">{c.metric}</td>
                  <td className="text-right tabular-nums">{c.maxPoints}</td>
                  <td className="font-mono text-[11px] text-muted">{c.bands.map((b) => `${b.value}→${b.points}`).join("  ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Всего доступно {total} баллов. Скор = набрано / доступно × 100.</p>
      </Card>

      <Card>
        <Kicker>Шаг 3 · Вердикт</Kicker>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <b>Масштабировать</b> — скор ≥ {cfg.verdicts.scale}: увеличивать бюджет шагами по 20–30%.
          </li>
          <li>
            <b>Держать</b> — скор ≥ {cfg.verdicts.keep}: работает в норме, наблюдать.
          </li>
          <li>
            <b>Оптимизировать</b> — скор ≥ {cfg.verdicts.optimize}: есть проблемные зоны, см. рекомендации.
          </li>
          <li>
            <b>Остановить</b> — ниже {cfg.verdicts.optimize}: стоп или перезапуск с новыми креативами/аудиториями.
          </li>
        </ul>
      </Card>
    </div>
  );
}
