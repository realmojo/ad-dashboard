"use client"

import { useMemo, useSyncExternalStore } from "react"
import { X } from "lucide-react"

import {
  clearHistory,
  getServerSnapshot,
  getSnapshot,
  parseHistory,
  removeHistory,
  subscribe,
} from "@/lib/search-history"
import { cn } from "@/lib/utils"

const num = new Intl.NumberFormat("ko-KR")

/** 여태 검색한 키워드 목록. 누르면 그 검색어로 다시 본다. */
export function SearchHistoryPanel({
  current,
  onPick,
}: {
  current: string
  onPick: (term: string) => void
}) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const terms = useMemo(() => parseHistory(raw), [raw])

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border lg:w-56">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium">
          검색 기록
          {terms.length > 0 ? (
            <span className="ml-1 tabular-nums opacity-70">
              {num.format(terms.length)}
            </span>
          ) : null}
        </span>
        {terms.length > 0 ? (
          <button
            type="button"
            onClick={clearHistory}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            전체 삭제
          </button>
        ) : null}
      </div>

      {terms.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          검색하면 여기에 쌓입니다.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto p-1">
          {terms.map((term) => (
            <li key={term} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPick(term)}
                title={term}
                className={cn(
                  "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  term === current && "bg-muted font-medium"
                )}
              >
                {term}
              </button>
              <button
                type="button"
                onClick={() => removeHistory(term)}
                aria-label={`${term} 기록 삭제`}
                title="기록에서 지우기"
                // 마우스가 없는 환경에서도 닿을 수 있게 항상 자리는 잡아 둔다.
                className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
