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
import { getDomainEarnings } from "@/lib/adsense"
import { rpmToneClass } from "@/lib/adsense-format"
import { getPageRevenue, type PageRevenueRow } from "@/lib/ga4"
import { describeError } from "@/lib/describe-error"
import { cn } from "@/lib/utils"

const usd = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "USD",
})
const num = new Intl.NumberFormat("ko-KR")

interface Props {
  /** "YYYY-MM-DD" */
  date: string
  /** 표시할 호스트. URL 채널로 이미 보는 info 는 보통 제외한다. */
  hosts: readonly string[]
  limit?: number
  height?: string
}

/**
 * GA4 의 호스트·페이지별 애드센스 수익.
 * URL 채널(계정당 500개 제한) 없이도 페이지 단위로 볼 수 있다.
 */
export async function Ga4PagesCard({
  date,
  hosts,
  limit = 200,
  height,
}: Props) {
  let rows: PageRevenueRow[] = []
  let totalRows = 0
  let errorMessage: string | null = null
  // 애드센스 실제 수익. GA4 가 얼마나 반영했는지 대조하는 기준.
  let adsenseTotal: number | null = null

  try {
    const [result, adsense] = await Promise.all([
      getPageRevenue({ date, hosts, limit }),
      // 대조값을 못 받아도 표는 보여준다.
      getDomainEarnings(date, hosts).catch(() => null),
    ])
    rows = result.rows
    totalRows = result.totalRows
    adsenseTotal = adsense?.total ?? null
  } catch (error) {
    errorMessage = describeError(
      error,
      "GA4 페이지별 수익을 가져오지 못했습니다."
    )
  }

  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const totalPageViews = rows.reduce((sum, r) => sum + r.pageViews, 0)
  const totalRpm =
    totalPageViews > 0 ? (totalRevenue / totalPageViews) * 1000 : 0

  // GA4 는 페이지뷰 이벤트에 수익을 붙이는 방식이라 애드센스보다 적게 잡히고,
  // 당일 데이터는 아직 처리 중이라 특히 낮다.
  const coverage =
    adsenseTotal && adsenseTotal > 0
      ? (totalRevenue / adsenseTotal) * 100
      : null

  const description = errorMessage
    ? "불러오기 실패"
    : [
        date,
        `${num.format(rows.length)}개 페이지`,
        totalRows > rows.length
          ? `전체 ${num.format(totalRows)}개 중 상위 ${num.format(limit)}개`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")

  return (
    <Card className={cn("min-w-0", height && "flex flex-col", height)}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <CardTitle className="text-base">GA4 페이지별 수익</CardTitle>
          {!errorMessage ? (
            <div className="ml-auto flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">
                예상 수익 합계
              </span>
              <span className="text-lg font-bold tabular-nums">
                {usd.format(totalRevenue)}
              </span>
              {coverage !== null ? (
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    coverage >= 90
                      ? "text-emerald-600 dark:text-emerald-400"
                      : coverage >= 70
                        ? "text-amber-600 dark:text-amber-500"
                        : "text-red-600 dark:text-red-400"
                  )}
                  title={`애드센스 실제 수익 ${usd.format(adsenseTotal!)} 대비`}
                >
                  애드센스 대비 {Math.round(coverage)}%
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <CardDescription>
          {description}
          {!errorMessage ? ` · ${hosts.join(", ")}` : ""}
        </CardDescription>
        {coverage !== null && coverage < 90 ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            애드센스 실제 수익은 {usd.format(adsenseTotal!)} 입니다. GA4 는
            페이지뷰 이벤트에 수익을 붙이는 방식이라 항상 적게 잡히고, 당일
            데이터는 처리 중이라 특히 낮습니다. 절대 금액보다 페이지 간 비교에
            쓰는 편이 안전합니다.
          </p>
        ) : null}
      </CardHeader>

      <CardContent className={cn(height && "min-h-0 flex-1")}>
        {errorMessage ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{errorMessage}</p>
            <p>
              애널리틱스 ↔ 애드센스 연결과 <code>.env</code> 의{" "}
              <code>GA4_PROPERTY_ID</code> 를 확인해 주세요.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            해당 날짜에 데이터가 없습니다. GA4 수익은 애드센스 연동 시점부터
            쌓입니다.
          </p>
        ) : (
          <div
            className={cn("h-full overflow-auto", !height && "max-h-[40rem]")}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="whitespace-nowrap">도메인</TableHead>
                  <TableHead className="whitespace-nowrap">페이지</TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    예상 수익
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    조회수
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    페이지 RPM
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    광고 클릭
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    광고 노출
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.host}${row.path}`}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.host}
                    </TableCell>
                    <TableCell
                      className="max-w-[18rem] truncate font-medium"
                      title={`${row.host}${row.path}`}
                    >
                      {row.path}
                    </TableCell>
                    <TableCell className="text-right font-bold whitespace-nowrap tabular-nums">
                      {usd.format(row.revenue)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {num.format(row.pageViews)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium whitespace-nowrap tabular-nums",
                        rpmToneClass(String(row.rpm))
                      )}
                    >
                      {usd.format(row.rpm)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {num.format(row.adClicks)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {num.format(row.adImpressions)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={2}>합계</TableCell>
                  <TableCell className="text-right font-bold whitespace-nowrap tabular-nums">
                    {usd.format(totalRevenue)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {num.format(totalPageViews)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {usd.format(totalRpm)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {num.format(rows.reduce((s, r) => s + r.adClicks, 0))}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {num.format(rows.reduce((s, r) => s + r.adImpressions, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
