import { createHmac } from "node:crypto"

const BASE_URL = "https://api.searchad.naver.com"

/**
 * 네이버 검색광고 API 인증 정보.
 * 검색광고 시스템 > 도구 > API 사용관리 에서 발급받는다.
 */
function getCredentials() {
  // NAVER_AD_* 를 우선 사용하고, 없으면 NAVER_* 이름으로도 받는다.
  const accessLicense =
    process.env.NAVER_AD_ACCESS_KEY || process.env.NAVER_ACCESS_LICENSE || ""
  const secretKey =
    process.env.NAVER_AD_SECRET_KEY || process.env.NAVER_SECRET_KEY || ""
  const customerId =
    process.env.NAVER_AD_CUSTOMER_ID || process.env.NAVER_CUSTOMER_ID || ""

  const missing = [
    !accessLicense && "NAVER_AD_ACCESS_KEY",
    !secretKey && "NAVER_AD_SECRET_KEY",
    !customerId && "NAVER_AD_CUSTOMER_ID",
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new NaverAdError(
      `네이버 검색광고 API 환경변수가 설정되지 않았습니다: ${missing.join(", ")}`,
      500
    )
  }

  return { accessLicense, secretKey, customerId }
}

export class NaverAdError extends Error {
  status: number
  body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "NaverAdError"
    this.status = status
    this.body = body
  }
}

/**
 * `{timestamp}.{method}.{path}` 를 secretKey 로 HMAC-SHA256 서명한 뒤 base64 로 인코딩.
 * 서명 대상 path 에는 쿼리스트링이 포함되지 않는다.
 */
function createSignature(
  secretKey: string,
  timestamp: string,
  method: string,
  path: string
) {
  return createHmac("sha256", secretKey)
    .update(`${timestamp}.${method}.${path}`)
    .digest("base64")
}

type QueryValue = string | number | boolean | undefined | null

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 검색광고 API 는 짧은 시간에 요청이 몰리면 429 를 반환한다.
 * 모든 요청이 최소 MIN_INTERVAL_MS 간격을 두고 나가도록 직렬화한다.
 */
const MIN_INTERVAL_MS = 120
let gate: Promise<void> = Promise.resolve()

function acquireSlot(): Promise<void> {
  const wait = gate.then(() => sleep(MIN_INTERVAL_MS))
  gate = wait
  return wait
}

/** 429(요청 제한) / 5xx 응답은 지수 백오프로 재시도한다. */
const MAX_RETRIES = 5

/** 같은 키를 여러 번 보내야 하는 경우(/stats 의 ids)는 URLSearchParams 를 그대로 넘긴다. */
type Query = Record<string, QueryValue> | URLSearchParams

function toSearchParams(query: Query): URLSearchParams {
  if (query instanceof URLSearchParams) return query

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  return search
}

async function requestOnce<T>(
  path: string,
  query: Query
): Promise<{ ok: true; data: T } | { ok: false; error: NaverAdError }> {
  const { accessLicense, secretKey, customerId } = getCredentials()
  const method = "GET"
  const timestamp = Date.now().toString()
  const signature = createSignature(secretKey, timestamp, method, path)

  const qs = toSearchParams(query).toString()

  const response = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": accessLicense,
      "X-CUSTOMER": customerId,
      "X-Signature": signature,
    },
    cache: "no-store",
  })

  const text = await response.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // JSON 이 아니면 원문 그대로 둔다.
  }

  if (!response.ok) {
    const message =
      (body as { title?: string; message?: string } | null)?.title ??
      (body as { message?: string } | null)?.message ??
      `네이버 검색광고 API 요청 실패 (${path})`
    return {
      ok: false,
      error: new NaverAdError(message, response.status, body),
    }
  }

  return { ok: true, data: body as T }
}

async function request<T>(path: string, query: Query = {}): Promise<T> {
  let lastError: NaverAdError | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await acquireSlot()
    const result = await requestOnce<T>(path, query)
    if (result.ok) return result.data

    lastError = result.error
    const retryable = result.error.status === 429 || result.error.status >= 500
    if (!retryable || attempt === MAX_RETRIES) break

    // 500ms, 1s, 2s, 4s, 8s
    await sleep(500 * 2 ** attempt)
  }

  throw lastError!
}

