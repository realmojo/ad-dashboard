import { AdSenseError } from "@/lib/adsense"
import { Ga4Error } from "@/lib/ga4"
import { GoogleAuthError } from "@/lib/google-auth"
import { NaverAdError } from "@/lib/naver-ad"

/**
 * 화면에 보여줄 오류 문구.
 *
 * 인증 단계(GoogleAuthError)는 애드센스/GA4 오류와 클래스가 달라서,
 * 개별 instanceof 검사만 하면 "설정이 없다" 같은 실제 사유가
 * 일반 문구에 묻혀 원인을 못 찾게 된다.
 */
export function describeError(error: unknown, fallback: string): string {
  if (
    error instanceof GoogleAuthError ||
    error instanceof AdSenseError ||
    error instanceof Ga4Error ||
    error instanceof NaverAdError
  ) {
    return error.message
  }
  // 예상 못 한 오류도 원인을 알 수 있게 메시지는 남긴다.
  if (error instanceof Error && error.message) {
    return `${fallback} (${error.message})`
  }
  return fallback
}
