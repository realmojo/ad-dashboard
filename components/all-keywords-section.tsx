import { AllKeywordsCard } from "@/components/all-keywords-card"
import { getAllKakaoKeywords } from "@/lib/kakao-ad"
import { getAllKeywords, type FlatKeyword } from "@/lib/naver-ad"

/**
 * 키워드 목록은 광고그룹 수만큼 호출이 필요해 느리다(네이버 32개 + 카카오).
 * 키워드 구성은 자주 바뀌지 않으므로 잠시 캐시해 재사용한다.
 * 성과 수치는 여기 담지 않으므로 오래된 값이 문제되지 않는다.
 */
const CACHE_MS = 5 * 60_000

let cached: { at: number; keywords: FlatKeyword[] } | null = null

async function loadKeywords(): Promise<{
  keywords: FlatKeyword[]
  error: string | null
}> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { keywords: cached.keywords, error: null }
  }

  const [naver, kakao] = await Promise.all([
    getAllKeywords().catch(() => null),
    getAllKakaoKeywords().catch(() => null),
  ])

  if (naver === null && kakao === null) {
    // 둘 다 실패하면 직전 값이라도 보여 준다.
    return {
      keywords: cached?.keywords ?? [],
      error: cached ? null : "키워드를 가져오지 못했습니다.",
    }
  }

  const keywords = [...(naver ?? []), ...(kakao ?? [])]
  cached = { at: Date.now(), keywords }
  return { keywords, error: null }
}

export async function AllKeywordsSection() {
  const { keywords, error } = await loadKeywords()
  return <AllKeywordsCard keywords={keywords} error={error} />
}
