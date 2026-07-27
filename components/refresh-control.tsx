"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"

import { clearAdGroupDetailCache } from "@/lib/adgroup-detail-store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** 자동 새로고침 주기. 검색광고 통계가 1시간 단위로 갱신되므로 30분이면 충분하다. */
const INTERVAL_MS = 30 * 60 * 1000

const clock = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

export function RefreshControl() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [auto, setAuto] = useState(true)
  // 서버/클라이언트 시각이 달라 하이드레이션이 어긋나지 않도록, 첫 갱신 후에만 표시한다.
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  const refresh = useCallback(() => {
    // 광고그룹 상세는 클라이언트에 캐시돼 있어 같이 비워야 새 성과가 보인다.
    clearAdGroupDetailCache()
    setLastRefreshed(clock.format(new Date()))
    startTransition(() => {
      router.refresh()
    })
  }, [router])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(refresh, INTERVAL_MS)
    return () => clearInterval(id)
  }, [auto, refresh])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {lastRefreshed ? `${lastRefreshed} 갱신` : "30분마다 자동 갱신"}
      </span>

      <Button
        variant={auto ? "secondary" : "outline"}
        size="sm"
        onClick={() => setAuto((prev) => !prev)}
        aria-pressed={auto}
      >
        자동 새로고침 {auto ? "켜짐" : "꺼짐"}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={refresh}
        disabled={isPending}
        aria-label="지금 새로고침"
      >
        <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
        {isPending ? "불러오는 중" : "새로고침"}
      </Button>
    </div>
  )
}
