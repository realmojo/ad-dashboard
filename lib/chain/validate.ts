import { BRAND_BLOCKLIST } from "@/lib/chain/config"
import type { SiteKey, Violation } from "@/lib/chain/types"

/**
 * 태그 제거 + 공백 전부 제거. 키워드 매칭은 항상 이 형태로 한다.
 * "숨은 보험금 찾기" 와 "숨은보험금 찾기" 를 같은 것으로 봐야 하기 때문이다.
 */
export function flatten(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, "")
}

export function h2List(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim()
  )
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function countLinks(html: string, url: string): number {
  return (html.match(new RegExp(`href=["']${escapeRe(url)}["']`, "g")) ?? [])
    .length
}

/** 틀리면 독자가 실제로 손해를 보는 값들. 아예 쓰지 못하게 막는다. */
const FORBIDDEN_SPECIFICS: { rule: string; re: RegExp }[] = [
  { rule: "fax-number", re: /팩스[^.\n]{0,20}\d{2,4}-\d{3,4}-\d{4}/ },
  { rule: "account-number", re: /계좌번호[^.\n]{0,20}\d{6,}/ },
]

function commonChecks(
  html: string,
  title: string,
  keyword: string,
  longtails: string[]
): Violation[] {
  const v: Violation[] = []
  const flat = flatten(title + " " + html)
  const kwFlat = flatten(keyword)

  if (!flat.includes(kwFlat)) {
    v.push({
      rule: "keyword-missing",
      detail: `본문에 핵심 키워드 "${keyword}" 가 없습니다.`,
    })
  }

  const missing = longtails.filter((k) => !flat.includes(flatten(k)))
  if (missing.length) {
    v.push({
      rule: "keyword-coverage",
      detail: `롱테일 키워드 누락(공백 제거 연속 매칭 기준): ${missing.join(" / ")}`,
    })
  }

  const brands = BRAND_BLOCKLIST.filter((b) => flat.includes(flatten(b)))
  if (brands.length) {
    v.push({
      rule: "brand-name",
      detail: `브랜드·업체명 사용 금지(네이버 상표 키워드 광고 제한): ${brands.join(", ")}`,
    })
  }

  for (const { rule, re } of FORBIDDEN_SPECIFICS) {
    if (re.test(html)) {
      v.push({
        rule,
        detail:
          "확정 연락처·계좌를 단정했습니다. 공식 안내를 확인하도록 유도하는 문장으로 바꾸세요.",
      })
    }
  }

  return v
}

/** info/template.md — H2 전부 키워드 포함, 버튼 5곳 이상 전부 CTA_URL */
function validateInfo(
  html: string,
  title: string,
  keyword: string,
  longtails: string[],
  ctaUrl: string
): Violation[] {
  const v = commonChecks(html, title, keyword, longtails)
  const kwFlat = flatten(keyword)
  const h2 = h2List(html)

  if (h2.length < 4) {
    v.push({
      rule: "h2-count",
      detail: `H2 가 ${h2.length}개입니다. 최소 4개.`,
    })
  }

  const bad = h2.filter((h) => !flatten(h).includes(kwFlat))
  if (bad.length) {
    v.push({
      rule: "h2-keyword",
      detail: `H2 전부에 "${keyword}" 가 들어가야 합니다. 누락된 H2: ${bad.join(" / ")}`,
    })
  }

  const btn = countLinks(html, ctaUrl)
  if (btn < 5) {
    v.push({
      rule: "cta-count",
      detail: `CTA_URL 링크가 ${btn}개입니다. 최소 5개(상단1 + btn-row3 + 하단1).`,
    })
  }

  const external = [
    ...new Set(
      [...html.matchAll(/href=["'](https?:[^"']+)["']/g)]
        .map((m) => m[1])
        .filter((u) => u !== ctaUrl)
    ),
  ]
  if (external.length) {
    v.push({
      rule: "external-link",
      detail: `info 글은 외부 링크를 두지 않습니다: ${external.join(", ")}`,
    })
  }

  if (!/⏱\s*읽기 시간/.test(html)) {
    v.push({ rule: "read-time", detail: "읽기 시간 표기가 없습니다." })
  }
  if (!/📋\s*목차/.test(html)) {
    v.push({ rule: "toc", detail: "목차 블록이 없습니다." })
  }

  return v
}

