import { parse } from "node-html-parser"

/**
 * info.mindpang.com 글에서 제목과 본문 블록을 뽑아낸다.
 *
 * info 글에는 체인 전용 요소(읽기시간, 목차, CTA 버튼, 출처 footer)가 섞여 있는데
 * 그대로 옮기면 남의 게시판에서 의미가 없거나 링크만 여러 개 박힌 글이 된다.
 * 여기서 걷어내고 읽을거리만 남긴다.
 */

const DROP_TESTS = [
  // 읽기 시간 표기
  (el) => /⏱\s*읽기 시간/.test(el.text),
  // 목차 블록
  (el) => /📋\s*목차/.test(el.text),
  // CTA 버튼과 버튼 줄
  (el) => el.classList.contains("btn-row"),
  (el) => el.tagName === "P" && el.querySelector("a.btn"),
  // 출처 footer (11px 회색)
  (el) => /font-size:\s*11px/.test(el.getAttribute("style") ?? ""),
]

/** 표에서 셀만 뽑아 2차원 배열로. 템플릿 스타일로 다시 그리기 위함이다. */
function readTable(table) {
  const rows = []
  for (const tr of table.querySelectorAll("tr")) {
    const cells = tr.querySelectorAll("th, td").map((c) => c.text.trim())
    if (cells.length) rows.push({ header: !!tr.querySelector("th"), cells })
  }
  return rows
}

export function extractPost(html) {
  const root = parse(html)

  const title =
    root.querySelector("h1.entry-title")?.text.trim() ??
    root.querySelector("h1")?.text.trim() ??
    ""

  const content =
    root.querySelector(".entry-content") ?? root.querySelector("article")
  if (!content) throw new Error("본문(.entry-content)을 찾지 못했습니다.")

  const blocks = []
  let highlight = null

  for (const el of content.childNodes) {
    if (el.nodeType !== 1) continue
    if (DROP_TESTS.some((t) => t(el))) continue

    const tag = el.tagName
    const text = el.text.trim()
    if (!text && tag !== "TABLE") continue

    // 3줄 요약 같은 note 박스는 강조 박스로 살린다.
    if (el.classList.contains("note")) {
      if (!highlight) {
        const items = el.querySelectorAll("li").map((li) => li.text.trim())
        highlight = items.length ? items.join(" · ") : text
      }
      continue
    }

    if (tag === "H2") blocks.push({ type: "h2", text })
    else if (tag === "P") blocks.push({ type: "p", html: el.innerHTML.trim() })
    else if (tag === "UL" || tag === "OL") {
      blocks.push({
        type: "list",
        ordered: tag === "OL",
        items: el.querySelectorAll("li").map((li) => li.innerHTML.trim()),
      })
    } else if (tag === "TABLE") {
      const rows = readTable(el)
      if (rows.length) blocks.push({ type: "table", rows })
    }
  }

  if (!blocks.length) throw new Error("본문에서 옮길 내용을 찾지 못했습니다.")
  return { title, blocks, highlight }
}
