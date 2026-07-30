/**
 * 추출한 블록을 blog-post-template.html 의 디자인 토큰으로 다시 그린다.
 *
 * 게시판 편집기는 <style> 태그를 지우기 때문에 스타일을 전부 인라인으로 박는다.
 * 값은 템플릿 주석의 토큰을 그대로 따른다.
 *   제목 #111827 / 본문 #374151 / 강조 #e53935 / 본문 17px, line-height 1.85
 */

const S = {
  wrap: "margin:0 auto;padding:24px 16px;max-width:760px",
  h1: "margin:0 0 20px;font-size:30px;line-height:1.32;color:#111827;font-weight:900",
  h2: "margin:30px 0 12px;font-size:22px;line-height:1.35;color:#111827;font-weight:800",
  p: "margin:0 0 16px;font-size:17px;line-height:1.85;color:#374151",
  qa: "margin:0 0 6px;font-size:17px;line-height:1.85;color:#111827;font-weight:800",
  ul: "margin:0 0 16px;padding-left:22px;font-size:17px;line-height:1.85;color:#374151",
  li: "margin:0 0 8px",
  box: "margin:0 0 20px;padding:16px 18px;background-color:#fff5f5;border-left:4px solid #e53935",
  boxP: "margin:0;font-size:16px;line-height:1.8;color:#374151",
  table:
    "width:100%;margin:0 0 20px;border-collapse:collapse;font-size:16px;line-height:1.7;color:#374151",
  th: "padding:12px;background-color:#f3f4f6;border:1px solid #e5e7eb;color:#111827;font-weight:800;text-align:left",
  td: "padding:12px;border:1px solid #e5e7eb",
}

function ctaButton(url, text) {
  return `<div style="margin:16px 0 26px">
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;text-decoration:none">
    <table width="100%" cellpadding="0" cellspacing="0" style="width:100%"><tbody><tr>
      <td height="52" bgcolor="#e53935" style="height:52px;background-color:#e53935;text-align:center;color:#ffffff;font-size:17px;font-weight:900;line-height:52px">
        <span style="font-size:17px;font-weight:900;line-height:52px;text-decoration:none">${text}</span>
      </td>
    </tr></tbody></table>
  </a>
</div>`
}

function renderTable(rows) {
  const head = rows.find((r) => r.header)
  const body = rows.filter((r) => r !== head)
  const th = head
    ? `<thead><tr>${head.cells.map((c) => `<th style="${S.th}">${c}</th>`).join("")}</tr></thead>`
    : ""
  const tb = body
    .map(
      (r) =>
        `<tr>${r.cells.map((c) => `<td style="${S.td}">${c}</td>`).join("")}</tr>`
    )
    .join("")
  return `<table width="100%" cellpadding="0" cellspacing="0" style="${S.table}">${th}<tbody>${tb}</tbody></table>`
}

/** "Q. ..." 로 시작하는 문단은 FAQ 서식으로 굵게 뽑는다. */
function renderParagraph(html) {
  const plain = html.replace(/<[^>]+>/g, "").trim()
  if (/^Q\.\s/.test(plain)) return `<p style="${S.qa}">${html}</p>`
  return `<p style="${S.p}">${html}</p>`
}

export function renderPost({ title, blocks, highlight, ctaUrl, ctaText }) {
  const parts = [
    `<h1 style="${S.h1}">${title}</h1>`,
    ctaButton(ctaUrl, ctaText),
  ]

  // 첫 문단(도입부) 다음에 강조 박스를 한 번 넣는다.
  let highlightPlaced = !highlight
  let seenParagraph = false

  for (const b of blocks) {
    if (b.type === "h2") parts.push(`<h2 style="${S.h2}">${b.text}</h2>`)
    else if (b.type === "p") {
      parts.push(renderParagraph(b.html))
      seenParagraph = true
    } else if (b.type === "list") {
      const tag = b.ordered ? "ol" : "ul"
      parts.push(
        `<${tag} style="${S.ul}">${b.items.map((i) => `<li style="${S.li}">${i}</li>`).join("")}</${tag}>`
      )
    } else if (b.type === "table") parts.push(renderTable(b.rows))

    if (!highlightPlaced && seenParagraph) {
      parts.push(
        `<div style="${S.box}"><p style="${S.boxP}"><strong style="color:#111827">체크 포인트</strong><br>${highlight}</p></div>`
      )
      highlightPlaced = true
    }
  }

  parts.push(ctaButton(ctaUrl, ctaText))
  return `<div style="${S.wrap}">\n${parts.join("\n")}\n</div>`
}
