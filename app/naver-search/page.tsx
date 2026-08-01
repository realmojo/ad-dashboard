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
      {/* 제목 없이 검색창부터 바로 시작한다. 화면을 결과에 다 쓴다. */}
      <NaverSearchPanes initialQuery={q ?? ""} />
    </main>
  )
}
