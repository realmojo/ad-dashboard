import { Suspense } from "react"

import { AdSensePanel } from "@/components/adsense-panel"
import { DatePicker } from "@/components/date-picker"
import { SearchAdSection } from "@/components/search-ad-section"
import { ProfitSummary } from "@/components/profit-summary"
import { RealtimeSection } from "@/components/realtime-section"
import { LoginScreen } from "@/components/login-screen"
import { RefreshControl } from "@/components/refresh-control"
import { todayInSeoul } from "@/lib/naver-ad"
import { getSession } from "@/lib/session"

export const dynamic = "force-dynamic"

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/

function PanelSkeleton({ title }: { title: string }) {
  return (
    <section className="min-w-0 space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </section>
  )
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string }>
}) {
  const { date: raw, error } = await searchParams

  // 허용된 구글 계정으로 로그인해야 대시보드를 보여준다.
  const session = await getSession()
  if (!session) return <LoginScreen error={error} />

  const today = todayInSeoul()
  // 형식이 어긋나거나 미래 날짜면 오늘로 되돌린다.
  const date = raw && DATE_FORMAT.test(raw) && raw <= today ? raw : today

  return (
    <main className="mx-auto w-full max-w-[110rem] space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
          <p className="text-sm text-muted-foreground">
            네이버 검색광고와 구글 애드센스 성과
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* 두 API 를 모두 기다리므로 헤더 렌더를 막지 않도록 따로 스트리밍한다. */}
          <Suspense
            key={`profit-${date}`}
            fallback={
              <div className="h-11 w-72 animate-pulse rounded-lg bg-muted" />
            }
          >
            <ProfitSummary date={date} />
          </Suspense>
          <DatePicker date={date} today={today} />
          <RefreshControl />
        </div>
      </header>

      {/* 2:4:4 분할. 각 패널은 독립적으로 스트리밍되어 한쪽이 느려도 다른 쪽이 먼저 표시된다. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
        <div className="min-w-0 lg:col-span-2">
          <Suspense fallback={<PanelSkeleton title="실시간" />}>
            <RealtimeSection />
          </Suspense>
        </div>
        {/* key 에 날짜를 넣어 날짜가 바뀌면 스켈레톤부터 다시 보이게 한다. */}
        <div className="min-w-0 lg:col-span-4">
          <Suspense
            key={`search-ad-${date}`}
            fallback={<PanelSkeleton title="검색광고" />}
          >
            <SearchAdSection date={date} />
          </Suspense>
        </div>
        <div className="min-w-0 lg:col-span-4">
          <Suspense
            key={`adsense-${date}`}
            fallback={<PanelSkeleton title="애드센스 보고서" />}
          >
            <AdSensePanel date={date} />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
