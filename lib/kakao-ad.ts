import { EMPTY_STAT, todayInSeoul, type Stat } from "@/lib/naver-ad"

const BASE_URL = "https://api.keywordad.kakao.com"

export class KakaoAdError extends Error {
  status: number
  body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "KakaoAdError"
    this.status = status
    this.body = body
  }
}

function getCredentials() {
  const token = process.env.KAKAO_ACCESS_TOKEN?.trim()
  const adAccountId = process.env.KAKAO_AD_ACCOUNT_ID?.trim()

  const missing = [
    !token && "KAKAO_ACCESS_TOKEN",
    !adAccountId && "KAKAO_AD_ACCOUNT_ID",
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new KakaoAdError(
      `카카오 키워드광고 환경변수가 없습니다: ${missing.join(", ")}. \`npm run kakao:auth\` 로 인증하세요.`,
      500
    )
  }
  return { token: token!, adAccountId: adAccountId! }
}

/** 보고서 API 는 초당 5건 제한이 있어 요청 간격을 둔다. */
const MIN_INTERVAL_MS = 220
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

let gate: Promise<void> = Promise.resolve()

function acquireSlot(): Promise<void> {
  const wait = gate.then(() => sleep(MIN_INTERVAL_MS))
  gate = wait
  return wait
}

async function request<T>(
  path: string,
  query: Record<string, string | number | undefined> = {}
): Promise<T> {
  const { token, adAccountId } = getCredentials()

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue
    search.set(key, String(value))
  }
  const qs = search.toString()

  await acquireSlot()

  const response = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, adAccountId },
    cache: "no-store",
  })

  const text = await response.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // JSON 이 아니면 원문을 남긴다.
  }

  if (!response.ok) {
    const detail = (body as { msg?: string } | null)?.msg
    throw new KakaoAdError(
      `카카오 API 오류 (HTTP ${response.status} · ${path})${detail ? ` — ${detail}` : ""}`,
      response.status,
      body
    )
  }

  return body as T
}

export interface KakaoCampaign {
  id: string
  name: string
  config: string
  bizChannelId: string
  dailyBudgetAmount: number
  /** 예: ["OFF_BY_BIZ_CHANNEL_WAITING"] */
  status: string[]
}

export interface KakaoAdGroup {
  id: string
  campaignId: string
  name: string
  config: string
  status: string[]
  dailyBudgetAmount: number
  bidAmount: number
}

export interface KakaoKeyword {
  id: string
  adGroupId: string
  text: string
  config: string
  status: string[]
  reviewStatus?: string
  bidStrategy?: { type?: string; bidAmount?: number }
  landingInfo?: {
    rspvLandingUrl?: string | null
    pcLandingUrl?: string | null
    mobileLandingUrl?: string | null
  }
}

export interface KakaoCreative {
  id: string
  name: string
  title: string
  description: string
  bizChannelId: string
  config: string
  landingUrl?: string
}

export function getCampaigns() {
  return request<KakaoCampaign[]>("/openapi/v1/campaigns")
}

export function getAdGroups(campaignId: string) {
  return request<KakaoAdGroup[]>("/openapi/v1/adGroups", { campaignId })
}

export function getKeywords(adGroupId: string) {
  return request<KakaoKeyword[]>("/openapi/v1/keywords", { adGroupId })
}

/** 소재는 광고그룹이 아니라 비즈채널 단위로 조회한다. */
export async function getCreatives(bizChannelId: string) {
  const body = await request<{ content?: KakaoCreative[] }>(
    "/openapi/v1/creatives/basic",
    { bizChannelId }
  )
  return body.content ?? []
}

/** 카카오 보고서는 yyyyMMdd 형식을 쓴다. */
function toKakaoDate(date: string) {
  return date.replace(/-/g, "")
}

interface ReportRow {
  dimensions?: Record<string, string>
  metrics?: Record<string, string | number>
}

/**
 * 보고서 조회. BASIC 그룹은 imp / click / spending / ctr 을 준다.
 * 광고그룹·키워드 보고서는 campaignId 가 없으면 400 을 돌려준다.
 */
