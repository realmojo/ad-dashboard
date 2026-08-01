import { NextResponse, type NextRequest } from "next/server"

import { loadAllKeywords } from "@/lib/all-keywords-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/keywords/all?force=1 — 전체 키워드 목록 (force 면 캐시 무시) */
export async function GET(request: NextRequest) {
  const force = new URL(request.url).searchParams.get("force") === "1"
  return NextResponse.json(await loadAllKeywords(force))
}
