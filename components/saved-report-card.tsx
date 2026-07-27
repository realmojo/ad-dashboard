import { SavedReportTable } from "@/components/saved-report-table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AdSenseError,
  generateSavedReport,
  type DateRange,
} from "@/lib/adsense"
import type { ReportHeader } from "@/lib/adsense-format"

interface Props {
  /** "accounts/pub-xxx/reports/xxx" */
  name: string
  title: string
  dateRange?: DateRange
  /** 표에 표시할 최대 행 수 */
  limit?: number
  /** 기본으로 제외할 도메인. 카드 헤더의 체크박스로 토글된다. */
  excludeDomains?: string[]
  /** 특정 하루 "YYYY-MM-DD". 없으면 dateRange 프리셋을 쓴다. */
  date?: string
  /** 고정 높이 클래스 (예: "h-[46rem]"). 주면 표가 남는 공간을 채운다. */
  height?: string
  /** 정규화한 URL → 네이버 광고비(원). 예상 수익 옆에 광고비 컬럼이 붙는다. */
  costByUrl?: Record<string, number>
  usdKrw?: number
}

/** 애드센스에 저장해둔 보고서를 실행해 그대로 표로 보여준다. */
export async function SavedReportCard({
  name,
  title,
  dateRange = "TODAY",
  limit = 500,
  excludeDomains,
  date,
  height,
  costByUrl,
  usdKrw,
}: Props) {
  let headers: ReportHeader[] = []
  let rows: string[][] = []
  let totals: string[] | null = null
  /** 애드센스가 집계한 전체 행 수. 응답 행 수보다 크면 API 쪽에서 잘린 것이다. */
  let matchedRowCount = 0
  let errorMessage: string | null = null

  try {
    const report = await generateSavedReport(name, dateRange, date)
    headers = report.headers ?? []
    rows = (report.rows ?? []).map((row) =>
      headers.map((_, i) => row.cells[i]?.value ?? "")
    )
    matchedRowCount =
      Number(report.totalMatchedRows ?? rows.length) || rows.length
    totals = report.totals
      ? headers.map((_, i) => report.totals!.cells[i]?.value ?? "")
      : null
  } catch (error) {
    errorMessage =
      error instanceof AdSenseError
        ? error.message
        : `"${title}" 보고서를 가져오지 못했습니다.`
  }

  // 표가 없으면 헤더의 필터·합계도 의미가 없으므로 단순 카드로 끝낸다.
  if (errorMessage || rows.length === 0) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>
            {errorMessage ? "불러오기 실패" : `${date ?? "오늘"} · 0행`}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {errorMessage ?? "데이터가 없습니다."}
        </CardContent>
      </Card>
    )
  }

  const description = [
    date ?? "오늘",
    `${rows.length.toLocaleString("ko-KR")}행`,
    rows.length > limit
      ? `상위 ${limit.toLocaleString("ko-KR")}개만 표시`
      : null,
    matchedRowCount > rows.length
      ? `전체 ${matchedRowCount.toLocaleString("ko-KR")}행 중 API 가 ${rows.length.toLocaleString("ko-KR")}행만 반환`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <SavedReportTable
      title={title}
      description={description}
      headers={headers}
      rows={rows}
      totals={totals}
      limit={limit}
      excludeDomains={excludeDomains}
      height={height}
      costByUrl={costByUrl}
      usdKrw={usdKrw}
    />
  )
}
