"use client"

import { Fragment, useMemo, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatCell,
  headerLabel,
  isDimension,
  recomputeTotals,
  rpmToneClass,
  type ReportHeader,
} from "@/lib/adsense-format"
import { normalizeUrl, useHoveredUrls } from "@/lib/hovered-urls"
import { cn } from "@/lib/utils"

/** 컬럼이 많아 좁으므로 이 표에서만 라벨을 줄여 쓴다. */
const SHORT_HEADER_LABEL: Record<string, string> = {
  PAGE_VIEWS: "PV",
  PAGE_VIEWS_RPM: "RPM",
}

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})
const num = new Intl.NumberFormat("ko-KR")

/** 부호를 붙인 달러 표기. */
function signedUsd(value: number) {
  return `${value >= 0 ? "+" : "-"}${usdFmt.format(Math.abs(value))}`
}

/** 광고비 대비 차익 비율(%). 광고비가 0 이면 낼 수 없다. */
function profitRatio(diff: number, cost: number): number | null {
  return cost > 0 ? (diff / cost) * 100 : null
}

/**
 * 차익 색: 흑자면 녹색, 광고비의 50% 이상을 까먹으면 빨강, 그 사이는 주황.
 * 광고비가 0 이면 비율을 낼 수 없어 흑자/적자만 본다.
 */
function profitToneClass(diff: number, cost: number) {
  if (diff >= 0) return "text-emerald-600 dark:text-emerald-400"
  if (cost <= 0 || diff / cost <= -0.5) return "text-red-600 dark:text-red-400"
  return "text-amber-600 dark:text-amber-500"
}

/** 차익 셀 내용: 금액 + 비율. */
function ProfitCellContent({
  diff,
  ratio,
}: {
  diff: number
  ratio: number | null
}) {
  return (
    <>
      {signedUsd(diff)}
      {ratio !== null ? (
        <span className="ml-1 text-xs font-normal opacity-80">
          ({ratio >= 0 ? "+" : ""}
          {Math.round(ratio)}%)
        </span>
      ) : null}
    </>
  )
}

interface Props {
  title: string
  description: string
  headers: ReportHeader[]
  rows: string[][]
  /** API 가 준 합계 (필터가 없을 때 사용) */
  totals: string[] | null
  limit: number
  /** 기본으로 제외할 도메인. 체크박스로 켜고 끌 수 있다. */
  excludeDomains?: string[]
  /** 고정 높이 클래스 (예: "h-[46rem]"). 주면 표가 남는 공간을 채운다. */
  height?: string
  /**
   * 정규화한 URL → 네이버 광고비(원).
   * 주면 예상 수익 컬럼 오른쪽에 "광고비" 컬럼을 끼워 넣는다.
   */
  costByUrl?: Record<string, number>
  /**
   * 정규화한 URL → 네이버 광고 클릭수.
   * 주면 RPM 옆에 PV(N)·RPM(N) 컬럼을 끼워 넣는다.
   * PV(N) 은 네이버 광고로 유입된 방문 수, RPM(N) 은 그 방문 기준 RPM 이다.
   */
  clicksByUrl?: Record<string, number>
  /** 광고비를 달러로 환산하기 위한 환율 */
  usdKrw?: number
}

/**
 * 저장된 보고서 카드 전체.
 * 제외 필터와 수익 합계가 서로 맞물려 있어 카드 헤더까지 클라이언트에서 그린다.
 */
