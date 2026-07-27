/** 원화 광고비를 애드센스 수익(USD)과 나란히 보기 위한 환율 조회. */

/** 네이버 금융 시장지표 (하나은행 고시 매매기준율). */
const NAVER_FX_URL =
  "https://api.stock.naver.com/marketindex/exchange/FX_USDKRW"

/** 네이버가 응답하지 않을 때 쓰는 예비 소스. */
const FALLBACK_FX_URL = "https://open.er-api.com/v6/latest/USD"

/** 둘 다 실패했을 때 쓰는 대략적인 값. 정확한 금액이 필요하면 USD_KRW_RATE 를 설정한다. */
const FALLBACK_USD_KRW = 1400

export interface FxRate {
  /** 1 USD 가 몇 원인지 */
  usdKrw: number
  /** 환율 출처 */
  source: "env" | "naver" | "api" | "fallback"
  /** 출처 표시용 이름 */
  sourceLabel: string
  /** 고시/갱신 시각 */
  updatedAt?: string
}

interface NaverFxResponse {
  exchangeInfo?: {
    /** 매매기준율 (콤마 없는 문자열) */
    calcPrice?: string
    /** 매매기준율 (콤마 포함) */
    closePrice?: string
    /** 고시 시각 ISO8601 (+09:00) */
    localTradedAt?: string
    stockExchangeType?: { nameKor?: string }
  }
}

/** 네이버 금융에서 실시간 매매기준율을 가져온다. */
async function fetchNaverRate(): Promise<FxRate | null> {
  try {
    const response = await fetch(NAVER_FX_URL, {
      // 하나은행 고시는 수시로 갱신되므로 짧게 캐시한다.
      next: { revalidate: 300 },
      headers: {
        // 브라우저 UA 가 아니면 막히는 경우가 있다.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://finance.naver.com/marketindex/",
      },
    })
    if (!response.ok) return null

    const body = (await response.json()) as NaverFxResponse
    const info = body.exchangeInfo
    // calcPrice 가 콤마 없는 값이지만, 혹시 없으면 closePrice 에서 콤마를 뗀다.
    const raw = info?.calcPrice ?? info?.closePrice?.replace(/,/g, "")
    const rate = Number(raw)

    if (!Number.isFinite(rate) || rate <= 0) return null

    const bank = info?.stockExchangeType?.nameKor
    return {
      usdKrw: rate,
      source: "naver",
      sourceLabel: bank ? `네이버 · ${bank} 매매기준율` : "네이버 금융",
      updatedAt: info?.localTradedAt,
    }
  } catch {
    return null
  }
}

/** 네이버가 실패했을 때 쓰는 예비 소스. */
async function fetchFallbackRate(): Promise<FxRate | null> {
  try {
    const response = await fetch(FALLBACK_FX_URL, {
      next: { revalidate: 3600 },
    })
    if (!response.ok) return null

    const body = (await response.json()) as {
      result?: string
      rates?: Record<string, number>
      time_last_update_utc?: string
    }
    const rate = body.rates?.KRW

    if (body.result !== "success" || typeof rate !== "number" || rate <= 0) {
      return null
    }
    return {
      usdKrw: rate,
      source: "api",
      sourceLabel: "open.er-api.com",
      updatedAt: body.time_last_update_utc,
    }
  } catch {
    return null
  }
}

/**
 * USD→KRW 환율.
 * USD_KRW_RATE 환경변수 > 네이버 금융 > 예비 API > 대략값 순서로 시도한다.
 */
export async function getUsdKrwRate(): Promise<FxRate> {
  const override = Number(process.env.USD_KRW_RATE)
  if (Number.isFinite(override) && override > 0) {
    return { usdKrw: override, source: "env", sourceLabel: "고정값(.env)" }
  }

  // 환율을 못 받아도 대시보드 자체는 떠야 하므로 단계적으로 물러선다.
  return (
    (await fetchNaverRate()) ??
    (await fetchFallbackRate()) ?? {
      usdKrw: FALLBACK_USD_KRW,
      source: "fallback",
      sourceLabel: "대략값",
    }
  )
}

const usd = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "USD",
})

/** 원 → 달러 표시 문자열. */
export function krwToUsd(amountKrw: number, rate: number): string {
  return usd.format(amountKrw / rate)
}

/** "2026-07-27T22:57:13+09:00" → "22:57" (KST) */
export function formatFxTime(value?: string): string | null {
  if (!value) return null
  const at = Date.parse(value)
  if (Number.isNaN(at)) return null
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at)
}
