/**
 * 네이버 소재의 랜딩 URL 과 애드센스 URL 채널을 같은 형태로 맞추기 위한 정규화.
 * 서버·클라이언트 양쪽에서 쓰므로 의존성 없이 둔다.
 *
 *   "https://info.mindpang.com/hospital-bill-refund"      → "info.mindpang.com/hospital-bill-refund"
 *   "ca-pub-913...:info.mindpang.com/hospital-bill-refund" → "info.mindpang.com/hospital-bill-refund"
 */
export function normalizeUrl(value: string): string {
  let url = value.trim()
  if (!url) return ""

  // 애드센스 URL 채널은 "ca-pub-숫자:" 접두어가 붙는다.
  const pub = url.match(/^ca-pub-\d+:(.*)$/)
  if (pub?.[1]) url = pub[1]

  url = url.replace(/^https?:\/\//i, "")
  url = url.replace(/^www\./i, "")
  url = url.split(/[?#]/)[0] ?? ""
  url = url.replace(/\/+$/, "")

  return url.toLowerCase()
}
