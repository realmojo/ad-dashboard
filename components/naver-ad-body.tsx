import { AdGroupSection } from "@/components/adgroup-section"
import { StatTile } from "@/components/stat-tile"
import { StatusText } from "@/components/status-text"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatFxTime, krwToUsd, type FxRate } from "@/lib/fx"
import { PANEL_CARD_HEIGHT } from "@/lib/layout"
import { getNaverReport } from "@/lib/ad-report-cache"
import {
  NaverAdError,
  todayInSeoul,
  type PowerLinkCampaign,
} from "@/lib/naver-ad"
import { cn } from "@/lib/utils"

const won = new Intl.NumberFormat("ko-KR")

export async function NaverAdBody({
  date,
  fx,
}: {
  date?: string
  fx: FxRate | null
}) {
  let campaigns: PowerLinkCampaign[] = []
  let statBaseTime: string | null = null
  let statLagMinutes: number | null = null
  let errorMessage: string | null = null

  const selectedDate = date ?? todayInSeoul()

  try {
    const report = await getNaverReport(selectedDate)
    campaigns = report.campaigns
    statBaseTime = report.statBaseTime
    statLagMinutes = report.statLagMinutes
  } catch (error) {
    errorMessage =
      error instanceof NaverAdError
        ? error.message
        : "파워링크 성과를 가져오지 못했습니다."
  }

  const total = campaigns.reduce(
    (acc, c) => ({
      impCnt: acc.impCnt + c.stat.impCnt,
      clkCnt: acc.clkCnt + c.stat.clkCnt,
      salesAmt: acc.salesAmt + c.stat.salesAmt,
    }),
    { impCnt: 0, clkCnt: 0, salesAmt: 0 }
  )
  const cpc = total.clkCnt > 0 ? total.salesAmt / total.clkCnt : 0
  const adgroups = campaigns.flatMap((c) => c.adgroups)

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">불러오기 실패</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <code>.env</code> 의 검색광고 API 키를 확인해 주세요.
          </CardContent>
        </Card>
      ) : (
        <>
          {statBaseTime ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              집계 기준 {statBaseTime}
              {statLagMinutes !== null ? ` · 약 ${statLagMinutes}분 전` : ""} —
              이후 발생분은 아직 반영되지 않습니다.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {selectedDate}
            {selectedDate === todayInSeoul() ? " (오늘)" : ""} · 캠페인{" "}
            {campaigns.length}개 · 광고그룹 {adgroups.length}개
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="노출수" value={won.format(total.impCnt)} />
            <StatTile label="클릭수" value={won.format(total.clkCnt)} />
            <StatTile
              label="평균 CPC"
              value={`${won.format(Math.round(cpc))}원`}
            />
            <StatTile
              label="총비용"
              value={`${won.format(total.salesAmt)}원`}
            />
          </div>

          {campaigns.map((campaign) => (
            <AdGroupSection
              key={campaign.nccCampaignId}
              adgroups={campaign.adgroups}
              cardClassName={cn("flex flex-col", PANEL_CARD_HEIGHT)}
              contentClassName="min-h-0 flex-1 overflow-auto"
              stickyHeader
              date={selectedDate}
              usdKrw={fx?.usdKrw}
              header={
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">
                        {campaign.name}
                      </CardTitle>
                      <StatusText
                        status={campaign.status}
                        userLock={campaign.userLock}
                      />
                    </div>
                    <div className="ml-auto flex items-baseline gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        총 비용
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {fx ? krwToUsd(campaign.stat.salesAmt, fx.usdKrw) : "-"}
                      </span>
                    </div>
                  </div>
                  <CardDescription>
                    노출 {won.format(campaign.stat.impCnt)} · 클릭{" "}
                    {won.format(campaign.stat.clkCnt)} · 비용{" "}
                    {won.format(campaign.stat.salesAmt)}원
                    {fx
                      ? ` (1 USD = ${won.format(Math.round(fx.usdKrw))}원 · ${fx.sourceLabel}${formatFxTime(fx.updatedAt) ? ` ${formatFxTime(fx.updatedAt)} 기준` : ""})`
                      : ""}
                  </CardDescription>
                </>
              }
            />
          ))}
        </>
      )}
    </div>
  )
}
