import { AdGroupSection } from "@/components/adgroup-section"
import { StatTile } from "@/components/stat-tile"
import { StatusDot } from "@/components/status-text"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatFxTime, krwToUsd, type FxRate } from "@/lib/fx"
import { getKakaoReport } from "@/lib/ad-report-cache"
import { KakaoAdError, type KakaoCampaignWithStat } from "@/lib/kakao-ad"
import { cn } from "@/lib/utils"

const won = new Intl.NumberFormat("ko-KR")

/** 카카오 상태 코드의 한글 표기. 목록에 없으면 원문을 그대로 쓴다. */
const STATUS_LABEL: Record<string, string> = {
  ELIGIBLE: "정상",
  PAUSED: "중지",
  OFF_BY_BIZ_CHANNEL_WAITING: "비즈채널 심사 대기",
  OFF_BY_BIZ_CHANNEL_REJECTED: "비즈채널 거절",
  OFF_BY_CAMPAIGN_BUDGET: "캠페인 예산 소진",
  OFF_BY_ADGROUP_BUDGET: "그룹 예산 소진",
  OFF_BY_AD_ACCOUNT: "광고계정 중지",
  OFF_BY_SCHEDULE: "일정상 중지",
}

export async function KakaoAdPanel({
  date,
  fx,
}: {
  date: string
  fx: FxRate | null
}) {
  let campaigns: KakaoCampaignWithStat[] = []
  let errorMessage: string | null = null

  try {
    campaigns = (await getKakaoReport(date)).campaigns
  } catch (error) {
    errorMessage =
      error instanceof KakaoAdError
        ? error.message
        : "카카오 키워드광고 성과를 가져오지 못했습니다."
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
  const ctr = total.impCnt > 0 ? (total.clkCnt / total.impCnt) * 100 : 0
  const adgroups = campaigns.flatMap((c) => c.adgroups)

  if (errorMessage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">불러오기 실패</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <code>npm run kakao:auth</code> 로 인증하거나, 배포 환경에서는{" "}
          <code>KAKAO_ACCESS_TOKEN</code> 시크릿을 확인해 주세요.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {date} · 캠페인 {campaigns.length}개 · 광고그룹 {adgroups.length}개
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="노출수" value={won.format(total.impCnt)} />
        <StatTile label="클릭수" value={won.format(total.clkCnt)} />
        <StatTile label="클릭률" value={`${ctr.toFixed(2)}%`} />
        <StatTile label="평균 CPC" value={`${won.format(Math.round(cpc))}원`} />
        <StatTile label="총비용" value={`${won.format(total.salesAmt)}원`} />
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">캠페인이 없습니다</CardTitle>
            <CardDescription>
              카카오 키워드광고에 등록된 캠페인이 없습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {campaigns.map((campaign) => (
        <AdGroupSection
          key={campaign.nccCampaignId}
          adgroups={campaign.adgroups}
          date={date}
          usdKrw={fx?.usdKrw}
          platform="kakao"
          header={
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{campaign.name}</CardTitle>
                  <StatusDot
                    status={campaign.status}
                    userLock={campaign.userLock}
                  />
                  {campaign.status !== "ELIGIBLE" || campaign.userLock ? (
                    <span
                      className={cn(
                        "text-xs font-medium",
                        "text-red-600 dark:text-red-400"
                      )}
                    >
                      {STATUS_LABEL[campaign.status] ?? campaign.status}
                    </span>
                  ) : null}
                </div>
                {fx ? (
                  <div className="ml-auto flex items-baseline gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      총 비용
                    </span>
                    <span className="text-lg font-bold tabular-nums">
                      {krwToUsd(campaign.stat.salesAmt, fx.usdKrw)}
                    </span>
                  </div>
                ) : null}
              </div>
              <CardDescription>
                노출 {won.format(campaign.stat.impCnt)} · 클릭{" "}
                {won.format(campaign.stat.clkCnt)} · 비용{" "}
                {won.format(campaign.stat.salesAmt)}원
                {fx
                  ? ` (1 USD = ${won.format(Math.round(fx.usdKrw))}원 · ${fx.sourceLabel}${
                      formatFxTime(fx.updatedAt)
                        ? ` ${formatFxTime(fx.updatedAt)} 기준`
                        : ""
                    })`
                  : ""}
              </CardDescription>
            </>
          }
        />
      ))}
    </div>
  )
}
