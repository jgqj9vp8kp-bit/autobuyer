import { NextResponse } from "next/server";
import { storageInfo } from "@/lib/configStore";
import { isLiveMode } from "@/lib/evaluate";

/**
 * Health-чек для хостинга: без авторизации и без обращения к источникам (их статус — на странице «Источники»).
 * Возвращает режим данных и тип хранилища правил.
 */
export async function GET() {
  return NextResponse.json({ ok: true, mode: isLiveMode() ? "live" : "demo", storage: storageInfo().kind });
}
