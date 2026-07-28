import {
  EMPTY_STAT,
  getAdGroups,
  getAds,
  getCampaigns,
  getStats,
  todayInSeoul,
} from "@/lib/naver-ad"
import { normalizeUrl } from "@/lib/url"

/**
 * 광고그룹 → 소재 랜딩 URL 목록.
 * /ncc/ads 는 광고그룹 단위로만 조회할 수 있어(캠페인·타입 일괄 조회 불가)
 * 광고그룹 수만큼 호출이 필요하다. URL 은 거의 바뀌지 않으므로 캐시해 재사용한다.
 */
const URL_CACHE_TTL_MS = 60 * 60 * 1000

let urlCache: { at: number; map: Map<string, string[]> } | null = null

async function getAdGroupUrls(): Promise<Map<string, string[]>> {
  if (urlCache && Date.now() - urlCache.at < URL_CACHE_TTL_MS) {
    return urlCache.map
  }

  const campaigns = (await getCampaigns()).filter(
    (c) => c.campaignTp === "WEB_SITE"
  )

  const map = new Map<string, string[]>()
  for (const campaign of campaigns) {
    const adgroups = await getAdGroups(campaign.nccCampaignId)
    for (const adgroup of adgroups) {
      const ads = await getAds(adgroup.nccAdgroupId)
      const urls = ads
        .flatMap((ad) => {
          const content = ad.ad ?? ad.adAttr ?? {}
          return [content.pc?.final, content.mobile?.final]
        })
        .filter((url): url is string => Boolean(url))
        .map(normalizeUrl)
        .filter(Boolean)

      if (urls.length > 0) map.set(adgroup.nccAdgroupId, [...new Set(urls)])
    }
  }

  urlCache = { at: Date.now(), map }
  return map
}

export interface UrlCost {
  /** 광고비(원, VAT 제외) */
  salesAmt: number
  /** 네이버 광고 클릭수 = 이 URL 로 유입된 방문 수 */
  clkCnt: number
  /** 이 URL 로 연결되는 광고그룹 이름들 */
  adgroupNames: string[]
}

/**
 * 정규화한 랜딩 URL → 해당 날짜의 네이버 광고비.
 * 한 URL 에 여러 광고그룹이 걸려 있으면 합산한다.
 */
export async function getUrlCostMap(
  date?: string
): Promise<Map<string, UrlCost>> {
  const since = date ?? todayInSeoul()

  const [urlsByAdgroup, campaigns] = await Promise.all([
    getAdGroupUrls(),
    getCampaigns().then((list) => list.filter((c) => c.campaignTp === "WEB_SITE")),
  ])

  const adgroups = (
    await Promise.all(campaigns.map((c) => getAdGroups(c.nccCampaignId)))
  ).flat()

  const { stats } = await getStats(
    adgroups.map((g) => g.nccAdgroupId),
    since,
    since
  )

  const result = new Map<string, UrlCost>()
  for (const adgroup of adgroups) {
    const urls = urlsByAdgroup.get(adgroup.nccAdgroupId)
    if (!urls) continue

    const stat = stats.get(adgroup.nccAdgroupId) ?? EMPTY_STAT
    for (const url of urls) {
      const current = result.get(url)
      if (current) {
        current.salesAmt += stat.salesAmt
        current.clkCnt += stat.clkCnt
        current.adgroupNames.push(adgroup.name)
      } else {
        result.set(url, {
          salesAmt: stat.salesAmt,
          clkCnt: stat.clkCnt,
          adgroupNames: [adgroup.name],
        })
      }
    }
  }

  return result
}
