/** 애드센스 지표 표시용 포맷터. 서버/클라이언트 양쪽에서 쓸 수 있도록 의존성 없이 둔다. */

export const METRIC_LABEL: Record<string, string> = {
  ESTIMATED_EARNINGS: "예상 수익",
  PAGE_VIEWS_RPM: "페이지 RPM",
  IMPRESSIONS_RPM: "노출 RPM",
  PAGE_VIEWS: "페이지뷰",
  IMPRESSIONS: "노출수",
  CLICKS: "클릭수",
  IMPRESSIONS_CTR: "클릭률",
  COST_PER_CLICK: "CPC",
  ACTIVE_VIEW_VIEWABILITY: "조회가능률",
  ACTIVE_VIEW_MEASURABILITY: "측정가능률",
  AD_REQUESTS: "광고요청",
  MATCHED_AD_REQUESTS: "매칭요청",
}

/** 저장된 보고서에 쓰이는 측정기준(dimension) 이름. */
export const DIMENSION_LABEL: Record<string, string> = {
  DOMAIN_NAME: "도메인",
  DOMAIN_CODE: "도메인",
  URL_CHANNEL_ID: "URL",
  URL_CHANNEL_NAME: "URL",
  AD_UNIT_NAME: "광고단위",
  AD_PLACEMENT_CODE: "게재위치",
  REQUESTED_AD_TYPE_CODE: "광고유형",
  AD_FORMAT_CODE: "광고형식",
  COUNTRY_NAME: "국가",
  PLATFORM_TYPE_CODE: "플랫폼",
  DATE: "날짜",
}

/**
 * 측정기준 "값" 의 한글 표기.
 * 컬럼별로 코드 체계가 달라 측정기준 이름으로 한 번 나눈다.
 * 목록에 없는 코드는 원문을 그대로 보여준다(새 유형이 생겨도 깨지지 않게).
 */
const DIMENSION_VALUE_LABEL: Record<string, Record<string, string>> = {
  REQUESTED_AD_TYPE_CODE: {
    ANCHOR: "앵커",
    IMAGE: "이미지",
    INTERSTITIAL: "전면",
    MULTIPLEX: "멀티플렉스",
    ON_PAGE: "페이지 내",
    TEXT: "텍스트",
    TEXT_IMAGE: "텍스트·이미지",
    VIGNETTE: "비네트",
    HTML: "HTML",
  },
  AD_PLACEMENT_CODE: {
    AUTO_ADS: "자동",
    MANUAL: "수동",
    OFFERWALL: "오퍼월",
  },
  PLATFORM_TYPE_CODE: {
    DESKTOP: "데스크톱",
    HIGH_END_MOBILE: "모바일",
    TABLET: "태블릿",
  },
}

export function dimensionValueLabel(name: string, value: string): string {
  return DIMENSION_VALUE_LABEL[name]?.[value] ?? value
}

export function headerLabel(name: string): string {
  return DIMENSION_LABEL[name] ?? METRIC_LABEL[name] ?? name
}

/** 표시 순서 — 수익과 RPM 을 앞에 둔다. */
export const METRIC_ORDER = Object.keys(METRIC_LABEL)

const CURRENCY_METRICS = new Set([
  "ESTIMATED_EARNINGS",
  "COST_PER_CLICK",
  "PAGE_VIEWS_RPM",
  "IMPRESSIONS_RPM",
])

const tally = new Intl.NumberFormat("ko-KR")
const currencyCache = new Map<string, Intl.NumberFormat>()

function currencyFormatter(code: string) {
  let formatter = currencyCache.get(code)
  if (!formatter) {
    formatter = new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: code,
      // RPM·CPC 는 소수점이 의미 있으므로 통화 기본 자릿수를 그대로 쓴다.
    })
    currencyCache.set(code, formatter)
  }
  return formatter
}

export function formatMetric(
  name: string,
  value: string | undefined,
  currency?: string
): string {
  if (value === undefined || value === "") return "-"

  const parsed = Number(value)
  if (Number.isNaN(parsed)) return value

  if (name === "IMPRESSIONS_CTR") return `${(parsed * 100).toFixed(2)}%`

  if (CURRENCY_METRICS.has(name)) {
    if (!currency) return parsed.toString()
    try {
      return currencyFormatter(currency).format(parsed)
    } catch {
      return `${parsed} ${currency}`
    }
  }

  return tally.format(parsed)
}

