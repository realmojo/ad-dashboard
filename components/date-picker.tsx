"use client"

import { useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { clearAdGroupDetailCache } from "@/lib/adgroup-detail-store"
import { Button } from "@/components/ui/button"

/** "2026-07-27" → 하루 이동한 "2026-07-26". UTC 로 계산해 DST 영향을 받지 않는다. */
function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const at = Date.UTC(y!, m! - 1, d! + days)
  return new Date(at).toISOString().slice(0, 10)
}

export function DatePicker({
  date,
  today,
}: {
  /** 현재 선택된 날짜 "YYYY-MM-DD" */
  date: string
  /** KST 기준 오늘. 이보다 미래는 고를 수 없다. */
  today: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function go(next: string) {
    if (next > today) return
    clearAdGroupDetailCache()
    startTransition(() => {
      // 오늘이면 쿼리를 비워 기본 상태(URL 깔끔)로 둔다.
      router.push(next === today ? pathname : `${pathname}?date=${next}`)
    })
  }

  const isToday = date === today

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        onClick={() => go(shiftDay(date, -1))}
        disabled={isPending}
        aria-label="이전 날짜"
      >
        <ChevronLeft className="size-4" />
      </Button>

      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => {
          if (e.target.value) go(e.target.value)
        }}
        disabled={isPending}
        aria-label="날짜 선택"
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      <Button
        variant="outline"
        size="icon"
        onClick={() => go(shiftDay(date, 1))}
        disabled={isPending || isToday}
        aria-label="다음 날짜"
      >
        <ChevronRight className="size-4" />
      </Button>

      {!isToday ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(today)}
          disabled={isPending}
        >
          오늘
        </Button>
      ) : null}
    </div>
  )
}
