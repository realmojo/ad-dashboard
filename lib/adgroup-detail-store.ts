"use client"

import type { AdGroupDetailResult } from "@/lib/naver-ad"

/**
 * 광고그룹 상세(키워드·소재)의 클라이언트 캐시.
 * 상세 패널과 hover 하이라이트가 같은 데이터를 쓰므로 한 곳에 모아둔다.
 */
const cache = new Map<string, AdGroupDetailResult>()
const inflight = new Map<string, Promise<AdGroupDetailResult>>()

export function detailCacheKey(nccAdgroupId: string, date?: string) {
  // 날짜별로 성과가 다르므로 키에 날짜를 포함한다.
  return `${nccAdgroupId}@${date ?? "today"}`
}

export function getCachedDetail(key: string) {
  return cache.get(key) ?? null
}

export function hasCachedDetail(key: string) {
  return cache.has(key)
}

/** 이미 받아둔 게 있으면 그대로, 없으면 한 번만 요청한다. */
export function loadDetail(
  nccAdgroupId: string,
  date?: string,
  platform: "naver" | "kakao" = "naver",
  campaignId?: string
): Promise<AdGroupDetailResult> {
  const key = `${platform}:${detailCacheKey(nccAdgroupId, date)}`

  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)

  const pending = inflight.get(key)
  if (pending) return pending

  // 카카오는 성과 파라미터가 없고 키워드만 돌려준다.
  // 카카오 키워드 성과는 campaignId 가 있어야 조회된다.
  const params = new URLSearchParams()
  if (date) params.set("since", date)
  if (platform === "kakao" && campaignId) params.set("campaignId", campaignId)
  const query = params.toString() ? `?${params}` : ""
  const promise = fetch(
    `/api/${platform}-ad/adgroups/${encodeURIComponent(nccAdgroupId)}${query}`
  )
    .then(async (res) => {
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "조회 실패")
      return body as AdGroupDetailResult
    })
    .then((body) => {
      cache.set(key, body)
      return body
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

/** 페이지를 새로고침할 때 호출한다. 안 비우면 갱신 후에도 옛 성과가 남는다. */
export function clearAdGroupDetailCache() {
  cache.clear()
  inflight.clear()
}