/**
 * keywordegg-wp/template.md (Template 2)
 * 하단 CTA 는 마지막 문단 "위" 에 있어야 한다. 글이 버튼으로 끝나면 그 아래 자동광고가 붙는다.
 */
function validateSs(
  html: string,
  title: string,
  keyword: string,
  longtails: string[],
  ctaUrl: string
): Violation[] {
  const v = commonChecks(html, title, keyword, longtails)
  const kwFlat = flatten(keyword)
  const h2 = h2List(html)
  const trimmed = html.trimEnd()

  if (h2.length !== 4) {
    v.push({
      rule: "h2-count",
      detail: `H2 가 ${h2.length}개입니다. Template 2 는 4개입니다.`,
    })
  }

  const bad = h2.filter((h) => !flatten(h).includes(kwFlat))
  if (bad.length) {
    v.push({
      rule: "h2-keyword",
      detail: `H2 전부에 "${keyword}" 포함 필요. 누락: ${bad.join(" / ")}`,
    })
  }

  const ctaText = `✅ ${keyword} 바로가기`
  const ctaCount = (html.match(new RegExp(escapeRe(ctaText), "g")) ?? []).length
  if (ctaCount !== 2) {
    v.push({
      rule: "cta-text",
      detail: `"${ctaText}" 버튼이 ${ctaCount}개입니다. 상단·하단 2개여야 합니다.`,
    })
  }

  if (!trimmed.endsWith("</p>")) {
    v.push({
      rule: "ends-with-text",
      detail: "글이 텍스트 문단으로 끝나야 합니다(버튼 밑 광고 방지).",
    })
  }
  if (trimmed.lastIndexOf("✅") > trimmed.lastIndexOf("<p>")) {
    v.push({
      rule: "bottom-cta-position",
      detail: "하단 CTA 가 마지막 문단 아래에 있습니다. 문단 위로 옮기세요.",
    })
  }

  const group = html.match(
    /<div style="display:flex;flex-direction:column;gap:4px;margin:28px 0;">([\s\S]*?)<\/div>/
  )
  if (!group) {
    v.push({
      rule: "btn-group",
      detail: "세로 스택 버튼 그룹(gap:4px, margin:28px 0)이 없습니다.",
    })
  } else {
    const inner = group[1]
    const arrows = (inner.match(/position:absolute;right:16px;">→/g) ?? [])
      .length
    if (arrows !== 3) {
      v.push({
        rule: "btn-group-count",
        detail: `버튼 그룹 버튼이 ${arrows}개입니다. 3개여야 합니다.`,
      })
    }
    if (/<\/a>\s*[\r\n]\s*<a/.test(inner)) {
      v.push({
        rule: "btn-group-newline",
        detail:
          "버튼 사이 줄바꿈 금지 — wpautop 이 <br> 을 끼워 넣습니다. 한 줄로 붙이세요.",
      })
    }
  }

  const wrong = [
    ...new Set(
      [...html.matchAll(/href=["'](https?:[^"']+)["']/g)]
        .map((m) => m[1])
        .filter((u) => !u.startsWith(ctaUrl))
    ),
  ]
  if (wrong.length) {
    v.push({
      rule: "link-target",
      detail: `hub 외 링크가 있습니다: ${wrong.join(", ")}`,
    })
  }

  return v
}

/** good/template.md — 리드문 + 버튼 4개 + 본문 2문단. 짧게 유지되어야 한다. */
function validateGood(
  html: string,
  title: string,
  keyword: string,
  longtails: string[],
  ctaUrl: string
): Violation[] {
  const v = commonChecks(html, title, keyword, longtails)

  const btn = countLinks(html, ctaUrl)
  if (btn !== 4) {
    v.push({
      rule: "cta-count",
      detail: `버튼이 ${btn}개입니다. 4개여야 합니다.`,
    })
  }

  if (h2List(html).length) {
    v.push({
      rule: "no-h2",
      detail: "good 글에는 H2·목차·표·FAQ 를 쓰지 않습니다.",
    })
  }
  if (/<table/.test(html)) {
    v.push({ rule: "no-table", detail: "good 글에는 표를 쓰지 않습니다." })
  }

  const body = html.match(
    /<div style="margin-top:28px;line-height:1\.9;">([\s\S]*?)<\/div>/
  )
  if (!body) {
    v.push({
      rule: "body-block",
      detail: "본문 블록(margin-top:28px;line-height:1.9)이 없습니다.",
    })
  } else {
    const paras = [...body[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "")
    )
    if (paras.length !== 2) {
      v.push({
        rule: "body-paragraphs",
        detail: `본문이 ${paras.length}문단입니다. 2문단이어야 합니다.`,
      })
    }
    const len = paras.join("").length
    if (len > 700) {
      v.push({
        rule: "body-length",
        detail: `본문 ${len}자입니다. 500자 내외로 줄이세요.`,
      })
    }
  }

  if (!/display:none!important/.test(html)) {
    v.push({
      rule: "meta-hide",
      detail: "작성일·작성자 메타 숨김 style 블록이 없습니다.",
    })
  }

  return v
}

/** hub — 최종 링크로 나가는 유일한 사이트 */
function validateHub(
  html: string,
  title: string,
  keyword: string,
  longtails: string[],
  finalUrl: string,
  allowed: string[]
): Violation[] {
  const v = commonChecks(html, title, keyword, longtails)
  const h2 = h2List(html)

  if (h2.length < 4) {
    v.push({
      rule: "h2-count",
      detail: `H2 가 ${h2.length}개입니다. 최소 4개.`,
    })
  }
  if (!countLinks(html, finalUrl)) {
    v.push({
      rule: "final-link",
      detail: `최종 링크 ${finalUrl} 가 본문에 없습니다.`,
    })
  }

  const origins = new Set<string>()
  for (const a of allowed) {
    try {
      origins.add(new URL(a).origin)
    } catch {
      // 리서치가 이상한 값을 주면 그냥 무시한다. final-link 검사에서 걸린다.
    }
  }
  const rogue = [
    ...new Set(
      [...html.matchAll(/href=["'](https?:[^"']+)["']/g)]
        .map((m) => m[1])
        .filter((u) => ![...origins].some((o) => u.startsWith(o)))
    ),
  ]
  if (rogue.length) {
    v.push({
      rule: "link-whitelist",
      detail: `리서치에서 확인되지 않은 링크: ${rogue.join(", ")}`,
    })
  }

  if (!/<style>/.test(html)) {
    v.push({ rule: "style-block", detail: "hub 공통 style 블록이 없습니다." })
  }

  return v
}

export function validate(
  site: SiteKey,
  args: {
    html: string
    title: string
    keyword: string
    longtails: string[]
    ctaUrl: string
    allowedLinks: string[]
  }
): Violation[] {
  const { html, title, keyword, longtails, ctaUrl, allowedLinks } = args
  switch (site) {
    case "info":
      return validateInfo(html, title, keyword, longtails, ctaUrl)
    case "ss":
      return validateSs(html, title, keyword, longtails, ctaUrl)
    case "good":
      return validateGood(html, title, keyword, longtails, ctaUrl)
    case "hub":
      return validateHub(html, title, keyword, longtails, ctaUrl, allowedLinks)
  }
}
