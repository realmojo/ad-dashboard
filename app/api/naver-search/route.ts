import { NextResponse, type NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * 네이버 검색 결과를 우리 도메인으로 중계한다.
 *
 * 네이버는 X-Frame-Options: DENY 와 frame-ancestors 'none' 을 내려
 * iframe 직접 삽입을 막는다. 여기서 받아 그 헤더 없이 다시 내려주면
 * 브라우저가 화면에 그릴 수 있다.
 */
const UA = {
  pc: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  mobile:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
}

function buildUrl(query: string, device: "pc" | "mobile") {
  const q = encodeURIComponent(query)
  return device === "pc"
    ? `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=${q}`
    : `https://m.search.naver.com/search.naver?sm=mtp_hty.top&where=m&query=${q}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q")?.trim()
  const device = searchParams.get("device") === "mobile" ? "mobile" : "pc"

  if (!query) {
    return new NextResponse(
      "<!doctype html><meta charset='utf-8'><p style='font:14px system-ui;padding:16px;color:#888'>검색어를 입력하세요.</p>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  }

  const target = buildUrl(query, device)

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": UA[device],
        "Accept-Language": "ko-KR,ko;q=0.9",
        Referer: "https://www.naver.com/",
      },
      cache: "no-store",
    })

    let html = await response.text()

    // 상대 경로 자원과 링크가 네이버 쪽으로 향하도록 base 를 심는다.
    // target="_blank" 를 함께 줘서, 결과를 클릭하면 iframe 안에서 열리지 않고
    // 새 탭으로 뜬다(네이버가 iframe 을 막으므로 안에서 열면 빈 화면이 된다).
    const origin =
      device === "pc"
        ? "https://search.naver.com/"
        : "https://m.search.naver.com/"
    const base = `<base href="${origin}" target="_blank">`

    html = html.replace(/<head([^>]*)>/i, `<head$1>${base}`)

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // 네이버가 준 프레임 차단 헤더는 그대로 넘기지 않는다.
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[naver-search]", error)
    return new NextResponse(
      `<!doctype html><meta charset='utf-8'><p style="font:14px system-ui;padding:16px;color:#c00">불러오지 못했습니다.</p>`,
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  }
}
