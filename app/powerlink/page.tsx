import { AdGroupSection } from "@/components/adgroup-section"
import { StatusText } from "@/components/status-text"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getUsdKrwRate } from "@/lib/fx"
import {
  NaverAdError,
  getPowerLinkCampaigns,
  todayInSeoul,
  type PowerLinkCampaign,
} from "@/lib/naver-ad"

export const dynamic = "force-dynamic"

const won = new Intl.NumberFormat("ko-KR")
const pct = (n: number) => `${n.toFixed(2)}%`

export default async function PowerLinkPage() {
  let campaigns: PowerLinkCampaign[] = []
  let statBaseTime: string | null = null
  let statLagMinutes: number | null = null
  let errorMessage: string | null = null

  const fx = await getUsdKrwRate()

  try {
    // 이 화면은 소재를 표시하지 않으므로 조회를 생략한다(광고그룹당 1회 호출 절약).
    const report = await getPowerLinkCampaigns({ includeAds: false })
    campaigns = report.campaigns
    statBaseTime = report.statBaseTime
    statLagMinutes = report.statLagMinutes
  } catch (error) {
    errorMessage =
      error instanceof NaverAdError
        ? error.message
        : "파워링크 목록을 가져오지 못했습니다."
  }

  const adgroupCount = campaigns.reduce((sum, c) => sum + c.adgroups.length, 0)
  const total = campaigns.reduce(
    (acc, c) => ({
      impCnt: acc.impCnt + c.stat.impCnt,
      clkCnt: acc.clkCnt + c.stat.clkCnt,
      salesAmt: acc.salesAmt + c.stat.salesAmt,
    }),
    { impCnt: 0, clkCnt: 0, salesAmt: 0 }
  )
  const totalCpc = total.clkCnt > 0 ? total.salesAmt / total.clkCnt : 0
  const totalCtr = total.impCnt > 0 ? (total.clkCnt / total.impCnt) * 100 : 0

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">파워링크 목록</h1>
        <p className="text-sm text-muted-foreground">
          네이버 검색광고에 등록된 파워링크(WEB_SITE) 캠페인 {campaigns.length}
          개 · 광고그룹 {adgroupCount}개 · 성과 기준 {todayInSeoul()} (오늘)
        </p>
        {statBaseTime ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            성과 집계 기준 {statBaseTime} (KST · API 응답의 cycleBaseTm)
            {statLagMinutes !== null ? ` · 약 ${statLagMinutes}분 전` : ""} — 이
            시각 이후 발생한 노출·클릭은 아직 반영되지 않아 검색광고 UI 보다
            작게 나옵니다.
          </p>
        ) : null}
      </header>

      {!errorMessage && campaigns.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "노출수", value: won.format(total.impCnt) },
            { label: "클릭수", value: won.format(total.clkCnt) },
            { label: "클릭률", value: pct(totalCtr) },
            {
              label: "평균 CPC",
              value: `${won.format(Math.round(totalCpc))}원`,
            },
            { label: "총비용", value: `${won.format(total.salesAmt)}원` },
          ].map((item) => (
            <Card key={item.label}>
              <CardHeader className="gap-1">
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {item.value}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : null}

      {errorMessage ? (
        <Card>
          <CardHeader>
            <CardTitle>불러오기 실패</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <code>.env</code> 의 <code>NAVER_AD_ACCESS_KEY</code>,{" "}
            <code>NAVER_AD_SECRET_KEY</code>, <code>NAVER_AD_CUSTOMER_ID</code>{" "}
            값을 확인해 주세요.
          </CardContent>
        </Card>
      ) : null}

      {!errorMessage && campaigns.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>등록된 파워링크가 없습니다</CardTitle>
            <CardDescription>
              검색광고 계정에 WEB_SITE 유형 캠페인이 없습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {campaigns.map((campaign) => (
        <AdGroupSection
          key={campaign.nccCampaignId}
          adgroups={campaign.adgroups}
          usdKrw={fx.usdKrw}
          header={
            <>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{campaign.name}</CardTitle>
                <StatusText
                  status={campaign.status}
                  userLock={campaign.userLock}
                />
              </div>
              <CardDescription>
                하루예산{" "}
                {campaign.useDailyBudget
                  ? `${won.format(campaign.dailyBudget)}원`
                  : "제한없음"}{" "}
                · 오늘 노출 {won.format(campaign.stat.impCnt)} · 클릭{" "}
                {won.format(campaign.stat.clkCnt)} · CPC{" "}
                {won.format(campaign.stat.cpc)}원 · 비용{" "}
                {won.format(campaign.stat.salesAmt)}원
              </CardDescription>
            </>
          }
        />
      ))}
    </main>
  )
}
