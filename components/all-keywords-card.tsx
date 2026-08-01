"use client"

import { useMemo, useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"

import { CopyButton } from "@/components/copy-button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { KEYWORD_STATE_CLASS, keywordState } from "@/components/status-text"
import type { AllKeywordsResult } from "@/lib/all-keywords-cache"
import type { FlatKeyword } from "@/lib/naver-ad"
import { cn } from "@/lib/utils"

const num = new Intl.NumberFormat("ko-KR")

type TabKey = "live" | "review"

const clock = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export function AllKeywordsCard({
  keywords: initial,
  error: initialError,
  fetchedAt: initialFetchedAt,
}: {
  keywords: FlatKeyword[]
  error?: string | null
  fetchedAt?: number | null
}) {
  const [active, setActive] = useState<TabKey>("live")
  const [keywords, setKeywords] = useState(initial)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(
    initialFetchedAt ?? null
  )
  const [isRefreshing, startRefresh] = useTransition()

  // 새로고침으로 서버가 새 값을 넘기면 그대로 반영한다.
  const [seen, setSeen] = useState(initial)
  if (initial !== seen) {
    setSeen(initial)
    setKeywords(initial)
    setError(initialError ?? null)
    setFetchedAt(initialFetchedAt ?? null)
  }

  const refresh = () => {
    startRefresh(async () => {
      try {
        // 캐시를 건너뛰고 다시 조회한다.
        const res = await fetch("/api/keywords/all?force=1")
        const body = (await res.json()) as AllKeywordsResult
        if (!res.ok) throw new Error("조회 실패")
        setKeywords(body.keywords)
        setError(body.error)
        setFetchedAt(body.fetchedAt)
      } catch {
        setError("갱신에 실패했습니다.")
      }
    })
  }

  // 노출중 / 그 외(검토중·중지 등)로 나눈다.
  const { live, review } = useMemo(() => {
    const live: FlatKeyword[] = []
    const review: FlatKeyword[] = []
    for (const keyword of keywords) {
      const state = keywordState(keyword)
      ;(state.tone === "ok" ? live : review).push(keyword)
    }
    const byName = (a: FlatKeyword, b: FlatKeyword) =>
      a.keyword.localeCompare(b.keyword, "ko")
    return { live: live.sort(byName), review: review.sort(byName) }
  }, [keywords])

  const rows = active === "live" ? live : review

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "live", label: "노출중", count: live.length },
    { key: "review", label: "검토중·기타", count: review.length },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">전체 키워드</CardTitle>
          <div className="flex items-center gap-1.5">
            {rows.length > 0 ? (
              <CopyButton
                text={rows.map((k) => k.keyword).join("\n")}
                label="복사"
                copiedLabel={`${rows.length}개 복사됨`}
                title="현재 탭의 키워드를 한 줄에 하나씩 복사합니다"
              />
            ) : null}
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              title="캐시를 건너뛰고 키워드를 다시 불러옵니다"
              aria-label="키워드 새로고침"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border p-1 text-xs transition-colors hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw
                className={cn("size-3", isRefreshing && "animate-spin")}
                aria-hidden
              />
            </button>
          </div>
        </div>
        <CardDescription>
          {error
            ? "불러오기 실패"
            : `${num.format(keywords.length)}개 · 광고그룹 전체${
                fetchedAt ? ` · ${clock.format(fetchedAt)} 기준` : ""
              }`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="키워드 상태"
              className="flex gap-1 rounded-lg bg-muted p-1"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active === tab.key}
                  onClick={() => setActive(tab.key)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs transition-colors",
                    active === tab.key
                      ? "bg-background font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  <span className="ml-1 tabular-nums opacity-70">
                    {num.format(tab.count)}
                  </span>
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                해당하는 키워드가 없습니다.
              </p>
            ) : (
              <ul className="max-h-[32rem] space-y-1.5 overflow-auto">
                {rows.map((keyword) => {
                  const state = keywordState(keyword)
                  return (
                    <li
                      key={`${keyword.platform}-${keyword.keywordId}`}
                      className="flex items-baseline justify-between gap-2 border-b pb-1.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <div
                          className="truncate text-sm"
                          title={keyword.keyword}
                        >
                          {keyword.keyword}
                        </div>
                        <div
                          className="truncate text-xs text-muted-foreground"
                          title={keyword.adgroupName}
                        >
                          {keyword.platform === "kakao" ? "카카오 · " : ""}
                          {keyword.adgroupName}
                        </div>
                      </div>
                      {/* 노출중 탭에서는 모두 같은 상태라 굳이 반복하지 않는다. */}
                      {active === "review" ? (
                        <span
                          className={cn(
                            "shrink-0 text-xs font-medium whitespace-nowrap",
                            KEYWORD_STATE_CLASS[state.tone]
                          )}
                        >
                          {state.label}
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
