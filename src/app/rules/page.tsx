import { RulesEditor } from "@/components/RulesEditor";
import { loadConfig } from "@/lib/configStore";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const cfg = await loadConfig();
  return (
    <div className="fade-up space-y-6">
      <header>
        <div className="kicker">Правила скоринга</div>
        <h1 className="mt-1 text-3xl font-bold">Как начисляются баллы</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Каждый критерий даёт до N баллов по порогам. Итоговый скор = набранные баллы / максимум по критериям, для которых хватило данных, × 100. Вердикт определяется порогами справа вверху.
        </p>
      </header>
      <RulesEditor initial={cfg} />
    </div>
  );
}
