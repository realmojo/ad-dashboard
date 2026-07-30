import { NextResponse } from "next/server"

import { Ga4Error, getRealtime, type RealtimeResult } from "@/lib/ga4"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * 실시간 쿼터는 하루 한도가 있어 호출을 아껴야 한다.
 * 짧게 캐시해 여러 탭·잦은 새로고침이 같은 응답을 나눠 쓰게 한다.
 */
const CACHE_MS = 25_000

let cached: { at: number; data: RealtimeResult } | null = null

/** GET /api/ga4/realtime — 지난 30분 활성 사용자와 페이지별 조회수 */
export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.data)
  }

  try {
    const data = await getRealtime()
    cached = { at: Date.now(), data }
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Ga4Error) {
      // 쿼터가 바닥나면 직전 값이라도 보여 준다.
      if (error.status === 429 && cached) {
        return NextResponse.json({ ...cached.data, stale: true })
      }
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error("[ga4/realtime]", error)
    return NextResponse.json(
      { error: "실시간 데이터를 가져오지 못했습니다." },
      { status: 500 }
    )
  }
}
