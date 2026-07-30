import { readFileSync } from "node:fs"

import type { SiteKey } from "@/lib/chain/types"
import { validate } from "@/lib/chain/validate"

/**
 * 검증기가 실제로 동작하는지 확인한다.
 *
 *   npm run chain:selftest -- <사람이-검수한-글이-있는-폴더>
 *
 * 규격을 바꿀 때 검증기를 같이 안 고치면 여기서 걸린다.
 * 통과 케이스만 두면 "아무것도 안 잡는 검증기" 도 통과하므로 실패 케이스를 함께 둔다.
 */
const dir = process.argv[2]
if (!dir) {
  console.error("사용법: npm run chain:selftest -- <글이-있는-폴더>")
  process.exit(1)
}

type Case = {
  site: SiteKey
  file: string
  title: string
  cta: string
  longtails: string[]
}

const KEYWORD = "숨은보험금 찾기"
const SLUG = "hidden-insurance-money"
const FINAL = "https://cont.insure.or.kr"
const ALLOWED = [
  FINAL,
  "https://cont.insure.or.kr/cont_web/information/information.do",
  "https://www.fss.or.kr/main/prc/is/sub/is006.jsp?menuNo=900395",
]
const LONGTAILS = [
  "숨은보험금 찾기",
  "숨은보험금 찾기 전화와요",
  "숨은 보험금 찾기 전화",
  "숨은 보험금 찾기 사이트",
  "숨은 보험금 찾기 방법",
  "숨은 보험금 찾기 수수료",
  "숨은 보험금 찾기 서비스",
  "숨은 보험금 찾기 어플",
  "숨은 보험금 찾기 후기",
]

const passing: Case[] = [
  {
    site: "hub",
    file: "s34-1-hub.html",
    title: "숨은보험금 찾기 조회 사이트 수수료 방법 안내",
    cta: FINAL,
    longtails: [],
  },
  {
    site: "ss",
    file: "s34-2-ss.html",
    title: "숨은보험금 찾기 사이트 방법 수수료 안내",
    cta: `https://hub.mindpang.com/${SLUG}`,
    longtails: [],
  },
  {
    site: "good",
    file: "s34-3-good.html",
    title: "숨은보험금 찾기 조회 방법 수수료 안내",
    cta: `https://ss.keywordegg.com/${SLUG}`,
    longtails: [],
  },
  {
    site: "info",
    file: "s34-4-info.html",
    title: "숨은보험금 찾기 사이트 방법 수수료 총정리",
    cta: `https://good.mindpang.com/${SLUG}`,
    longtails: LONGTAILS,
  },
]

let failed = 0

console.log("[통과해야 하는 글]")
for (const c of passing) {
  const v = validate(c.site, {
    html: readFileSync(`${dir}/${c.file}`, "utf8"),
    title: c.title,
    keyword: KEYWORD,
    longtails: c.longtails,
    ctaUrl: c.cta,
    allowedLinks: ALLOWED,
  })
  console.log(`  ${v.length ? "❌" : "✅"} ${c.site.padEnd(5)} ${c.file}`)
  for (const x of v) {
    console.log(`       [${x.rule}] ${x.detail.slice(0, 110)}`)
    failed++
  }
}

// 규격을 어긴 글을 정말로 잡는지. H2 4개에 키워드가 없고 롱테일 하나가 빠져 있다.
console.log("\n[걸려야 하는 글]")
const TYGEM_KEYWORD = "타이젬 바둑"
const TYGEM_LONGTAILS = [
  "타이젬바둑",
  "타이젬바둑다운로드",
  "타이젬바둑무료",
  "타이젬바둑바로가기",
  "타이젬바둑설치",
  "타이젬바둑설치하기",
  "타이젬바둑앱",
]
const violating = validate("info", {
  html: readFileSync(`${dir}/tygem-info-current.html`, "utf8"),
  title: "타이젬 바둑 설치 무료 앱 프로그램 급수 안내",
  keyword: TYGEM_KEYWORD,
  longtails: TYGEM_LONGTAILS,
  ctaUrl: "https://good.mindpang.com/tygem-baduk",
  allowedLinks: [],
})
console.log(
  `  ${violating.length ? "✅" : "❌"} tygem-info-current.html — ${violating.length}건 적발`
)
for (const x of violating) {
  console.log(`       [${x.rule}] ${x.detail.slice(0, 110)}`)
}
if (!violating.length) {
  console.log("       규격 위반을 잡지 못했습니다. 검증기가 헐거워졌습니다.")
  failed++
}

process.exit(failed ? 1 : 0)