export function SavedReportTable({
  title,
  description,
  headers,
  rows,
  totals,
  limit,
  excludeDomains = [],
  height,
  costByUrl,
  clicksByUrl,
  usdKrw,
}: Props) {
  // 네이버 광고그룹에 hover 하면 같은 랜딩 URL 행을 강조한다.
  const hoveredUrls = useHoveredUrls()
  const hoveredSet = useMemo(() => new Set(hoveredUrls), [hoveredUrls])

  const hasFilter = excludeDomains.length > 0
  // 요청대로 기본은 제외된 상태.
  const [excluding, setExcluding] = useState(hasFilter)

  /**
   * 컬럼 표시 순서.
   * 측정기준 → 예상 수익(+광고비·차익) → 나머지 원래 순서.
   * 다만 클릭수는 페이지 RPM 바로 뒤로 옮긴다. 보고서 컬럼이 많아
   * 오른쪽 끝으로 밀리면 가로 스크롤 없이는 보이지 않기 때문이다.
   */
  const order = useMemo(() => {
    const dims: number[] = []
    const earnings: number[] = []
    const rest: number[] = []

    headers.forEach((header, i) => {
      if (isDimension(header)) dims.push(i)
      else if (header.name === "ESTIMATED_EARNINGS") earnings.push(i)
      else rest.push(i)
    })

    // 기준 컬럼이 없는 보고서(네이버광고 등)에서는 원래 자리를 유지한다.
    const anchor = rest.findIndex((i) => headers[i]!.name === "PAGE_VIEWS_RPM")
    const clicks = rest.findIndex((i) => headers[i]!.name === "CLICKS")
    if (anchor >= 0 && clicks >= 0) {
      const [moved] = rest.splice(clicks, 1)
      rest.splice(
        rest.findIndex((i) => headers[i]!.name === "PAGE_VIEWS_RPM") + 1,
        0,
        moved!
      )
    }

    return [...dims, ...earnings, ...rest]
  }, [headers])

  const dimensionIndexes = useMemo(
    () =>
      headers.map((h, i) => (isDimension(h) ? i : -1)).filter((i) => i >= 0),
    [headers]
  )

  const showCost = Boolean(costByUrl && usdKrw)
  const showNaverPv = Boolean(clicksByUrl)

  /** 행에 매칭되는 네이버 광고 클릭수(= 유입 수). */
  const naverPvOf = (row: string[]): number | null => {
    if (!clicksByUrl) return null
    for (const i of dimensionIndexes) {
      const clicks = clicksByUrl[normalizeUrl(row[i] ?? "")]
      if (clicks !== undefined) return clicks
    }
    return null
  }

  /** 행의 측정기준 값 중 광고비가 매칭되는 첫 URL 의 비용(원). */
  const costOf = (row: string[]): number | null => {
    if (!costByUrl) return null
    for (const i of dimensionIndexes) {
      const cost = costByUrl[normalizeUrl(row[i] ?? "")]
      if (cost !== undefined) return cost
    }
    return null
  }

  const filtered = useMemo(() => {
    if (!excluding || !hasFilter) return rows
    return rows.filter(
      (row) =>
        !dimensionIndexes.some((i) =>
          excludeDomains.some((domain) => (row[i] ?? "").includes(domain))
        )
    )
  }, [rows, excluding, hasFilter, dimensionIndexes, excludeDomains])

  const totalCost = showCost
    ? filtered.reduce((sum, row) => sum + (costOf(row) ?? 0), 0)
    : 0

  const earningsIndex = headers.findIndex(
    (h) => h.name === "ESTIMATED_EARNINGS"
  )
  const totalRevenue =
    earningsIndex < 0
      ? 0
      : filtered.reduce(
          (sum, row) => sum + (Number(row[earningsIndex]) || 0),
          0
        )
  const totalNaverPv = showNaverPv
    ? filtered.reduce((sum, row) => sum + (naverPvOf(row) ?? 0), 0)
    : 0
  const totalCostUsd = usdKrw ? totalCost / usdKrw : 0
  const totalDiff = totalRevenue - totalCostUsd
  const totalRatio = profitRatio(totalDiff, totalCostUsd)

  const hiddenCount = rows.length - filtered.length
  const visible = filtered.slice(0, limit)

  // 카드 헤더에 띄울 예상 수익 합계. 제외 필터를 반영해 다시 더한다.
  const earnings = useMemo(() => {
    const i = headers.findIndex((h) => h.name === "ESTIMATED_EARNINGS")
    if (i < 0) return null
    const header = headers[i]!
    const sum = filtered.reduce((acc, row) => acc + (Number(row[i]) || 0), 0)
    return formatCell(header, String(sum))
  }, [headers, filtered])

  // 행을 걸러냈으면 API 합계는 더 이상 맞지 않으므로 다시 계산한다.
  const totalCells = useMemo(
    () =>
      hiddenCount > 0
        ? recomputeTotals(headers, filtered)
        : (totals?.map((v) => v ?? null) ?? null),
    [hiddenCount, headers, filtered, totals]
  )

  return (
    <Card className={cn("min-w-0", height && "flex flex-col", height)}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <CardTitle className="text-base">{title}</CardTitle>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
            {hasFilter ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={excluding}
                  onCheckedChange={(checked) => setExcluding(checked === true)}
                />
                <span>
                  {excludeDomains.join(", ")} 제외
                  {excluding && hiddenCount > 0
                    ? ` (${hiddenCount}행 숨김)`
                    : ""}
                </span>
              </label>
            ) : null}

            {earnings ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground">
                  예상 수익 합계
                </span>
                <span className="text-lg font-bold tabular-nums">
                  {earnings}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className={cn(height && "min-h-0 flex-1")}>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">표시할 행이 없습니다.</p>
        ) : (
          <div
            className={cn("h-full overflow-auto", !height && "max-h-[40rem]")}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  {order.map((i) => {
                    const header = headers[i]!
                    return (
                      <Fragment key={header.name}>
                        <TableHead
                          className={cn(
                            "whitespace-nowrap",
                            !isDimension(header) && "text-right"
                          )}
                        >
                          {SHORT_HEADER_LABEL[header.name] ??
                            headerLabel(header.name)}
                        </TableHead>
                        {showNaverPv && header.name === "PAGE_VIEWS_RPM" ? (
                          <>
                            <TableHead
                              className="text-right whitespace-nowrap"
                              title="네이버 광고 클릭수 (광고로 유입된 방문 수)"
                            >
                              PV(N)
                            </TableHead>
                            <TableHead
                              className="text-right whitespace-nowrap"
                              title="네이버 광고 유입 기준 RPM = 예상 수익 ÷ PV(N) × 1000"
                            >
                              RPM(N)
                            </TableHead>
                          </>
                        ) : null}
                        {showCost && header.name === "ESTIMATED_EARNINGS" ? (
                          <>
                            <TableHead className="text-right whitespace-nowrap">
                              광고비
                            </TableHead>
                            <TableHead className="text-right whitespace-nowrap">
                              차익
                            </TableHead>
                          </>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row, rowIndex) => {
                  const highlighted =
                    hoveredSet.size > 0 &&
                    dimensionIndexes.some((i) =>
                      hoveredSet.has(normalizeUrl(row[i] ?? ""))
                    )

                  const rowCost = costOf(row)
                  const rowNaverPv = naverPvOf(row)
                  const rowRevenue =
                    earningsIndex < 0 ? 0 : Number(row[earningsIndex]) || 0
                  // 유입이 0 이면 나눌 수 없다.
                  const rowNaverRpm =
                    rowNaverPv && rowNaverPv > 0
                      ? (rowRevenue / rowNaverPv) * 1000
                      : null
                  const rowProfit =
                    rowCost === null || !usdKrw || earningsIndex < 0
                      ? null
                      : (() => {
                          const cost = rowCost / usdKrw
                          const diff = (Number(row[earningsIndex]) || 0) - cost
                          return { cost, diff, ratio: profitRatio(diff, cost) }
                        })()

                  return (
                    <TableRow
                      key={rowIndex}
                      className={cn(
                        highlighted &&
                          "bg-amber-100 ring-1 ring-amber-400 ring-inset dark:bg-amber-900/40 dark:ring-amber-600"
                      )}
                    >
                      {order.map((i) => {
                        const header = headers[i]!
                        return (
                          <Fragment key={header.name}>
                            <TableCell
                              className={cn(
                                isDimension(header)
                                  ? // URL 은 잘리면 어느 글인지 알 수 없어 전부 보여준다.
                                    // 넘치면 표가 가로로 스크롤된다.
                                    "font-medium whitespace-nowrap"
                                  : "text-right whitespace-nowrap tabular-nums",
                                header.name === "ESTIMATED_EARNINGS" &&
                                  "font-bold",
                                // 페이지 RPM 은 구간별로 색을 입혀 한눈에 보이게 한다.
                                header.name === "PAGE_VIEWS_RPM" &&
                                  cn("font-medium", rpmToneClass(row[i]))
                              )}
                              title={isDimension(header) ? row[i] : undefined}
                            >
                              {formatCell(header, row[i])}
                            </TableCell>
                            {showNaverPv && header.name === "PAGE_VIEWS_RPM" ? (
                              <>
                                <TableCell className="text-right whitespace-nowrap tabular-nums">
                                  {rowNaverPv === null
                                    ? "-"
                                    : num.format(rowNaverPv)}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-medium whitespace-nowrap tabular-nums",
                                    rpmToneClass(
                                      rowNaverRpm === null
                                        ? undefined
                                        : String(rowNaverRpm)
                                    )
                                  )}
                                >
                                  {rowNaverRpm === null
                                    ? "-"
                                    : usdFmt.format(rowNaverRpm)}
                                </TableCell>
                              </>
                            ) : null}
                            {showCost &&
                            header.name === "ESTIMATED_EARNINGS" ? (
                              <>
                                <TableCell className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                                  {rowCost === null
                                    ? "-"
                                    : usdFmt.format(rowCost / usdKrw!)}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-medium whitespace-nowrap tabular-nums",
                                    rowProfit &&
                                      profitToneClass(
                                        rowProfit.diff,
                                        rowProfit.cost
                                      )
                                  )}
                                >
                                  {rowProfit ? (
                                    <ProfitCellContent
                                      diff={rowProfit.diff}
                                      ratio={rowProfit.ratio}
                                    />
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>
                              </>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </TableRow>
                  )
                })}
                {totalCells ? (
                  <TableRow className="bg-muted/50 font-medium">
                    {order.map((i) => {
                      const header = headers[i]!
                      return (
                        <Fragment key={header.name}>
                          <TableCell
                            className={cn(
                              !isDimension(header) &&
                                "text-right whitespace-nowrap tabular-nums"
                            )}
                          >
                            {isDimension(header)
                              ? i === 0
                                ? hiddenCount > 0
                                  ? "합계 (제외 적용)"
                                  : "합계"
                                : ""
                              : totalCells[i] === null
                                ? "-"
                                : formatCell(
                                    header,
                                    totalCells[i] ?? undefined
                                  )}
                          </TableCell>
                          {showNaverPv && header.name === "PAGE_VIEWS_RPM" ? (
                            <>
                              <TableCell className="text-right whitespace-nowrap tabular-nums">
                                {num.format(totalNaverPv)}
                              </TableCell>
                              <TableCell className="text-right font-bold whitespace-nowrap tabular-nums">
                                {totalNaverPv > 0
                                  ? usdFmt.format(
                                      (totalRevenue / totalNaverPv) * 1000
                                    )
                                  : "-"}
                              </TableCell>
                            </>
                          ) : null}
                          {showCost && header.name === "ESTIMATED_EARNINGS" ? (
                            <>
                              <TableCell className="text-right whitespace-nowrap tabular-nums">
                                {usdFmt.format(totalCost / usdKrw!)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-right font-bold whitespace-nowrap tabular-nums",
                                  profitToneClass(totalDiff, totalCostUsd)
                                )}
                              >
                                <ProfitCellContent
                                  diff={totalDiff}
                                  ratio={totalRatio}
                                />
                              </TableCell>
                            </>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
