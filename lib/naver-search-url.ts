/**
 * 네이버 검색 결과 주소. 중계 라우트와 화면의 "새 탭" 링크가 같은 곳을
 * 가리켜야 하므로 한 곳에서 만든다. 의존성 없이 서버·클라이언트 양쪽에서 쓴다.
 */
export type SearchDevice = "pc" | "mobile"

export function buildNaverSearchUrl(query: string, device: SearchDevice) {
  const q = encodeURIComponent(query)
  return device === "pc"
    ? `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=${q}`
    : `https://m.search.naver.com/search.naver?sm=mtp_hty.top&where=m&query=${q}`
}
