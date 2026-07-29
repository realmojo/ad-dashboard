"use client"

import { useEffect, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { RealtimeResult } from "@/lib/ga4"

/** 실시간 지표라 짧게 갱신한다. GA4 자체도 분 단위로 움직인다. */
const POLL_MS = 30_000

const num = new Intl.NumberFormat("ko-KR")

export function RealtimePanel({ initial }: { initial: RealtimeResult | null }) {
  const [data, setData] = useState<RealtimeResult | null>(initial)
  const [error, setError] = useState<string | null>(null)

  // 새로고침을 누르면 서버가 새 initial 을 넘기지만, useState 는 최초 한 번만
  // 쓰이므로 그대로 두면 30초 폴링 전까지 옛 값이 남는다. 바뀌면 즉시 반영한다.
  const [seenInitial, setSeenInitial] = useState(initial)
  if (initial !== seenInitial) {
    setSeenInitial(initial)
    if (initial) {
      setData(initial)
      setError(null)
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = () => {
      fetch("/api/ga4/realtime")
        .then(async (res) => {
          const body = await res.json()
          if (!res.ok) throw new Error(body.error ?? "조회 실패")
          return body as RealtimeResult
        })
        .then((body) => {
          if (cancelled) return
          setData(body)
          setError(null)
        })
        .catch((e: Error) => {
          // 일시적 실패로 화면을 비우지 않고, 직전 값을 그대로 둔다.
          if (!cancelled) setError(e.message)
        })
    }

    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const peak = data ? Math.max(1, ...data.perMinute) : 1
  const totalViews = data?.pages.reduce((sum, p) => sum + p.views, 0) ?? 0

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">실시간</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-[5px] shrink-0 animate-pulse rounded-full bg-emerald-500" />
          30초마다 갱신
        </span>
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardDescription>지난 30분 동안의 활성 사용자</CardDescription>
          <CardTitle className="text-4xl tabular-nums">
            {data ? num.format(data.activeUsers) : "–"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-xs text-muted-foreground">분당 활성 사용자</p>
          {/* 30칸 막대. 오른쪽이 현재에 가깝다. */}
          <div className="flex h-12 items-end gap-px" aria-hidden>
            {(data?.perMinute ?? new Array(30).fill(0)).map((value, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-sm",
                  value > 0 ? "bg-blue-500" : "bg-muted"
                )}
                style={{
                  height: value > 0 ? `${(value / peak) * 100}%` : "2px",
                }}
                title={`${29 - i}분 전 · ${value}명`}
              />
            ))}
          </div>
          {error ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              갱신 실패 — {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            페이지 제목 및 화면 이름별 조회수
          </CardTitle>
          <CardDescription>
            {data
              ? `${num.format(data.pages.length)}개 · 조회수 ${num.format(totalViews)}`
              : "불러오는 중"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : data.pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              최근 30분간 조회된 페이지가 없습니다.
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-auto">
              {data.pages.map((page, i) => (
                <li key={`${page.title}-${i}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm",
                        !page.title && "text-muted-foreground italic"
                      )}
                      title={page.title || "페이지 제목이 수집되지 않았습니다"}
                    >
                      {/* GA4 가 page_title 을 못 받은 경우가 있어 빈칸으로 두지 않는다. */}
                      {page.title || "(제목 없음)"}
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {num.format(page.views)}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted">
                    <div
                      className="h-1 rounded-full bg-blue-500"
                      style={{
                        width: `${totalViews > 0 ? (page.views / totalViews) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
