import { NextResponse } from "next/server"

import { Ga4Error, getRealtime } from "@/lib/ga4"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ga4/realtime — 지난 30분 활성 사용자와 페이지별 조회수 */
export async function GET() {
  try {
    return NextResponse.json(await getRealtime())
  } catch (error) {
    if (error instanceof Ga4Error) {
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
