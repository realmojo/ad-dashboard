/**
 * playtherapy.or.kr 게시판 클라이언트.
 *
 * 이지데이와 달리 UTF-8 이라 인코딩 처리는 필요 없다.
 * 대신 글쓰기 폼마다 pcode 토큰이 새로 발급되므로,
 * 반드시 작성 페이지를 먼저 열어 값을 받아온 뒤 POST 해야 한다.
 */

const BASE = "https://www.playtherapy.or.kr"
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export const BOARDS = {
  자유게시판: { c: "1/47", cuid: "47", bid: "freeboard" },
}

export class PlayTherapyClient {
  constructor() {
    this.cookies = new Map()
  }

  #cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  }

  #absorb(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";")
      const idx = pair.indexOf("=")
      if (idx > 0) {
        this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim())
      }
    }
  }

  async #request(url, init = {}) {
    const res = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        Cookie: this.#cookieHeader(),
        ...(init.headers ?? {}),
      },
    })
    this.#absorb(res)
    return res
  }

  async login(id, password) {
    await this.#request(`${BASE}/index.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${BASE}/?mod=login`,
      },
      body: new URLSearchParams({
        r: "playt",
        a: "login",
        id,
        pw: password,
        idpwsave: "",
        referer: "",
      }).toString(),
    })

    // 로그인 응답만으로는 성공 여부를 알 수 없다. 목록에 아이디가 보이는지로 확인한다.
    const res = await this.#request(`${BASE}/?c=${BOARDS.자유게시판.c}`)
    const html = await res.text()
    if (!html.includes(id)) {
      throw new Error("놀이치료학회 로그인 실패. 아이디·비밀번호를 확인하세요.")
    }
    return { id }
  }

  /** 작성 페이지에서 pcode 토큰을 받아온다. 이 값 없이는 등록이 거부된다. */
  async #writeToken(board) {
    const res = await this.#request(`${BASE}/?c=${board.c}&mod=write`)
    const html = await res.text()
    const pcode = html.match(
      /name=["']pcode["'][^>]*value=["']([^"']+)["']/
    )?.[1]
    if (!pcode) throw new Error("작성 폼의 pcode 토큰을 찾지 못했습니다.")
    return pcode
  }

  async writePost({ board = BOARDS.자유게시판, title, html }) {
    if (!title?.trim()) throw new Error("제목이 비어 있습니다.")
    if (!html?.trim()) throw new Error("본문이 비어 있습니다.")

    // 등록 실패로 잘못 보고 다시 돌리면 같은 글이 두 번 올라간다. 먼저 확인한다.
    const already = await this.findPost(board, title)
    if (already) {
      throw new Error(`같은 제목의 글이 이미 있습니다: ${already}`)
    }

    const pcode = await this.#writeToken(board)

    const res = await this.#request(`${BASE}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${BASE}/?c=${board.c}&mod=write`,
      },
      body: new URLSearchParams({
        r: "playt",
        a: "write",
        c: board.c,
        cuid: board.cuid,
        m: "bbs",
        bid: board.bid,
        uid: "",
        reply: "",
        nlist: `/?c=${board.c}`,
        pcode,
        upfiles: "",
        subject: title,
        html: "HTML",
        content: html,
        backtype: "list",
      }).toString(),
    })

    const body = await res.text()
    const alert = body.match(/alert\s*\(\s*['"]([^'"]+)/)?.[1]
    if (alert) throw new Error(`등록 거부됨: ${alert}`)

    // 말로만 성공이라 하지 않고 목록에서 실제로 찾는다.
    const postUrl = await this.findPost(board, title)
    if (!postUrl) {
      throw new Error(
        `등록 결과를 확인할 수 없습니다 (HTTP ${res.status}). 게시판을 직접 확인하세요.`
      )
    }
    return { listUrl: `${BASE}/?c=${board.c}`, postUrl }
  }

  /** 목록 첫 페이지에서 제목으로 글을 찾는다. */
  async findPost(board, title) {
    const res = await this.#request(`${BASE}/?c=${board.c}`)
    const html = await res.text()
    for (const m of html.matchAll(
      /<a href="([^"]*uid=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/g
    )) {
      const text = m[2]
        .replace(/<[^>]+>/g, "")
        .replace(/\bNEW\b/g, "")
        .replace(/\s+/g, " ")
        .trim()
      if (text === title.trim()) {
        const href = m[1].replace(/&amp;/g, "&")
        return href.startsWith("http") ? href : `${BASE}${href}`
      }
    }
    return null
  }
}
