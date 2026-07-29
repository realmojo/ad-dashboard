"use client"

import { useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export type AdPlatform = "naver" | "kakao" | "all"

const TABS: Array<{ key: AdPlatform; label: string }> = [
  { key: "naver", label: "네이버" },
  { key: "kakao", label: "카카오" },
  { key: "all", label: "종합" },
]

/**
 * 매체별 검색광고를 탭으로 전환해 보여준다.
 * 각 탭의 내용은 서버에서 미리 그려 넘기고, 여기서는 보이기만 전환한다.
 * (탭을 눌러도 다시 불러오지 않아 즉시 바뀐다.)
 */
export function SearchAdTabs({
  naver,
  kakao,
  all,
  summary,
}: {
  naver: ReactNode
  kakao: ReactNode
  all: ReactNode
  /** 탭별 한 줄 요약 (비용 등) */
  summary?: Partial<Record<AdPlatform, string>>
}) {
  const [active, setActive] = useState<AdPlatform>("naver")

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="검색광고 매체"
        className="flex gap-1 rounded-lg bg-muted p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
              active === tab.key
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {summary?.[tab.key] ? (
              <span className="ml-1.5 text-xs opacity-70 tabular-nums">
                {summary[tab.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* 숨김 처리라 탭을 오갈 때 표의 정렬·선택 상태가 그대로 남는다. */}
      <div className={cn(active !== "naver" && "hidden")}>{naver}</div>
      <div className={cn(active !== "kakao" && "hidden")}>{kakao}</div>
      <div className={cn(active !== "all" && "hidden")}>{all}</div>
    </div>
  )
}
