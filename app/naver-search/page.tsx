import Link from "next/link"

import { NaverSearchPanes } from "@/components/naver-search-panes"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "네이버 검색 비교",
}

export default async function NaverSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams

  return (
    <main className="mx-auto flex h-svh w-full max-w-[120rem] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          네이버 검색 비교
        </h1>
        <Link
          href="/"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          대시보드로
        </Link>
      </header>

      <NaverSearchPanes initialQuery={q ?? ""} />
    </main>
  )
}
