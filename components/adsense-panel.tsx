import Link from "next/link"
import { Suspense } from "react"

import { Ga4PagesCard } from "@/components/ga4-pages-card"
import { SavedReportCard } from "@/components/saved-report-card"
import { StatTile } from "@/components/stat-tile"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AdSenseError,
  generateReport,
  listAccounts,
  listSavedReports,
  toRecords,
  type AdSenseAccount,
  type SavedReport,
} from "@/lib/adsense"
import { METRIC_LABEL, METRIC_ORDER, formatMetric } from "@/lib/adsense-format"
import { getUsdKrwRate } from "@/lib/fx"
import { PANEL_CARD_HEIGHT } from "@/lib/layout"
import { todayInSeoul } from "@/lib/naver-ad"
import { getUrlCostMap } from "@/lib/url-cost"
import { cn } from "@/lib/utils"

/**
 * 메인에서 표로 펼쳐 보여줄 저장 보고서 제목 (애드센스에 저장된 이름과 일치해야 함).
 * 배열 순서가 화면에 쌓이는 순서다.
 */
const FEATURED_REPORT_TITLES = ["URL", "네이버광고"] as const

/**
 * GA4 로 페이지별 수익을 보는 도메인.
 * info.mindpang.com 은 URL 채널 기반 "URL" 보고서에서 이미 보므로 뺀다.
 */
const GA4_HOSTS = [
  "good.mindpang.com",
  "ss.keywordegg.com",
  "hub.mindpang.com",
] as const

/** 보고서별 기본 제외 도메인. 카드 안 체크박스로 켜고 끌 수 있다. */
const EXCLUDED_DOMAINS: Record<string, string[]> = {
  URL: ["quizbells.com"],
}

export async function AdSensePanel({ date }: { date?: string } = {}) {
  let accounts: AdSenseAccount[] = []
  let savedReports: SavedReport[] = []
  let totals: Record<string, string> | null = null
  let bySite: Record<string, string>[] = []
  let currencyByMetric: Record<string, string | undefined> = {}
  let errorMessage: string | null = null

  try {
    accounts = await listAccounts()
    const account = accounts[0]?.name

    if (!account) {
      errorMessage = "접근 가능한 애드센스 계정이 없습니다."
    } else {
      const [saved, summary, sites] = await Promise.all([
        listSavedReports(account),
        generateReport(account, { date }),
        generateReport(account, {
          date,
          dimensions: ["DOMAIN_NAME"],
          orderBy: ["-ESTIMATED_EARNINGS"],
          limit: 50,
        }),
      ])

      savedReports = saved
      totals = toRecords(summary)[0] ?? null
      bySite = toRecords(sites)
      currencyByMetric = Object.fromEntries(
        (summary.headers ?? []).map((h) => [h.name, h.currencyCode])
      )
    }
  } catch (error) {
    errorMessage =
      error instanceof AdSenseError
        ? error.message
        : "애드센스 보고서를 가져오지 못했습니다."
  }

  const label = date ?? "오늘"

  // URL 보고서에 네이버 광고비를 나란히 보여주기 위한 매핑.
  // 실패해도 보고서 자체는 떠야 하므로 조용히 비워둔다.
  const [costByUrl, fx] = await Promise.all([
    getUrlCostMap(date)
      .then((map) =>
        Object.fromEntries([...map].map(([url, v]) => [url, v.salesAmt]))
      )
      .catch(() => null),
    getUsdKrwRate().catch(() => null),
  ])

  // 이 두 개는 표로 펼쳐 보여주고, 나머지는 이름만 나열한다.
  const featured = FEATURED_REPORT_TITLES.map((title) =>
    savedReports.find((report) => report.title === title)
  ).filter((report): report is SavedReport => report !== undefined)
  const featuredNames = new Set(featured.map((report) => report.name))
  const otherReports = savedReports.filter(
    (report) => !featuredNames.has(report.name)
  )

  const metricNames = METRIC_ORDER.filter((name) => totals && name in totals)
  // 좁은 칼럼이라 표에는 핵심 지표만 노출한다.
  const tableMetrics = metricNames.filter((name) =>
    ["ESTIMATED_EARNINGS", "PAGE_VIEWS_RPM", "PAGE_VIEWS", "CLICKS"].includes(
      name
    )
  )

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          애드센스 보고서
        </h2>
        <Link
          href="/adsense"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          자세히 보기
        </Link>
      </div>

      {errorMessage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">불러오기 실패</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              최초 1회 인증이 필요합니다: <code>npm run adsense:auth</code>
            </p>
            <p>
              인증 후 <code>.env</code> 에 <code>ADSENSE_REFRESH_TOKEN</code> 이
              저장되면 dev 서버를 재시작하세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {accounts[0]
              ? `${accounts[0].displayName} (${accounts[0].name.replace("accounts/", "")}) · ${label}`
              : label}
          </p>

          {totals ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {metricNames.map((name) => (
                <StatTile
                  key={name}
                  label={METRIC_LABEL[name] ?? name}
                  value={formatMetric(
                    name,
                    totals[name] ?? "",
                    currencyByMetric[name]
                  )}
                />
              ))}
            </div>
          ) : null}

          {featured.length > 0 ? (
            // 컬럼 수가 많아 가로로 넓게 쓰도록 위아래로 쌓는다.
            <div className="space-y-4">
              {featured.map((report) => (
                <Suspense
                  key={report.name}
                  fallback={
                    <div
                      className={cn(
                        "animate-pulse rounded-xl bg-muted",
                        report.title === "URL" ? PANEL_CARD_HEIGHT : "h-64"
                      )}
                    />
                  }
                >
                  <SavedReportCard
                    name={report.name}
                    title={report.title}
                    excludeDomains={EXCLUDED_DOMAINS[report.title]}
                    date={date}
                    height={
                      report.title === "URL" ? PANEL_CARD_HEIGHT : undefined
                    }
                    costByUrl={
                      report.title === "URL" && costByUrl
                        ? costByUrl
                        : undefined
                    }
                    usdKrw={fx?.usdKrw}
                  />
                </Suspense>
              ))}
            </div>
          ) : null}

          <Suspense
            fallback={
              <div className="h-64 animate-pulse rounded-xl bg-muted" />
            }
          >
            <Ga4PagesCard date={date ?? todayInSeoul()} hosts={GA4_HOSTS} />
          </Suspense>

          {otherReports.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">그 외 저장된 보고서</CardTitle>
                <CardDescription>{otherReports.length}개</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {otherReports.map((report) => (
                    <li
                      key={report.name}
                      className="border-b pb-2 last:border-0"
                    >
                      {report.title}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {bySite.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">사이트별</CardTitle>
                <CardDescription>예상 수익 순</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[32rem] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>도메인</TableHead>
                        {tableMetrics.map((name) => (
                          <TableHead key={name} className="text-right">
                            {METRIC_LABEL[name]}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bySite.map((row) => (
                        <TableRow key={row.DOMAIN_NAME}>
                          <TableCell className="font-medium">
                            {row.DOMAIN_NAME || "(기타)"}
                          </TableCell>
                          {tableMetrics.map((name) => (
                            <TableCell
                              key={name}
                              className={cn(
                                "text-right tabular-nums",
                                name === "ESTIMATED_EARNINGS" && "font-bold"
                              )}
                            >
                              {formatMetric(
                                name,
                                row[name] ?? "",
                                currencyByMetric[name]
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </section>
  )
}
