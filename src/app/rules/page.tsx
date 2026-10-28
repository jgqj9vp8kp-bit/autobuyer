import { RulesEditor } from "@/components/RulesEditor";
import { loadAllConfigs } from "@/lib/configStore";
import { DEFAULT_PRODUCT, isProductKey } from "@/lib/products";

export const dynamic = "force-dynamic";

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const sp = await searchParams;
  const configs = await loadAllConfigs();
  const initialProduct = isProductKey(sp.product) ? sp.product : DEFAULT_PRODUCT;
  return (
    <div className="fade-up space-y-6">
      <header>
        <div className="kicker">Правила скоринга</div>
        <h1 className="mt-1 text-3xl font-bold">Как начисляются баллы</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Каждый критерий даёт до N баллов по порогам. Итоговый скор = набранные баллы / максимум по критериям, для которых хватило данных, × 100. Вердикт определяется порогами справа вверху. Правила задаются отдельно для
          каждого продукта: продукт кампании определяется по домену воронки в PostHog или по названию кампании (см. «Источники»).
        </p>
      </header>
      <RulesEditor initial={configs} initialProduct={initialProduct} />
    </div>
  );
}
