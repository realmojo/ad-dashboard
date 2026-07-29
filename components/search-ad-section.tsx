import Link from "next/link"

import { KakaoAdPanel } from "@/components/kakao-ad-panel"
import { NaverAdBody } from "@/components/naver-ad-body"
import { SearchAdTabs } from "@/components/search-ad-tabs"
import { getUsdKrwRate } from "@/lib/fx"

/**
 * 네이버 · 카카오 · 종합 탭.
 * 세 내용을 모두 서버에서 그려 넘기므로 탭 전환이 즉시 이뤄진다.
 * 대신 첫 렌더에 두 매체를 모두 조회하므로 Suspense 로 감싸 쓰는 것이 좋다.
 */
export async function SearchAdSection({ date }: { date: string }) {
  const fx = await getUsdKrwRate().catch(() => null)

  const naver = <NaverAdBody date={date} fx={fx} />
  const kakao = <KakaoAdPanel date={date} fx={fx} />

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">검색광고</h2>
        <Link
          href="/powerlink"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          자세히 보기
        </Link>
      </div>

      <SearchAdTabs
        naver={naver}
        kakao={kakao}
        all={
          <div className="space-y-8">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                네이버 파워링크
              </h3>
              {naver}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                카카오 키워드광고
              </h3>
              {kakao}
            </div>
          </div>
        }
      />
    </section>
  )
}
