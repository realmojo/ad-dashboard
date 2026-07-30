import iconv from "iconv-lite"

/**
 * ezday.co.kr 게시판 클라이언트.
 *
 * 이 사이트는 EUC-KR 이다. 폼 값을 UTF-8 로 보내면 제목·본문이 깨진 채로 등록되고
 * 이미 올라간 글은 되돌릴 수 없으므로, 인코딩은 여기 한 곳에서만 처리한다.
 */

const BASE = "https://www.ezday.co.kr"
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** 자유톡. q_id_info 는 게시판, boa_id_board 는 그 안의 분류값이다. */
export const BOARDS = {
  자유톡: { qIdInfo: "1150", boardId: "681" },
}

function eucKrForm(fields) {
  // URLSearchParams 는 UTF-8 로만 인코딩하므로 직접 퍼센트 인코딩한다.
  const enc = (s) =>
    [...iconv.encode(String(s), "euc-kr")]
      .map((b) =>
        (b >= 0x30 && b <= 0x39) ||
        (b >= 0x41 && b <= 0x5a) ||
        (b >= 0x61 && b <= 0x7a) ||
        b === 0x2d ||
        b === 0x5f ||
        b === 0x2e ||
        b === 0x7e
          ? String.fromCharCode(b)
          : "%" + b.toString(16).toUpperCase().padStart(2, "0")
      )
      .join("")
  return Object.entries(fields)
    .map(([k, v]) => `${enc(k)}=${enc(v ?? "")}`)
    .join("&")
}

export class EzdayClient {
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
    const res = await this.#request(`${BASE}/loginconfirm.html`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${BASE}/login_main.html`,
      },
      body: eucKrForm({
        q_mode: "check",
        id_user: id,
        tx_password: password,
        q_path: `${BASE}/home.html`,
      }),
    })

    if (this.cookies.get("ez_id") !== id) {
      throw new Error(
        `이지데이 로그인 실패 (HTTP ${res.status}). 아이디·비밀번호를 확인하세요.`
      )
    }
    return { id: this.cookies.get("ez_id") }
  }

  /**
   * 글 등록. 성공하면 목록으로 302 되므로 Location 을 돌려준다.
   * anonymous 를 켜면 작성자가 익명으로 등록된다.
   */
  async writePost({
    board = BOARDS.자유톡,
    title,
    html,
    anonymous = true,
    tags = "",
  }) {
    if (!this.cookies.get("ez_id")) throw new Error("로그인 먼저 해야 합니다.")
    if (!title?.trim()) throw new Error("제목이 비어 있습니다.")
    if (!html?.trim()) throw new Error("본문이 비어 있습니다.")

    // 등록 실패로 잘못 보고 다시 돌리면 같은 글이 두 번 올라간다. 먼저 확인한다.
    const already = await this.findPost(board, title)
    if (already) {
      throw new Error(`같은 제목의 글이 이미 있습니다: ${already}`)
    }

    const fields = {
      q_mode: "insert",
      q_id_info: board.qIdInfo,
      "frm[boa_id_board]": board.boardId,
      "frm[boa_sq_board]": "",
      "frm[boa_tx_title]": title,
      "frm[boa_tx_content]": html,
      "frm[boa_tx_tag]": tags,
      "frm[newUploadFiles]": "",
      "frm[boa_nm_image]": "",
      "srh[scal]": "20",
      "srh[page]": "1",
      "srh[sort]": "date",
      "srh[date]": "all",
    }
    if (anonymous) fields["frm[anm_tg_stat]"] = "1"

    const res = await this.#request(`${BASE}/bbs/ins_board.html`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${BASE}/bbs/ins_board.html?q_id_info=${board.qIdInfo}`,
      },
      body: eucKrForm(fields),
    })

    // 성공해도 302 가 아니라 200 + 자바스크립트 리다이렉트로 돌아온다.
    // 실패는 같은 200 에 alert() 가 실려 오므로 둘을 구분해야 한다.
    const body = iconv.decode(Buffer.from(await res.arrayBuffer()), "euc-kr")
    const alert = body.match(/alert\s*\(\s*['"]([^'"]+)/)?.[1]
    if (alert) throw new Error(`등록 거부됨: ${alert}`)

    const jump =
      res.headers.get("location") ??
      body.match(/location\.(?:href|replace)\s*=?\s*\(?\s*['"]([^'"]+)/)?.[1]

    if (!jump?.includes("srh_board.html")) {
      throw new Error(
        `등록 결과를 확인할 수 없습니다 (HTTP ${res.status}). 게시판을 직접 확인하세요.`
      )
    }

    const listUrl = jump.startsWith("http") ? jump : `${BASE}${jump}`

    // 등록됐다고 말만 하지 않고 목록에서 실제로 찾아 글 주소까지 돌려준다.
    const postUrl = await this.findPost(board, title)
    return { listUrl, postUrl }
  }

  /** 목록 첫 페이지에서 제목으로 방금 올린 글을 찾는다. */
  async findPost(board, title) {
    const res = await this.#request(
      `${BASE}/bbs/srh_board.html?q_id_info=${board.qIdInfo}`
    )
    const html = iconv.decode(Buffer.from(await res.arrayBuffer()), "euc-kr")
    for (const m of html.matchAll(
      /<a href="(\/bbs\/view_board\.html\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    )) {
      const text = m[2]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
      if (text === title.trim()) {
        return `${BASE}${m[1].replace(/&amp;/g, "&")}`
      }
    }
    return null
  }
}
