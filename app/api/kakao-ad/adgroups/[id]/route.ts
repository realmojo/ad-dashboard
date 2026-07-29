import { NextResponse } from "next/server"

import { KakaoAdError, getKeywordStats, getKeywords } from "@/lib/kakao-ad"
import { EMPTY_STAT } from "@/lib/naver-ad"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/kakao-ad/adgroups/{id}
 *
 * 화면은 네이버 상세와 같은 표를 쓰므로, 카카오 응답을 같은 형태로 맞춰 돌려준다.
 * 카카오 소재는 광고그룹이 아니라 비즈채널 단위라 여기서는 키워드만 준다.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { error: "광고그룹 ID 형식이 아닙니다." },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(request.url)
  const campaignId = searchParams.get("campaignId") ?? undefined
  const since = searchParams.get("since") ?? undefined

  try {
    const [keywords, stats] = await Promise.all([
      getKeywords(id),
      campaignId
        ? getKeywordStats(campaignId, since).catch(() => new Map())
        : Promise.resolve(new Map()),
    ])

    return NextResponse.json({
      nccAdgroupId: id,
      ads: [],
      keywords: keywords.map((keyword) => ({
        nccKeywordId: keyword.id,
        nccAdgroupId: keyword.adGroupId,
        keyword: keyword.text,
        bidAmt: keyword.bidStrategy?.bidAmount ?? 0,
        // 카카오는 그룹 입찰가 사용 여부를 따로 주지 않는다.
        useGroupBidAmt: !keyword.bidStrategy?.bidAmount,
        status: keyword.config === "ON" ? "ELIGIBLE" : "PAUSED",
        statusReason: keyword.status?.[0],
        userLock: keyword.config !== "ON",
        inspectStatus: keyword.reviewStatus,
        stat: stats.get(keyword.id) ?? { ...EMPTY_STAT },
      })),
      statBaseTime: null,
      statLagMinutes: null,
      period: { since: since ?? "", until: since ?? "" },
    })
  } catch (error) {
    if (error instanceof KakaoAdError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error("[kakao-ad/adgroups]", error)
    return NextResponse.json(
      { error: "광고그룹 상세를 가져오지 못했습니다." },
      { status: 500 }
    )
  }
}
