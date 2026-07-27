import { NextResponse } from "next/server";

import {
  AdSenseError,
  generateReport,
  generateSavedReport,
  listAccounts,
  listSavedReports,
  toRecords,
  type DateRange,
} from "@/lib/adsense";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RANGES = new Set<DateRange>([
  "TODAY",
  "YESTERDAY",
  "MONTH_TO_DATE",
  "YEAR_TO_DATE",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
]);

/**
 * GET /api/adsense/reports
 *
 * 쿼리 파라미터
 *  - account    accounts/pub-xxx (생략 시 첫 번째 계정)
 *  - dateRange  TODAY(기본) | YESTERDAY | MONTH_TO_DATE | LAST_7_DAYS | LAST_30_DAYS | YEAR_TO_DATE
 *  - saved      저장된 보고서 이름(accounts/pub-xxx/reports/123) — 지정 시 해당 보고서를 실행
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeParam = (searchParams.get("dateRange") ?? "TODAY") as DateRange;

  if (!DATE_RANGES.has(rangeParam)) {
    return NextResponse.json(
      { error: `지원하지 않는 dateRange 입니다: ${rangeParam}` },
      { status: 400 },
    );
  }

  try {
    const saved = searchParams.get("saved");
    if (saved) {
      const report = await generateSavedReport(saved, rangeParam);
      return NextResponse.json({
        savedReport: saved,
        dateRange: rangeParam,
        rows: toRecords(report),
        totals: report.totals,
        headers: report.headers,
      });
    }

    const accounts = await listAccounts();
    const account = searchParams.get("account") ?? accounts[0]?.name;

    if (!account) {
      return NextResponse.json(
        { error: "접근 가능한 애드센스 계정이 없습니다." },
        { status: 404 },
      );
    }

    const [savedReports, summary, bySite] = await Promise.all([
      listSavedReports(account),
      generateReport(account, { dateRange: rangeParam }),
      generateReport(account, {
        dateRange: rangeParam,
        dimensions: ["DOMAIN_NAME"],
        orderBy: ["-ESTIMATED_EARNINGS"],
        limit: 50,
      }),
    ]);

    return NextResponse.json({
      accounts,
      account,
      dateRange: rangeParam,
      savedReports,
      totals: toRecords(summary)[0] ?? null,
      summaryHeaders: summary.headers,
      bySite: toRecords(bySite),
    });
  } catch (error) {
    if (error instanceof AdSenseError) {
      return NextResponse.json(
        { error: error.message, detail: error.body },
        { status: error.status },
      );
    }

    console.error("[adsense/reports]", error);
    return NextResponse.json(
      { error: "애드센스 보고서를 가져오지 못했습니다." },
      { status: 500 },
    );
  }
}
