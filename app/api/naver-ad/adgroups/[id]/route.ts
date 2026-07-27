import { NextResponse } from "next/server"

import { NaverAdError, getAdGroupDetail } from "@/lib/naver-ad"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/naver-ad/adgroups/{nccAdgroupId}
 * 해당 광고그룹의 키워드와 소재를 각각의 성과와 함께 반환한다.
 *
 * 쿼리: since, until (YYYY-MM-DD, 기본 오늘)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id.startsWith("grp-")) {
    return NextResponse.json(
      { error: "광고그룹 ID 형식이 아닙니다." },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(request.url)
  const dateFormat = /^\d{4}-\d{2}-\d{2}$/
  const since = searchParams.get("since") ?? undefined
  const until = searchParams.get("until") ?? undefined

  for (const [name, value] of [
    ["since", since],
    ["until", until],
  ] as const) {
    if (value !== undefined && !dateFormat.test(value)) {
      return NextResponse.json(
        { error: `${name} 는 YYYY-MM-DD 형식이어야 합니다.` },
        { status: 400 }
      )
    }
  }

  try {
    return NextResponse.json(await getAdGroupDetail(id, { since, until }))
  } catch (error) {
    if (error instanceof NaverAdError) {
      return NextResponse.json(
        { error: error.message, detail: error.body },
        { status: error.status }
      )
    }

    console.error("[naver-ad/adgroups]", error)
    return NextResponse.json(
      { error: "광고그룹 상세를 가져오지 못했습니다." },
      { status: 500 }
    )
  }
}