/** 캠페인 유형. 파워링크는 WEB_SITE 이다. */
export type CampaignType =
  "WEB_SITE" | "SHOPPING" | "POWER_CONTENTS" | "BRAND_SEARCH" | "PLACE"

export interface Campaign {
  nccCampaignId: string
  customerId: number
  name: string
  campaignTp: CampaignType
  dailyBudget: number
  useDailyBudget: boolean
  status: string
  statusReason?: string
  userLock: boolean
  deliveryMethod?: string
  trackingMode?: string
  regTm?: string
  editTm?: string
}

export interface AdGroup {
  nccAdgroupId: string
  nccCampaignId: string
  name: string
  bidAmt: number
  dailyBudget: number
  useDailyBudget: boolean
  status: string
  statusReason?: string
  userLock: boolean
  adgroupType?: string
  mobileChannelId?: string
  pcChannelId?: string
  regTm?: string
  editTm?: string
}

export interface Ad {
  nccAdId: string
  nccAdgroupId: string
  adAttr?: {
    headline?: string
    description?: string
    pc?: { final?: string; display?: string }
    mobile?: { final?: string; display?: string }
  }
  ad?: {
    headline?: string
    description?: string
    pc?: { final?: string; display?: string }
    mobile?: { final?: string; display?: string }
  }
  type?: string
  status: string
  statusReason?: string
  inspectStatus?: string
  userLock: boolean
  regTm?: string
  editTm?: string
}

export interface Keyword {
  nccKeywordId: string
  nccAdgroupId: string
  keyword: string
  bidAmt: number
  useGroupBidAmt: boolean
  status: string
  statusReason?: string
  userLock: boolean
  inspectStatus?: string
  links?: { pc?: string; mobile?: string }
  /** 품질지수 (1~7) */
  nccQi?: { qiGrade: number }
}

/** 전체 캠페인 목록 조회. */
export function getCampaigns(recordSize = 1000) {
  return request<Campaign[]>("/ncc/campaigns", { recordSize })
}

/** 특정 캠페인의 광고그룹 목록 조회. */
export function getAdGroups(nccCampaignId: string, recordSize = 1000) {
  return request<AdGroup[]>("/ncc/adgroups", { nccCampaignId, recordSize })
}

/** 특정 광고그룹의 소재(광고) 목록 조회. */
export function getAds(nccAdgroupId: string) {
  return request<Ad[]>("/ncc/ads", { nccAdgroupId })
}

/** 특정 광고그룹의 키워드 목록 조회. */
export function getKeywords(nccAdgroupId: string) {
  return request<Keyword[]>("/ncc/keywords", { nccAdgroupId })
}

export interface Stat {
  /** 노출수 */
  impCnt: number
  /** 클릭수 */
  clkCnt: number
  /** 클릭률(%) */
  ctr: number
  /** 평균 클릭비용(원) */
  cpc: number
  /** 총비용(원) */
  salesAmt: number
  /** 평균 노출순위 */
  avgRnk: number
}

export const EMPTY_STAT: Stat = {
  impCnt: 0,
  clkCnt: 0,
  ctr: 0,
  cpc: 0,
  salesAmt: 0,
  avgRnk: 0,
}

const STAT_FIELDS = [
  "impCnt",
  "clkCnt",
  "ctr",
  "cpc",
  "salesAmt",
  "avgRnk",
] as const