/**
 * 페이지 RPM 구간별 색.
 * $50 이상 녹색 / $20 이상 주황 / 그 미만 빨강.
 * ($40~$50 구간은 따로 지정되지 않아 주황에 포함시켰다.)
 */
export function rpmToneClass(value: string | undefined): string | null {
  if (value === undefined || value === "") return null

  const rpm = Number(value)
  if (Number.isNaN(rpm)) return null

  if (rpm >= 50) return "text-emerald-600 dark:text-emerald-400"
  if (rpm >= 20) return "text-amber-600 dark:text-amber-500"
  return "text-red-600 dark:text-red-400"
}

export interface ReportHeader {
  name: string
  type: string
  currencyCode?: string
}

/** 측정기준 컬럼인지. 숫자 지표는 우측 정렬한다. */
export function isDimension(header: ReportHeader) {
  return !header.type.startsWith("METRIC")
}

/** "ca-pub-1234:info.example.com/path" → "info.example.com/path" */
function cleanDimension(name: string, value: string) {
  if (name === "URL_CHANNEL_ID" || name === "URL_CHANNEL_NAME") {
    const colon = value.indexOf(":")
    return colon >= 0 ? value.slice(colon + 1) : value
  }
  return value
}

/** 단순 합계로 구할 수 있는 지표. 비율·평균 지표는 여기 넣으면 안 된다. */
const SUMMABLE = new Set(["ESTIMATED_EARNINGS"])

/**
 * 행을 걸러낸 뒤에는 API 가 준 합계를 쓸 수 없으므로 다시 계산한다.
 * 합산 가능한 지표는 더하고, 파생 지표(RPM·CTR·CPC)는 합계로부터 다시 구하고,
 * 그 외 비율 지표(조회가능률 등)는 원자료 없이는 정확히 구할 수 없어 null 을 돌려준다.
 */
export function recomputeTotals(
  headers: ReportHeader[],
  rows: string[][]
): (string | null)[] {
  const indexOf = (name: string) => headers.findIndex((h) => h.name === name)
  const sumOf = (name: string) => {
    const i = indexOf(name)
    if (i < 0) return null
    return rows.reduce((acc, row) => acc + (Number(row[i]) || 0), 0)
  }

  const earnings = sumOf("ESTIMATED_EARNINGS")
  const pageViews = sumOf("PAGE_VIEWS")
  const impressions = sumOf("IMPRESSIONS")
  const clicks = sumOf("CLICKS")

  const ratio = (top: number | null, bottom: number | null, scale = 1) =>
    top !== null && bottom !== null && bottom > 0
      ? String((top / bottom) * scale)
      : null

  return headers.map((header, i) => {
    if (isDimension(header)) return null

    switch (header.name) {
      case "PAGE_VIEWS_RPM":
        return ratio(earnings, pageViews, 1000)
      case "IMPRESSIONS_RPM":
        return ratio(earnings, impressions, 1000)
      case "COST_PER_CLICK":
        return ratio(earnings, clicks)
      case "IMPRESSIONS_CTR":
        return ratio(clicks, impressions)
      default:
        break
    }

    if (header.type === "METRIC_TALLY" || SUMMABLE.has(header.name)) {
      return String(rows.reduce((acc, row) => acc + (Number(row[i]) || 0), 0))
    }

    // 가중평균이 필요한 비율 지표는 행 단위 원자료만으로 복원할 수 없다.
    return null
  })
}

/**
 * 저장된 보고서는 컬럼 구성이 제각각이라, 지표 이름 대신
 * 응답 헤더의 type(DIMENSION / METRIC_CURRENCY / METRIC_RATIO / METRIC_TALLY …)으로 포맷한다.
 */
export function formatCell(
  header: ReportHeader,
  value: string | undefined
): string {
  if (value === undefined || value === "") return "-"

  if (isDimension(header)) {
    const cleaned = cleanDimension(header.name, value)
    return cleaned ? dimensionValueLabel(header.name, cleaned) : "-"
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) return value

  switch (header.type) {
    case "METRIC_RATIO":
      return `${(parsed * 100).toFixed(2)}%`
    case "METRIC_CURRENCY":
      if (!header.currencyCode) return parsed.toString()
      try {
        return currencyFormatter(header.currencyCode).format(parsed)
      } catch {
        return `${parsed} ${header.currencyCode}`
      }
    case "METRIC_DECIMAL":
      return parsed.toFixed(2)
    default:
      return tally.format(parsed)
  }
}
