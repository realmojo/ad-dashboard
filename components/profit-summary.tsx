import {
  generateSavedReport,
  listAccounts,
  listSavedReports,
} from "@/lib/adsense"
import { getUsdKrwRate } from "@/lib/fx"
import { getPowerLinkTotals } from "@/lib/naver-ad"
import { cn } from "@/lib/utils"

/** 수익 기준으로 삼을 저장 보고서 제목. */
const REVENUE_REPORT_TITLE = "네이버광고"

const usd = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "USD",
})

/** 저장 보고서의 예상 수익 합계(USD). 찾지 못하면 null. */
async function getRevenueUsd(date?: string): Promise<number | null> {
  const accounts = await listAccounts()
  const account = accounts[0]?.name
  if (!account) return null

  const reports = await listSavedReports(account)
  const report = reports.find((r) => r.title === REVENUE_REPORT_TITLE)
  if (!report) return null

  const result = await generateSavedReport(report.name, "TODAY", date)
  const index = (result.headers ?? []).findIndex(
    (h) => h.name === "ESTIMATED_EARNINGS"
  )
  if (index < 0) return null

  // totals 가 없으면 행을 직접 더한다.
  const fromTotals = result.totals?.cells[index]?.value
  if (fromTotals !== undefined) return Number(fromTotals) || 0

  return (result.rows ?? []).reduce(
    (sum, row) => sum + (Number(row.cells[index]?.value) || 0),
    0
  )
}

/** 광고비(네이버 파워링크)와 수익(애드센스)의 차익·수익률. */
export async function ProfitSummary({ date }: { date?: string }) {
  let costUsd: number | null = null
  let revenueUsd: number | null = null

  const [totals, revenue, fx] = await Promise.allSettled([
    getPowerLinkTotals({ since: date }),
    getRevenueUsd(date),
    getUsdKrwRate(),
  ])

  const rate = fx.status === "fulfilled" ? fx.value.usdKrw : null
  if (totals.status === "fulfilled" && rate) {
    costUsd = totals.value.salesAmt / rate
  }
  if (revenue.status === "fulfilled") {
    revenueUsd = revenue.value
  }

  if (costUsd === null || revenueUsd === null) {
    return <p className="text-xs text-muted-foreground">손익 계산 불가</p>
  }

  const diff = revenueUsd - costUsd
  // 광고비 대비 수익 배수(ROAS). 광고비가 0이면 비율을 낼 수 없다.
  const ratio = costUsd > 0 ? (revenueUsd / costUsd) * 100 : null
  const positive = diff >= 0

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2">
      <Item label="광고비" value={usd.format(costUsd)} />
      <Item label="수익" value={usd.format(revenueUsd)} />
      <Item
        label="차익"
        value={`${positive ? "+" : "-"}${usd.format(Math.abs(diff))}`}
        tone={positive ? "up" : "down"}
        strong
      />
      <Item
        label="수익률"
        value={
          ratio === null ? "-" : `${Math.round(ratio).toLocaleString("ko-KR")}%`
        }
        tone={ratio !== null && ratio >= 100 ? "up" : "down"}
        strong
      />
    </div>
  )
}

function Item({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: "up" | "down"
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-lg font-bold" : "text-sm font-medium",
          tone === "up" && "text-emerald-600 dark:text-emerald-400",
          tone === "down" && "text-red-600 dark:text-red-400"
        )}
      >
        {value}
      </span>
    </div>
  )
}
