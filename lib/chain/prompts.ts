import { SITES } from "@/lib/chain/config"
import type { Fact, Plan, Research, SiteKey } from "@/lib/chain/types"

export const HOUSE_RULES = `당신은 한국어 정보성 블로그 글을 쓰는 편집자입니다. 다음 규칙은 예외 없이 지킵니다.

[사실]
- 확인되지 않은 사실은 쓰지 않습니다. 제공된 "확인된 사실" 목록 밖의 수치·날짜·연락처를 만들어내지 마세요.
- 자주 바뀜으로 표시된 항목은 단정하지 말고 "최신 공식 안내에서 확인" 식으로 유도합니다.
- 팩스번호·계좌번호·고객센터 직통번호는 쓰지 않습니다. 틀리면 독자가 실제로 손해를 봅니다.

[광고 심사]
- 타사 브랜드·업체명을 제목과 본문에 넣지 않습니다(네이버 상표 키워드 광고 제한).
- 사칭·보이스피싱 경고를 마지막 문단에 넣습니다. 금융 주제면 원금손실·불법대부, 게임 주제면 공식마켓·인앱결제·과몰입 경고를 추가합니다.

[문체]
- 존댓말, 단정적 광고 문구 금지. "~할 수 있습니다", "~하시면 됩니다" 톤.
- 이모지는 템플릿에 명시된 자리에만 씁니다.`

export const RESEARCH_SYSTEM = `${HOUSE_RULES}

당신은 지금 글을 쓰기 전 사실 조사를 합니다. 결과는 사람이 아니라 프로그램이 받습니다.
마지막 메시지에는 요청받은 JSON만 담고, 인사말이나 설명을 덧붙이지 마세요.`

export const WRITE_SYSTEM = `${HOUSE_RULES}

당신은 지금 워드프레스에 올릴 본문 HTML 하나를 작성합니다. 결과는 사람이 아니라 프로그램이 받습니다.
마지막 메시지에는 HTML 본문만 담고, 설명이나 코드펜스를 붙이지 마세요.`

export function researchPrompt(
  topic: string,
  keywords: string[],
  finalUrl?: string
): string {
  return `주제: ${topic}
${keywords.length ? `광고 키워드: ${keywords.join(", ")}` : ""}
${finalUrl ? `사용자가 지정한 최종 링크: ${finalUrl}` : ""}

웹 검색으로 이 주제의 **공식 목적지**를 찾고 사실을 수집하세요.

절차:
1. WebSearch 로 이 주제의 공식 페이지를 찾습니다. 정부·공공기관(go.kr, or.kr)이나 제작사 공식 사이트를 우선합니다. 블로그·자료실·커뮤니티는 최종 링크가 될 수 없습니다.
2. 후보를 찾으면 **반드시 check_link 도구로 확인**합니다. HTTP 200 을 주면서 본문은 "삭제승인요청 상태" 인 정부 페이지가 실제로 있습니다. 상태 코드만 믿지 마세요.
3. check_link 가 ok:false 를 주면 그 링크는 버리고 다른 후보를 찾습니다.
4. **check_link 통과는 "죽지 않았다" 까지만 뜻합니다.** 정부24처럼 알맹이를 자바스크립트로 그리는 사이트는 서비스가 내려가도 이 검사를 통과합니다. 반드시 WebFetch 로 페이지를 직접 읽어 주제에 맞는 내용이 실제로 있는지 확인하세요. 안내 문구만 남아 있거나 내용이 비어 있으면 그 링크는 버립니다.
5. WebFetch 로 읽은 본문에서 사실을 뽑습니다. 검색 결과 요약만으로 수치를 옮겨 적지 마세요.
6. 수치·금액·기한은 **두 곳 이상에서 확인**되지 않으면 facts 에 넣지 않습니다. 애매하면 빼는 편이 낫습니다.

돌려줄 것:
- finalUrl — 확인을 통과한 공식 페이지 1개
- extraUrls — 본문에서 함께 링크할 공식 페이지 최대 2개(역시 확인을 통과한 것만)
- facts — 6~12개. 각각 근거 URL 을 답니다. 금액·시간·요금처럼 자주 바뀌는 값은 volatile: true
- cautions — 독자에게 경고할 항목 3~6개(사칭, 수수료 요구, 개인정보, 비공식 배포처 등)

마지막 메시지는 아래 JSON 하나만:
{"finalUrl":"...","extraUrls":["..."],"facts":[{"claim":"...","source":"...","volatile":false}],"cautions":["..."]}`
}

