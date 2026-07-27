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
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      "GA4 리포트 조회 실패"
    throw new Ga4Error(message, response.status, body)
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
