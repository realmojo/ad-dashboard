"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { RefreshCw, Search } from "lucide-react"

import { buildNaverSearchUrl, type SearchDevice } from "@/lib/naver-search-url"
import { cn } from "@/lib/utils"

/**
 * PC · 모바일 검색 결과를 나란히 보여준다.
 *
 * 네이버는 iframe 삽입을 막으므로 /api/naver-search 중계를 거친다.
 * 결과 안의 링크는 base target="_blank" 로 새 탭에서 열린다.
 */
export function NaverSearchPanes({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const pathname = usePathname()

  const [input, setInput] = useState(initialQuery)
  // 실제로 불러온 검색어. 입력만 하고 엔터를 누르지 않으면 화면은 그대로 둔다.
  const [query, setQuery] = useState(initialQuery)
  // 같은 검색어로 다시 눌러도 iframe 이 새로 로드되도록 쓰는 값.
  const [reloadKey, setReloadKey] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // 주소의 q 가 바뀌면(뒤로가기 등) 화면을 맞춘다.
  // effect 로 하면 렌더가 한 번 더 도므로 렌더 중에 정리한다.
  const [seenQuery, setSeenQuery] = useState(initialQuery)
  if (initialQuery !== seenQuery) {
    setSeenQuery(initialQuery)
    setInput(initialQuery)
    setQuery(initialQuery)
  }

  const submit = (next: string) => {
    const trimmed = next.trim()
    if (!trimmed) return
    setQuery(trimmed)
    setReloadKey((n) => n + 1)
    // 새로고침하거나 공유해도 같은 검색어가 열리도록 주소에 남긴다.
    router.replace(`${pathname}?q=${encodeURIComponent(trimmed)}`, {
      scroll: false,
    })
  }

  // 화면에 그리는 건 중계를 거치지만,
  // 새 탭은 네이버 실제 주소로 연다.
  const src = (device: SearchDevice) =>
    `/api/naver-search?q=${encodeURIComponent(query)}&device=${device}`

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="검색어를 입력하고 엔터"
            aria-label="검색어"
            className="h-10 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        <button
          type="submit"
          className="h-10 shrink-0 rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          검색
        </button>
        <button
          type="button"
          onClick={() => submit(query || input)}
          disabled={!query}
          title="같은 검색어로 다시 불러오기"
          aria-label="다시 불러오기"
          className="h-10 shrink-0 rounded-md border px-3 transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className="size-4" aria-hidden />
        </button>
        {/* 제목 줄을 없앴으므로 돌아가는 길은 여기에 둔다. */}
        <Link
          href="/"
          className="flex h-10 shrink-0 items-center rounded-md border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          대시보드
        </Link>
      </form>

      {!query ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            검색어를 입력하면 PC · 모바일 결과를 나란히 보여줍니다.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          {(
            [
              { device: "pc", label: "PC" },
              { device: "mobile", label: "모바일" },
            ] as const
          ).map(({ device, label }) => (
            <section
              key={device}
              className={cn(
                "flex min-h-0 flex-col overflow-hidden rounded-lg border",
                // 모바일 결과는 실제 폭에 가깝게 좁혀 보여 준다.
                device === "mobile" && "mx-auto w-full max-w-[26rem] lg:mx-0"
              )}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-medium">{label}</span>
                <a
                  href={buildNaverSearchUrl(query, device)}
                  target="_blank"
                  rel="noreferrer"
                  title="네이버에서 직접 열기"
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  새 탭
                </a>
              </div>
              <iframe
                key={`${device}-${reloadKey}`}
                src={src(device)}
                title={`네이버 ${label} 검색 결과`}
                className="min-h-0 flex-1 bg-white"
              />
            </section>
          ))}
        </div>
      )}
    </>
  )
}