/** 검색광고 리포트 기준 시간대(KST)의 YYYY-MM-DD */
export function todayInSeoul(): string {
  // en-CA 로케일은 YYYY-MM-DD 형식을 준다.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** /stats 는 한 번에 조회 가능한 id 수에 제한이 있어 나눠서 호출한다. */
const STAT_CHUNK_SIZE = 50

/**
 * 캠페인/광고그룹/키워드 id 에 대한 기간별 성과 조회.
 * 데이터가 없는 id 는 응답에서 빠지므로 0 으로 채워 반환한다.
 */
export interface StatsResult {
  stats: Map<string, Stat>
  /**
   * 집계 기준 시각(KST, YYYYMMDDHHmm).
   * /stats 는 실시간이 아니라 이 시각까지 집계된 값을 준다.
   * 검색광고 UI 의 실시간 현황과 차이가 나는 주된 이유다.
   */
  cycleBaseTm?: string
  /** 응답 생성 시각(KST, YYYYMMDDHHmm) */
  compTm?: string
}

/** "202607271700" → "2026-07-27 17:00" */
export function formatStatTime(value?: string): string | null {
  if (!value || value.length < 12) return null
  const [, y, m, d, hh, mm] =
    value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/) ?? []
  if (!y) return null
  return `${y}-${m}-${d} ${hh}:${mm}`
}

