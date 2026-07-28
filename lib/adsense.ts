import { getAccessToken, loadOAuthClient } from "@/lib/google-auth"

const TOKEN_URI = "https://oauth2.googleapis.com/token"
const AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
const API_BASE = "https://adsense.googleapis.com/v2"

export const ADSENSE_SCOPE = "https://www.googleapis.com/auth/adsense.readonly"
export const ANALYTICS_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly"

export class AdSenseError extends Error {
  status: number
  body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "AdSenseError"
    this.status = status
    this.body = body
  }
}

/** 최초 1회 사용자 동의를 받기 위한 URL. */
export function buildConsentUrl(redirectUri: string) {
  const { clientId } = loadOAuthClient()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ADSENSE_SCOPE,
    // refresh token 을 받으려면 offline + consent 가 필요하다.
    access_type: "offline",
    prompt: "consent",
  })
  return `${AUTH_URI}?${params.toString()}`
}

/** 동의 후 받은 authorization code 를 refresh token 으로 교환한다. */
export async function exchangeCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = loadOAuthClient()

  const response = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  const body = (await response.json()) as {
    refresh_token?: string
    access_token?: string
    error_description?: string
    error?: string
  }

  if (!response.ok) {
    throw new AdSenseError(
      body.error_description ?? body.error ?? "토큰 교환 실패",
      response.status,
      body
    )
  }

  return body
}

async function apiGet<T>(
  path: string,
  query: Record<string, string | string[] | undefined> = {}
): Promise<T> {
  const token = await getAccessToken()

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const v of value) search.append(key, v)
    else search.set(key, value)
  }
  const qs = search.toString()

  const response = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = (body as { error?: { message?: string } } | null)?.error
      ?.message
    throw new AdSenseError(
      `애드센스 API 오류 (HTTP ${response.status} · ${path})${detail ? ` — ${detail}` : ""}`,
      response.status,
      body
    )
  }

  return body as T
}

export interface AdSenseAccount {
  /** "accounts/pub-XXXXXXXXXXXXXXXX" */
  name: string
  displayName: string
  timeZone?: { id: string }
  createTime?: string
  pendingTasks?: string[]
}

/** 접근 가능한 애드센스 계정 목록. */
export async function listAccounts() {
  const body = await apiGet<{ accounts?: AdSenseAccount[] }>("/accounts")
  return body.accounts ?? []
}

export interface SavedReport {
  /** "accounts/pub-xxx/reports/1234567890" */
  name: string
  title: string
}

/** 애드센스에 저장해둔 보고서 목록. */
export async function listSavedReports(account: string) {
  const body = await apiGet<{ savedReports?: SavedReport[] }>(
    `/${account}/reports/saved`,
    { pageSize: "100" }
  )
  return body.savedReports ?? []
}

export interface ReportRow {
  cells: Array<{ value?: string }>
}

export interface ReportResult {
  headers?: Array<{ name: string; type: string; currencyCode?: string }>
  rows?: ReportRow[]
  totals?: ReportRow
  averages?: ReportRow
  startDate?: { year: number; month: number; day: number }
  endDate?: { year: number; month: number; day: number }
  totalMatchedRows?: string
  warnings?: string[]
}

export const DEFAULT_METRICS = [
  "ESTIMATED_EARNINGS",
  "PAGE_VIEWS",
  "IMPRESSIONS",
  "CLICKS",
  "IMPRESSIONS_CTR",
  "COST_PER_CLICK",
  "PAGE_VIEWS_RPM",
  "IMPRESSIONS_RPM",
] as const

export type DateRange =
  | "TODAY"
  | "YESTERDAY"
  | "MONTH_TO_DATE"
  | "YEAR_TO_DATE"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "CUSTOM"

/**
 * "YYYY-MM-DD" 하루를 조회하기 위한 쿼리 파라미터.
 * AdSense 는 dateRange=CUSTOM 과 함께 startDate/endDate 를 개별 필드로 받는다.
 */
function singleDayParams(date: string): Record<string, string> {
  const [year, month, day] = date.split("-")
  return {
    dateRange: "CUSTOM",
    "startDate.year": year!,
    "startDate.month": String(Number(month)),
    "startDate.day": String(Number(day)),
    "endDate.year": year!,
    "endDate.month": String(Number(month)),
    "endDate.day": String(Number(day)),
  }
}

/** date(YYYY-MM-DD)가 있으면 CUSTOM 하루로, 없으면 dateRange 프리셋으로. */
function periodParams(
  dateRange: DateRange,
  date?: string
): Record<string, string> {
  return date ? singleDayParams(date) : { dateRange }
}

export interface GenerateReportOptions {
  dateRange?: DateRange
  /** 특정 하루 "YYYY-MM-DD". 지정하면 dateRange 보다 우선한다. */
  date?: string
  metrics?: readonly string[]
  dimensions?: readonly string[]
  orderBy?: readonly string[]
  limit?: number
}

/** 임의 조건으로 보고서를 생성한다. */
export function generateReport(
  account: string,
  options: GenerateReportOptions = {}
) {
  const {
    dateRange = "TODAY",
    date,
    metrics = DEFAULT_METRICS,
    dimensions = [],
    orderBy = [],
    limit,
  } = options

  return apiGet<ReportResult>(`/${account}/reports:generate`, {
    ...periodParams(dateRange, date),
    metrics: [...metrics],
    dimensions: [...dimensions],
    orderBy: [...orderBy],
    limit: limit === undefined ? undefined : String(limit),
    reportingTimeZone: "ACCOUNT_TIME_ZONE",
  })
}

/** 저장된 보고서를 실행한다. date(YYYY-MM-DD)를 주면 그 하루만 조회한다. */
export function generateSavedReport(
  savedReportName: string,
  dateRange: DateRange = "TODAY",
  date?: string
) {
  return apiGet<ReportResult>(`/${savedReportName}/saved:generate`, {
    ...periodParams(dateRange, date),
    reportingTimeZone: "ACCOUNT_TIME_ZONE",
  })
}

/**
 * 지정한 도메인들의 애드센스 실제 수익(USD).
 * GA4 수치가 얼마나 반영됐는지 대조하는 기준값으로 쓴다.
 */
export async function getDomainEarnings(
  date: string,
  domains: readonly string[]
): Promise<{ total: number; byDomain: Map<string, number> }> {
  const accounts = await listAccounts()
  const account = accounts[0]?.name
  const byDomain = new Map<string, number>()
  if (!account) return { total: 0, byDomain }

  const report = await generateReport(account, {
    date,
    metrics: ["ESTIMATED_EARNINGS"],
    dimensions: ["DOMAIN_NAME"],
    limit: 200,
  })

  const wanted = new Set(domains)
  let total = 0
  for (const row of report.rows ?? []) {
    const domain = row.cells[0]?.value ?? ""
    if (!wanted.has(domain)) continue
    const amount = Number(row.cells[1]?.value ?? 0) || 0
    byDomain.set(domain, amount)
    total += amount
  }
  return { total, byDomain }
}

/** 보고서 결과를 헤더 이름을 키로 하는 객체 배열로 변환한다. */
export function toRecords(report: ReportResult) {
  const headers = report.headers?.map((h) => h.name) ?? []
  return (report.rows ?? []).map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((name, index) => {
      record[name] = row.cells[index]?.value ?? ""
    })
    return record
  })
}
