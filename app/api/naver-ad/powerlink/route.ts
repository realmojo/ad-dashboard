import { NextResponse } from "next/server";

import { NaverAdError, getPowerLinkCampaigns } from "@/lib/naver-ad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/naver-ad/powerlink
 *
 * 쿼리 파라미터
 *  - ads=0        소재 조회 생략
 *  - keywords=1   키워드까지 함께 조회
 *  - since,until  성과 조회 기간 YYYY-MM-DD (기본: 오늘 하루)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeAds = searchParams.get("ads") !== "0";
  const includeKeywords = searchParams.get("keywords") === "1";

  const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
  const since = searchParams.get("since") ?? undefined;
  const until = searchParams.get("until") ?? undefined;

  for (const [name, value] of [
    ["since", since],
    ["until", until],
  ] as const) {
    if (value !== undefined && !dateFormat.test(value)) {
      return NextResponse.json(
        { error: `${name} 는 YYYY-MM-DD 형식이어야 합니다.` },
        { status: 400 },
      );
    }
  }

  try {
    const { campaigns, statBaseTime, statLagMinutes, period } =
      await getPowerLinkCampaigns({
        includeAds,
        includeKeywords,
        since,
        until,
      });

    return NextResponse.json({
      campaignCount: campaigns.length,
      adgroupCount: campaigns.reduce((sum, c) => sum + c.adgroups.length, 0),
      period,
      // /stats 는 실시간이 아니다. 이 시각까지 집계된 값이라 UI 와 차이가 날 수 있다.
      statBaseTime,
      statLagMinutes,
      campaigns,
    });
  } catch (error) {
    if (error instanceof NaverAdError) {
      return NextResponse.json(
        { error: error.message, detail: error.body },
        { status: error.status },
      );
    }

    console.error("[naver-ad/powerlink]", error);
    return NextResponse.json(
      { error: "파워링크 목록을 가져오지 못했습니다." },
      { status: 500 },
    );
  }
}