export function planPrompt(
  topic: string,
  keywords: string[],
  research: Research
): string {
  return `주제: ${topic}
광고 키워드: ${keywords.join(", ") || "(없음)"}
최종 링크: ${research.finalUrl}

확인된 사실:
${research.facts.map((f) => `- ${f.claim}${f.volatile ? " [자주 바뀜]" : ""}`).join("\n")}

4개 사이트에 나갈 글의 뼈대를 잡으세요. 검색은 필요 없습니다.

- keyword: 모든 H2 에 들어갈 핵심 키워드. 광고 키워드들의 공통 어간으로 잡습니다. 너무 길면 H2 가 어색해지니 2~4어절.
- slug: 영문 소문자 하이픈. 4개 사이트가 동일한 슬러그를 씁니다.
- titles: 사이트별 제목. 핵심 키워드로 시작하고 30~40자.
- h2.info: 8개(확장형) 또는 4개(기본형). **전부 keyword 를 포함**해야 합니다.
- h2.ss: 정확히 4개. 전부 keyword 포함.
- h2.hub: 4개.
- longtails: 본문에 반드시 등장시킬 키워드. 광고 키워드를 그대로 넣되, **공백을 제거했을 때 본문에 연속으로 나타날 수 있는 형태**여야 합니다.

광고 키워드 하나하나가 H2 하나씩을 차지하도록 배치하면 관련성이 가장 높아집니다.

마지막 메시지는 아래 JSON 하나만:
{"keyword":"...","slug":"...","titles":{"hub":"...","ss":"...","good":"...","info":"..."},"h2":{"info":["..."],"ss":["..."],"hub":["..."]},"longtails":["..."]}`
}

function factBlock(facts: Fact[], cautions: string[]): string {
  return `확인된 사실(이 밖의 수치를 지어내지 마세요):
${facts.map((f) => `- ${f.claim}${f.volatile ? '  ※ 자주 바뀜 → 단정 금지, "공식 안내 확인" 으로 유도' : ""}`).join("\n")}

경고에 넣을 항목:
${cautions.map((c) => `- ${c}`).join("\n")}`
}

export function generatePrompt(args: {
  site: SiteKey
  plan: Plan
  research: Research
  ctaUrl: string
  h2: string[]
}): string {
  const { site, plan, research, ctaUrl, h2 } = args

  const siteNote: Record<SiteKey, string> = {
    hub: `이 글은 체인의 마지막입니다. 버튼은 최종 링크와 아래 보조 링크로만 연결합니다.
허용된 링크: ${[research.finalUrl, ...research.extraUrls].join(", ")}
이 목록에 없는 URL 은 절대 쓰지 마세요.`,
    ss: `모든 링크는 ${ctaUrl} 하나로만 연결합니다.
특히 주의할 두 가지가 있습니다.
- 하단 CTA 버튼은 **마지막 문단 바로 위**에 둡니다. 글이 버튼으로 끝나면 그 아래에 자동광고가 붙습니다.
- 세로 스택 버튼 3개는 사이에 줄바꿈 없이 한 줄로 붙여 씁니다. wpautop 이 <br> 을 끼워 넣습니다.`,
    good: `모든 버튼 4개는 ${ctaUrl} 하나로만 연결합니다. 목차·표·FAQ·H2·출처는 쓰지 않습니다.
본문은 2문단, 공백 포함 500자 내외로 짧게 유지합니다. 버튼이 주인공입니다.`,
    info: `버튼 5곳 이상 전부 ${ctaUrl} 하나로만 연결합니다. 외부 링크는 넣지 않습니다.`,
  }

  return `${SITES[site].domain} 에 올릴 글 본문 HTML 을 작성하세요.

절차:
1. Read 도구로 템플릿을 먼저 읽습니다: ${SITES[site].templatePath}
2. 그 규격에 정확히 맞춰 HTML 을 작성합니다.
3. **validate_post 도구로 검사**합니다(site: "${site}").
4. passed:false 면 위반 항목을 고쳐 다시 검사합니다. passed:true 가 될 때까지 반복하세요.
5. 통과한 HTML 만 마지막 메시지에 담습니다.

검사를 건너뛰고 제출하지 마세요. 통과하지 못한 글은 폐기됩니다.

핵심 키워드: ${plan.keyword}
제목: ${plan.titles[site]}
CTA_URL: ${ctaUrl}
SLUG: ${plan.slug}

${h2.length ? `사용할 H2(순서·문구 그대로):\n${h2.map((h, i) => `${i + 1}. ${h}`).join("\n")}` : ""}

본문에 반드시 등장해야 하는 키워드(공백을 제거했을 때 연속으로 나타나야 합니다):
${plan.longtails.map((k) => `- ${k}`).join("\n")}

${siteNote[site]}

${factBlock(research.facts, research.cautions)}`
}
