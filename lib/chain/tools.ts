import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { BROWSER_UA } from "@/lib/chain/config"
import type { SiteKey, Violation } from "@/lib/chain/types"
import { validate } from "@/lib/chain/validate"

/**
 * HTTP 200 을 주면서 내용은 죽어 있는 정부 페이지가 있다.
 * 오탐을 막으려고 안내문에서 통째로 쓰이는 문구만 넣는다.
 * "삭제" · "종료" 같은 단어는 정상 페이지의 안내문에도 흔해서 넣으면 안 된다.
 */
const DEAD_MARKERS = [
  "삭제승인요청",
  "페이지를 찾을 수 없",
  "존재하지 않는 페이지",
  "서비스가 종료되었습니다",
  "page not found",
]

export type LinkVerdict = {
  url: string
  status: number
  ok: boolean
  /** 스크립트·태그를 걷어낸 본문 글자 수. 껍데기만 온 경우를 판별하는 데 쓴다. */
  bodyChars: number
  reason?: string
  /** true 면 "죽지 않았다" 까지만 확인된 것이다. 내용 확인은 별도로 해야 한다. */
  needsContentCheck?: boolean
}

function bodyText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
  return stripped.replace(/\s+/g, " ").trim()
}

export async function checkLink(url: string): Promise<LinkVerdict> {
  try {
    const res = await fetch(url, {
      // 일부 기관 사이트는 curl 기본 UA 에 응답하지 않는다.
      headers: { "User-Agent": BROWSER_UA },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      return {
        url,
        status: res.status,
        ok: false,
        bodyChars: 0,
        reason: `HTTP ${res.status}`,
      }
    }

    const html = await res.text()
    const text = bodyText(html)
    const lower = text.toLowerCase()

    const dead = DEAD_MARKERS.find((m) => lower.includes(m.toLowerCase()))
    if (dead) {
      return {
        url,
        status: res.status,
        ok: false,
        bodyChars: text.length,
        reason: `HTTP 200 이지만 본문에 "${dead}" 가 있습니다. 죽은 페이지입니다.`,
      }
    }

    // 여기까지는 "확실히 죽지는 않았다" 까지만 증명된다.
    // 정부24 처럼 알맹이를 자바스크립트로 그리는 페이지는 받아온 HTML 이 껍데기라
    // 서비스가 내려갔어도 이 검사를 통과한다. 내용 확인은 에이전트가 직접 해야 한다.
    return {
      url,
      status: res.status,
      ok: true,
      bodyChars: text.length,
      needsContentCheck: true,
    }
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      bodyChars: 0,
      reason: (error as Error).message,
    }
  }
}

function text(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }],
  }
}

/** 리서치 세션용. 링크가 진짜 살아 있는지 확인시킨다. */
export const researchTools = createSdkMcpServer({
  name: "chain",
  version: "1.0.0",
  tools: [
    tool(
      "check_link",
      "링크가 죽었는지 확인한다. 상태 코드와 함께 본문까지 읽어 200 을 주면서 " +
        "'삭제승인요청' 같은 안내만 남은 페이지를 걸러낸다. 최종 링크 후보는 반드시 " +
        "이 도구로 확인해야 한다. 다만 ok:true 는 '죽지 않았다' 까지만 뜻한다. " +
        "알맹이를 자바스크립트로 그리는 사이트는 받아온 HTML 이 껍데기라 이 검사를 통과하므로, " +
        "needsContentCheck 가 true 면 WebFetch 로 페이지를 직접 읽어 주제에 맞는 내용이 " +
        "실제로 있는지 확인해야 한다.",
      { url: z.string().describe("확인할 전체 URL") },
      async ({ url }) => text(await checkLink(url))
    ),
  ],
})

/**
 * 생성 세션용. 검증기를 도구로 넘긴다.
 * 에이전트가 스스로 "잘 썼다" 고 판단하게 두면 규격이 조용히 무너지므로,
 * 판정은 언제나 이 결정론적 코드가 한다.
 */
export function buildWriteTools(ctx: {
  keyword: string
  longtails: string[]
  ctaUrl: string
  allowedLinks: string[]
  titleOf: (site: SiteKey) => string
}) {
  return createSdkMcpServer({
    name: "chain",
    version: "1.0.0",
    tools: [
      tool(
        "validate_post",
        "작성한 HTML 이 해당 사이트 템플릿 규격에 맞는지 검사한다. " +
          "위반 목록을 돌려주며, 빈 배열이면 통과다. " +
          "글을 최종 제출하기 전에 반드시 이 도구로 통과를 확인해야 한다.",
        {
          site: z.enum(["hub", "ss", "good", "info"]).describe("검사할 사이트"),
          html: z.string().describe("작성한 본문 HTML 전체"),
        },
        async ({ site, html }) => {
          const violations: Violation[] = validate(site, {
            html,
            title: ctx.titleOf(site),
            keyword: ctx.keyword,
            longtails: ctx.longtails,
            ctaUrl: ctx.ctaUrl,
            allowedLinks: ctx.allowedLinks,
          })
          return text(
            violations.length
              ? { passed: false, violations }
              : { passed: true, violations: [] }
          )
        }
      ),
    ],
  })
}