async function getReport(
  level: "campaigns" | "adGroups" | "keywords",
  date: string,
  campaignId?: string
): Promise<Map<string, Stat>> {
  const day = toKakaoDate(date)
  const body = await request<{ data?: ReportRow[] }>(
    `/openapi/v1/${level}/report`,
    { start: day, end: day, metricsGroups: "BASIC", campaignId }
  )

  const result = new Map<string, Stat>()
  for (const row of body.data ?? []) {
    // 레벨마다 dimensions 키가 다르므로 id 로 보이는 값을 집는다.
    const id =
      row.dimensions?.[
        level === "campaigns"
          ? "campaignId"
          : level === "adGroups"
            ? "adGroupId"
            : "keywordId"
      ]
    if (!id) continue

    const impCnt = Number(row.metrics?.imp ?? 0) || 0
    const clkCnt = Number(row.metrics?.click ?? 0) || 0
    const salesAmt = Number(row.metrics?.spending ?? 0) || 0
    result.set(id, {
      impCnt,
      clkCnt,
      salesAmt,
      ctr: impCnt > 0 ? (clkCnt / impCnt) * 100 : 0,
      cpc: clkCnt > 0 ? salesAmt / clkCnt : 0,
      avgRnk: Number(row.metrics?.rank ?? 0) || 0,
    })
  }
  return result
}

/** 키워드 단위 성과. 화면 상세에서 쓴다. */
export function getKeywordStats(campaignId: string, date?: string) {
  return getReport("keywords", date ?? todayInSeoul(), campaignId)
}

/** 카카오 상태 배열을 네이버와 같은 형태(단일 코드)로 줄인다. */
function reduceStatus(config: string, status: string[]) {
  if (config !== "ON") return { status: "PAUSED", userLock: true }
  const blocking = status.find((s) => s !== "ON")
  return blocking
    ? { status: blocking, userLock: false }
    : { status: "ELIGIBLE", userLock: false }
}

export interface KakaoAdGroupWithStat {
  /** 화면에서 네이버 광고그룹과 같은 표를 쓰기 위해 이름을 맞춘다. */
  nccAdgroupId: string
  nccCampaignId: string
  name: string
  bidAmt: number
  dailyBudget: number
  useDailyBudget: boolean
  status: string
  userLock: boolean
  stat: Stat
}

export interface KakaoCampaignWithStat {
  nccCampaignId: string
  name: string
  bizChannelId: string
  dailyBudget: number
  useDailyBudget: boolean
  status: string
  userLock: boolean
  stat: Stat
  adgroups: KakaoAdGroupWithStat[]
}

export interface KakaoReport {
  campaigns: KakaoCampaignWithStat[]
  period: { since: string; until: string }
}

/** 캠페인 · 광고그룹과 그날의 성과를 함께 가져온다. */
export async function getKakaoCampaigns(
  options: { date?: string } = {}
): Promise<KakaoReport> {
  const date = options.date ?? todayInSeoul()

  const campaigns = await getCampaigns()
  const campaignStats = await getReport("campaigns", date)

  const result: KakaoCampaignWithStat[] = []
  for (const campaign of campaigns) {
    const [adgroups, adgroupStats] = await Promise.all([
      getAdGroups(campaign.id),
      getReport("adGroups", date, campaign.id),
    ])

    const campaignState = reduceStatus(campaign.config, campaign.status)
    result.push({
      nccCampaignId: campaign.id,
      name: campaign.name,
      bizChannelId: campaign.bizChannelId,
      dailyBudget: campaign.dailyBudgetAmount,
      useDailyBudget: campaign.dailyBudgetAmount > 0,
      ...campaignState,
      stat: campaignStats.get(campaign.id) ?? { ...EMPTY_STAT },
      adgroups: adgroups.map((group) => ({
        nccAdgroupId: group.id,
        nccCampaignId: group.campaignId,
        name: group.name,
        bidAmt: group.bidAmount,
        dailyBudget: group.dailyBudgetAmount,
        useDailyBudget: group.dailyBudgetAmount > 0,
        ...reduceStatus(group.config, group.status),
        stat: adgroupStats.get(group.id) ?? { ...EMPTY_STAT },
      })),
    })
  }

  return { campaigns: result, period: { since: date, until: date } }
}
