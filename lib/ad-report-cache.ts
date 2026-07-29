import { cache } from "react"

import { getKakaoCampaigns } from "@/lib/kakao-ad"
import { getPowerLinkCampaigns } from "@/lib/naver-ad"

/**
 * 같은 요청 안에서 여러 번 불려도 한 번만 조회한다.
 *
 * 종합 탭은 네이버·카카오 본문을 각각 한 번 더 그리는데, RSC 는 같은 엘리먼트라도
 * 위치가 다르면 다시 렌더하므로 그대로 두면 API 호출이 두 배가 된다.
 * cache() 는 인자를 기준으로 묶으므로 객체 대신 날짜 문자열만 받는다.
 */
export const getNaverReport = cache((date: string) =>
  getPowerLinkCampaigns({ includeAds: false, since: date })
)

export const getKakaoReport = cache((date: string) =>
  getKakaoCampaigns({ date })
)