/** "202607271700"(KST) 이 지금으로부터 몇 분 전인지. 파싱 실패 시 null. */
export function minutesSince(value?: string): number | null {
  if (!value) return null
  const [, y, m, d, hh, mm] =
    value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/) ?? []
  if (!y) return null
  // 검색광고 리포트 시각은 KST(+09:00) 기준이다.
  const at = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:00+09:00`)
  if (Number.isNaN(at)) return null
  return Math.max(0, Math.round((Date.now() - at) / 60_000))
}

export async function getStats(
  ids: string[],
  since: string,
  until: string = since
): Promise<StatsResult> {
  const result = new Map<string, Stat>()
  for (const id of ids) result.set(id, { ...EMPTY_STAT })
  if (ids.length === 0) return { stats: result }

  let cycleBaseTm: string | undefined
  let compTm: string | undefined

  // /stats 는 한 요청에 서로 다른 타입의 id 를 섞을 수 없다.
  // (cmp-=캠페인, grp-=광고그룹, nkw-=키워드, nad-=소재)
  const byType = new Map<string, string[]>()
  for (const id of ids) {
    const type = id.split("-")[0] ?? id
    const bucket = byType.get(type)
    if (bucket) bucket.push(id)
    else byType.set(type, [id])
  }

  const chunks: string[][] = []
  for (const sameType of byType.values()) {
    for (let i = 0; i < sameType.length; i += STAT_CHUNK_SIZE) {
      chunks.push(sameType.slice(i, i + STAT_CHUNK_SIZE))
    }
  }

  for (const chunk of chunks) {
    // ids 는 반복 파라미터라 URLSearchParams 로 직접 조립한다.
    const search = new URLSearchParams()
    for (const id of chunk) search.append("ids", id)
    search.set("fields", JSON.stringify(STAT_FIELDS))
    search.set("timeRange", JSON.stringify({ since, until }))

    const response = await request<{
      data?: Array<Stat & { id: string }>
      cycleBaseTm?: string
      compTm?: string
    }>("/stats", search)

    cycleBaseTm ??= response.cycleBaseTm
    compTm ??= response.compTm

    for (const row of response.data ?? []) {
      const { id, ...rest } = row
      result.set(id, { ...EMPTY_STAT, ...rest })
    }
  }

  return { stats: result, cycleBaseTm, compTm }
}

/**
 * Promise 를 동시 실행 개수 제한을 두고 처리한다.
 * 검색광고 API 는 초당 요청 수 제한이 있어 무제한 병렬 호출은 피한다.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await fn(items[index]!, index)
      }
    })()
  )

  await Promise.all(workers)
  return results
}

export interface PowerLinkAdGroup extends AdGroup {
  ads: Ad[]
  keywords: Keyword[]
  /** 조회 기간(기본 오늘) 성과 */
  stat: Stat
}

export interface PowerLinkCampaign extends Campaign {
  adgroups: PowerLinkAdGroup[]
  stat: Stat
}

export interface GetPowerLinkOptions {
  /** 소재 포함 여부 (기본 true) */
  includeAds?: boolean
  /** 키워드 포함 여부 (기본 false) */
  includeKeywords?: boolean
  /** 성과 조회 시작일 YYYY-MM-DD (기본 오늘, KST) */
  since?: string
  /** 성과 조회 종료일 YYYY-MM-DD (기본 since 와 동일) */
  until?: string
}

/**
 * 내가 등록한 파워링크(캠페인 유형 WEB_SITE) 목록을
 * 캠페인 > 광고그룹 > 소재/키워드 계층으로 조회한다.
 */
export interface PowerLinkTotals {
  /** 파워링크 캠페인 전체의 총비용(원, VAT 제외) */
  salesAmt: number
  impCnt: number
  clkCnt: number
  statBaseTime: string | null
}

/**
 * 파워링크 합계만 가볍게 조회한다(캠페인 목록 + 캠페인 레벨 통계, 2회 호출).
 * 광고그룹까지 훑는 getPowerLinkCampaigns 와 달리 요약 표시용이다.
 */
export async function getPowerLinkTotals(
  options: { since?: string; until?: string } = {}
): Promise<PowerLinkTotals> {
  const { since = todayInSeoul(), until = since } = options

  const campaigns = (await getCampaigns()).filter(
    (c) => c.campaignTp === "WEB_SITE"
  )
  const { stats, cycleBaseTm } = await getStats(
    campaigns.map((c) => c.nccCampaignId),
    since,
    until
  )

  const total = campaigns.reduce(
    (acc, campaign) => {
      const stat = stats.get(campaign.nccCampaignId) ?? EMPTY_STAT
      return {
        salesAmt: acc.salesAmt + stat.salesAmt,
        impCnt: acc.impCnt + stat.impCnt,
        clkCnt: acc.clkCnt + stat.clkCnt,
      }
    },
    { salesAmt: 0, impCnt: 0, clkCnt: 0 }
  )

  return { ...total, statBaseTime: formatStatTime(cycleBaseTm) }
}

export interface KeywordWithStat extends Keyword {
  stat: Stat
}

export interface AdWithStat extends Ad {
  stat: Stat
}

export interface AdGroupDetailResult {
  nccAdgroupId: string
  keywords: KeywordWithStat[]
  ads: AdWithStat[]
  statBaseTime: string | null
  statLagMinutes: number | null
  period: { since: string; until: string }
}

/**
 * 광고그룹 하나의 키워드·소재를 각각의 성과와 함께 조회한다.
 * 목록 화면에서 전부 미리 불러오면 요청 수가 폭증하므로 클릭 시점에만 호출한다.
 */
export async function getAdGroupDetail(
  nccAdgroupId: string,
  options: { since?: string; until?: string } = {}
): Promise<AdGroupDetailResult> {
  const { since = todayInSeoul(), until = since } = options

  const [keywords, ads] = await Promise.all([
    getKeywords(nccAdgroupId),
    getAds(nccAdgroupId),
  ])

  // 키워드(nkw-)와 소재(nad-)는 타입이 달라 /stats 가 한 번에 못 받지만,
  // getStats 가 id 접두어별로 나눠 호출해준다.
  const { stats, cycleBaseTm } = await getStats(
    [...keywords.map((k) => k.nccKeywordId), ...ads.map((a) => a.nccAdId)],
    since,
    until
  )

  return {
    nccAdgroupId,
    keywords: keywords.map((keyword) => ({
      ...keyword,
      stat: stats.get(keyword.nccKeywordId) ?? { ...EMPTY_STAT },
    })),
    ads: ads.map((ad) => ({
      ...ad,
      stat: stats.get(ad.nccAdId) ?? { ...EMPTY_STAT },
    })),
    statBaseTime: formatStatTime(cycleBaseTm),
    statLagMinutes: minutesSince(cycleBaseTm),
    period: { since, until },
  }
}

export interface PowerLinkReport {
  campaigns: PowerLinkCampaign[]
  /** 성과 집계 기준 시각 "YYYY-MM-DD HH:mm" (KST). 실시간이 아니라는 점을 표시하기 위함. */
  statBaseTime: string | null
  /** 집계 기준 시각이 몇 분 전인지. 이 시간만큼의 노출·클릭이 아직 빠져 있다. */
  statLagMinutes: number | null
  period: { since: string; until: string }
}

export async function getPowerLinkCampaigns(
  options: GetPowerLinkOptions = {}
): Promise<PowerLinkReport> {
  const {
    includeAds = true,
    includeKeywords = false,
    since = todayInSeoul(),
    until = since,
  } = options

  const campaigns = await getCampaigns()
  const powerLink = campaigns.filter((c) => c.campaignTp === "WEB_SITE")

  const withAdgroups = await mapWithConcurrency(
    powerLink,
    3,
    async (campaign) => {
      const adgroups = await getAdGroups(campaign.nccCampaignId)

      const detailed = await mapWithConcurrency(adgroups, 3, async (group) => {
        const [ads, keywords] = await Promise.all([
          includeAds ? getAds(group.nccAdgroupId) : Promise.resolve([]),
          includeKeywords
            ? getKeywords(group.nccAdgroupId)
            : Promise.resolve([]),
        ])
        return { ...group, ads, keywords }
      })

      return { campaign, adgroups: detailed }
    }
  )

  // 캠페인 + 광고그룹 id 를 한 번에 모아 성과를 조회한다.
  const statIds = [
    ...withAdgroups.map((c) => c.campaign.nccCampaignId),
    ...withAdgroups.flatMap((c) => c.adgroups.map((g) => g.nccAdgroupId)),
  ]
  const { stats, cycleBaseTm } = await getStats(statIds, since, until)

  const campaignsWithStats = withAdgroups.map(({ campaign, adgroups }) => ({
    ...campaign,
    stat: stats.get(campaign.nccCampaignId) ?? { ...EMPTY_STAT },
    adgroups: adgroups.map((group) => ({
      ...group,
      stat: stats.get(group.nccAdgroupId) ?? { ...EMPTY_STAT },
    })) satisfies PowerLinkAdGroup[],
  })) satisfies PowerLinkCampaign[]

  return {
    campaigns: campaignsWithStats,
    statBaseTime: formatStatTime(cycleBaseTm),
    statLagMinutes: minutesSince(cycleBaseTm),
    period: { since, until },
  }
}

export interface FlatKeyword {
  platform: "naver" | "kakao"
  /** 어느 광고그룹의 키워드인지 */
  adgroupId: string
  adgroupName: string
  keywordId: string
  keyword: string
  bidAmt: number
  useGroupBidAmt: boolean
  status: string
  statusReason?: string
  inspectStatus?: string
  userLock: boolean
  qiGrade?: number
}

/**
 * 모든 광고그룹의 키워드를 한 번에 모은다.
 * 광고그룹 수만큼 호출이 필요해(일괄 조회 API 없음) 요청 간격 게이트에 맡긴다.
 */
export async function getAllKeywords(): Promise<FlatKeyword[]> {
  const campaigns = (await getCampaigns()).filter(
    (c) => c.campaignTp === "WEB_SITE"
  )

  const adgroups = (
    await Promise.all(campaigns.map((c) => getAdGroups(c.nccCampaignId)))
  ).flat()

  const perGroup = await mapWithConcurrency(adgroups, 3, async (group) => {
    const keywords = await getKeywords(group.nccAdgroupId).catch(() => [])
    return keywords.map((keyword): FlatKeyword => ({
      platform: "naver",
      adgroupId: group.nccAdgroupId,
      adgroupName: group.name,
      keywordId: keyword.nccKeywordId,
      keyword: keyword.keyword,
      bidAmt: keyword.bidAmt,
      useGroupBidAmt: keyword.useGroupBidAmt,
      status: keyword.status,
      statusReason: keyword.statusReason,
      inspectStatus: keyword.inspectStatus,
      userLock: keyword.userLock,
      qiGrade: keyword.nccQi?.qiGrade,
    }))
  })

  return perGroup.flat()
}
