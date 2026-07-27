import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdSenseError,
  generateReport,
  listAccounts,
  listSavedReports,
  toRecords,
  type AdSenseAccount,
  type SavedReport,
} from "@/lib/adsense";
import { METRIC_LABEL, METRIC_ORDER, formatMetric } from "@/lib/adsense-format";

export const dynamic = "force-dynamic";

export default async function AdSensePage() {
  let accounts: AdSenseAccount[] = [];
  let savedReports: SavedReport[] = [];
  let totals: Record<string, string> | null = null;
  let bySite: Record<string, string>[] = [];
  let currencyByMetric: Record<string, string | undefined> = {};
  let errorMessage: string | null = null;

  try {
    accounts = await listAccounts();
    const account = accounts[0]?.name;

    if (!account) {
      errorMessage = "접근 가능한 애드센스 계정이 없습니다.";
    } else {
      const [saved, summary, sites] = await Promise.all([
        listSavedReports(account),
        generateReport(account, { dateRange: "TODAY" }),
        generateReport(account, {
          dateRange: "TODAY",
          dimensions: ["DOMAIN_NAME"],
          orderBy: ["-ESTIMATED_EARNINGS"],
          limit: 50,
        }),
      ]);

      savedReports = saved;
      totals = toRecords(summary)[0] ?? null;
      bySite = toRecords(sites);
      currencyByMetric = Object.fromEntries(
        (summary.headers ?? []).map((h) => [h.name, h.currencyCode]),
      );
    }
  } catch (error) {
    errorMessage =
      error instanceof AdSenseError
        ? error.message
        : "애드센스 보고서를 가져오지 못했습니다.";
  }

  const metricNames = METRIC_ORDER.filter((name) => totals && name in totals);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">애드센스 보고서</h1>
        <p className="text-muted-foreground text-sm">
          {accounts[0]
            ? `${accounts[0].displayName} (${accounts[0].name.replace("accounts/", "")}) · 오늘 기준`
            : "오늘 기준"}
        </p>
      </header>

      {errorMessage ? (
        <Card>
          <CardHeader>
            <CardTitle>불러오기 실패</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-sm">
            <p>
              최초 1회 인증이 필요합니다:{" "}
              <code>npm run adsense:auth</code>
            </p>
            <p>
              인증을 마치면 <code>.env</code> 에{" "}
              <code>ADSENSE_REFRESH_TOKEN</code> 이 저장되고, dev 서버를
              재시작하면 됩니다.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {totals ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metricNames.map((name) => (
            <Card key={name}>
              <CardHeader className="gap-1">
                <CardDescription>{METRIC_LABEL[name]}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatMetric(name, totals[name] ?? "", currencyByMetric[name])}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : null}

      {bySite.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>사이트별 성과</CardTitle>
            <CardDescription>오늘 · 예상 수익 순</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>도메인</TableHead>
                    {metricNames.map((name) => (
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
                      {metricNames.map((name) => (
                        <TableCell
                          key={name}
                          className="text-right tabular-nums"
                        >
                          {formatMetric(
                            name,
                            row[name] ?? "",
                            currencyByMetric[name],
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

      <Card>
        <CardHeader>
          <CardTitle>저장된 보고서</CardTitle>
          <CardDescription>
            애드센스에 저장해둔 보고서 {savedReports.length}개
          </CardDescription>
        </CardHeader>
        <CardContent>
          {savedReports.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              저장된 보고서가 없습니다.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {savedReports.map((report) => (
                <li
                  key={report.name}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                >
                  <span className="font-medium">{report.title}</span>
                  <code className="text-muted-foreground text-xs">
                    /api/adsense/reports?saved={report.name}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
