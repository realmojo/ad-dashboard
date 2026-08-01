import { getAllKakaoKeywords } from "@/lib/kakao-ad"
import { getAllKeywords, type FlatKeyword } from "@/lib/naver-ad"

/**
 * 키워드 목록은 광고그룹 수만큼 호출이 필요해 느리다(일괄 조회 API 없음).
 * 구성이 자주 바뀌지 않으므로 잠시 캐시해 재사용한다.
 * 성과 수치는 담지 않으므로 조금 오래된 값이어도 문제되지 않는다.
 */
const CACHE_MS = 5 * 60_000

let cached: { at: number; keywords: FlatKeyword[] } | null = null

export interface AllKeywordsResult {
  keywords: FlatKeyword[]
  error: string | null
  /** 캐시된 값을 쓴 시각. 화면에 "언제 기준"인지 보여 준다. */
  fetchedAt: number | null
}

/** force 를 주면 캐시를 무시하고 다시 조회한다(새로고침 버튼용). */
export async function loadAllKeywords(
  force = false
): Promise<AllKeywordsResult> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    return { keywords: cached.keywords, error: null, fetchedAt: cached.at }
  }

  const [naver, kakao] = await Promise.all([
    getAllKeywords().catch(() => null),
    getAllKakaoKeywords().catch(() => null),
  ])

  if (naver === null && kakao === null) {
    // 둘 다 실패하면 직전 값이라도 보여 준다.
    return {
      keywords: cached?.keywords ?? [],
      error: cached
        ? "갱신 실패 — 직전 값입니다."
        : "키워드를 가져오지 못했습니다.",
      fetchedAt: cached?.at ?? null,
    }
  }

  const keywords = [...(naver ?? []), ...(kakao ?? [])]
  cached = { at: Date.now(), keywords }
  return { keywords, error: null, fetchedAt: cached.at }
}
