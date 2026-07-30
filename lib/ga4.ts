import { getAccessToken } from "@/lib/google-auth"

const API_BASE = "https://analyticsdata.googleapis.com/v1beta"

export class Ga4Error extends Error {
  status: number
  body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "Ga4Error"
    this.status = status
    this.body = body
  }
}

/** GA4 속성 ID(숫자). .env 의 GA4_PROPERTY_ID 로 지정한다. */
export function getPropertyId(): string {
  const id = process.env.GA4_PROPERTY_ID?.trim()
  if (!id) {
    throw new Ga4Error(
      "GA4_PROPERTY_ID 가 없습니다. .env 에 GA4 속성 ID(숫자)를 넣어 주세요.",
      500
    )
  }
  return id.replace(/^properties\//, "")
}

interface RunReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>
  dimensions?: Array<{ name: string }>
  metrics?: Array<{ name: string }>
  dimensionFilter?: unknown
  orderBys?: unknown[]
  limit?: number
}

interface RunReportResponse {
  totals?: Array<{ metricValues: Array<{ value: string }> }>
  dimensionHeaders?: Array<{ name: string }>
  metricHeaders?: Array<{ name: string; type?: string }>
  rows?: Array<{
    dimensionValues: Array<{ value: string }>
    metricValues: Array<{ value: string }>
  }>
  rowCount?: number
}

async function runReport(
  request: RunReportRequest
): Promise<RunReportResponse> {
  const token = await getAccessToken()
  const property = getPropertyId()

  const response = await fetch(`${API_BASE}/properties/${property}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    cache: "no-store",
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = (body as { error?: { message?: string } } | null)?.error
      ?.message
    throw new Ga4Error(
      `GA4 API 오류 (HTTP ${response.status})${detail ? ` — ${detail}` : ""}`,
      response.status,
      body
    )
  }

  return body as RunReportResponse
}

export interface PageRevenueRow {
  host: string
  path: string
  /** 애드센스 연동으로 들어오는 광고 수익(USD) */
  revenue: number
  pageViews: number
  adClicks: number
  adImpressions: number
  /** 페이지 RPM = 수익 / 조회수 × 1000 */
  rpm: number
}

export interface PageRevenueResult {
  rows: PageRevenueRow[]
  /** GA4 가 알려준 전체 행 수 (limit 로 잘렸는지 판단용) */
  totalRows: number
}

/**
 * 호스트·페이지 경로별 애드센스 수익.
 * 애드센스 URL 채널(500개 제한)과 달리 페이지 수 제한이 없다.
 */
export async function getPageRevenue({
  date,
  hosts,
  limit = 200,
}: {
  /** "YYYY-MM-DD" 하루 */
  date: string
  /** 조회할 호스트. 비우면 전체 */
  hosts?: readonly string[]
  limit?: number
}): Promise<PageRevenueResult> {
  const response = await runReport({
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "hostName" }, { name: "pagePath" }],
    metrics: [
      { name: "totalAdRevenue" },
      { name: "screenPageViews" },
      { name: "publisherAdClicks" },
      { name: "publisherAdImpressions" },
    ],
    dimensionFilter:
      hosts && hosts.length > 0
        ? {
            filter: {
              fieldName: "hostName",
              inListFilter: { values: [...hosts] },
            },
          }
        : undefined,
    orderBys: [{ metric: { metricName: "totalAdRevenue" }, desc: true }],
    limit,
  })

  const rows = (response.rows ?? []).map((row) => {
    const revenue = Number(row.metricValues[0]?.value ?? 0)
    const pageViews = Number(row.metricValues[1]?.value ?? 0)
    return {
      host: row.dimensionValues[0]?.value ?? "",
      path: row.dimensionValues[1]?.value ?? "",
      revenue,
      pageViews,
      adClicks: Number(row.metricValues[2]?.value ?? 0),
      adImpressions: Number(row.metricValues[3]?.value ?? 0),
      rpm: pageViews > 0 ? (revenue / pageViews) * 1000 : 0,
    } satisfies PageRevenueRow
  })

  return { rows, totalRows: response.rowCount ?? rows.length }
}

export interface RealtimeResult {
  /** 지난 30분 동안의 활성 사용자 */
  activeUsers: number
  /** 분당 활성 사용자. 29분 전 → 0분 전 순서로 30칸을 채운다. */
  perMinute: number[]
  /** 페이지 제목별 조회수 (많은 순) */
  pages: Array<{ title: string; views: number }>
}

async function runRealtimeReport(
  request: Record<string, unknown>
): Promise<RunReportResponse> {
  const token = await getAccessToken()
  const property = getPropertyId()

  const response = await fetch(
    `${API_BASE}/properties/${property}:runRealtimeReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      cache: "no-store",
    }
  )

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = (body as { error?: { message?: string } } | null)?.error
      ?.message
    throw new Ga4Error(
      `GA4 실시간 API 오류 (HTTP ${response.status})${detail ? ` — ${detail}` : ""}`,
      response.status,
      body
    )
  }

  return body as RunReportResponse
}

/** 실시간 활성 사용자와 페이지별 조회수. */
export async function getRealtime(pageLimit = 20): Promise<RealtimeResult> {
  const [minutes, pages] = await Promise.all([
    runRealtimeReport({
      dimensions: [{ name: "minutesAgo" }],
      metrics: [{ name: "activeUsers" }],
      // 중복 제거된 총합을 같은 요청에서 받아 호출 한 건을 아낀다.
      metricAggregations: ["TOTAL"],
      limit: 30,
    }),
    runRealtimeReport({
      dimensions: [{ name: "unifiedScreenName" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: pageLimit,
    }),
  ])

  // minutesAgo 는 값이 있는 구간만 오므로 30칸을 0 으로 채워둔다.
  const perMinute = new Array<number>(30).fill(0)
  for (const row of minutes.rows ?? []) {
    const ago = Number(row.dimensionValues[0]?.value ?? -1)
    const users = Number(row.metricValues[0]?.value ?? 0)
    if (ago >= 0 && ago < 30) perMinute[29 - ago] = users
  }

  // 총 활성 사용자는 분당 값의 단순 합이 아니라 중복 제거된 수다.
  // metricAggregations 로 같은 요청의 totals 에서 받아 호출을 아낀다.
  const aggregated = minutes.totals?.[0]?.metricValues?.[0]?.value
  const activeUsers =
    aggregated !== undefined
      ? Number(aggregated) || 0
      : Number(
          (await runRealtimeReport({ metrics: [{ name: "activeUsers" }] }))
            .rows?.[0]?.metricValues?.[0]?.value ?? 0
        )

  return {
    activeUsers,
    perMinute,
    pages: (pages.rows ?? []).map((row) => ({
      title: row.dimensionValues[0]?.value ?? "",
      views: Number(row.metricValues[0]?.value ?? 0),
    })),
  }
}
