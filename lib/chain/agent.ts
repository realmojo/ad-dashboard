import { query } from "@anthropic-ai/claude-agent-sdk"
import type { McpServerConfig, Options } from "@anthropic-ai/claude-agent-sdk"

import { REPO_ROOT } from "@/lib/chain/config"

/**
 * 로그인한 Claude Code 구독 계정으로 세션을 띄운다.
 *
 * API 키를 쓰면 토큰 요금이 따로 청구되므로, 자식 프로세스 환경에서
 * ANTHROPIC_API_KEY 와 ANTHROPIC_AUTH_TOKEN 을 지워 구독 인증만 남긴다.
 * 이 두 값이 살아 있으면 SDK 가 조용히 API 과금 경로를 탄다.
 */
function subscriptionEnv(): Record<string, string | undefined> {
  const env = { ...process.env } as Record<string, string | undefined>
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

export type AgentRun = {
  prompt: string
  systemPrompt: string
  /** 정확한 도구 이름 목록. 여기 없는 도구는 쓸 수 없다. */
  allowedTools: string[]
  mcpServers?: Record<string, McpServerConfig>
  /** "opus" · "sonnet" · "haiku" 같은 별칭을 쓴다. */
  model?: string
  maxTurns?: number
  /** 진행 상황을 잡 로그로 흘려보낸다. */
  onProgress?: (line: string) => void
}

export type AgentResult = {
  text: string
  costUsd: number
  turns: number
  sessionId: string
}

/** 도구 이름과 인자 일부를 한 줄로 요약한다. 진행 표시에 쓴다. */
function describeToolUse(name: string, input: unknown): string {
  const arg = (() => {
    if (!input || typeof input !== "object") return ""
    const o = input as Record<string, unknown>
    for (const k of ["query", "url", "file_path", "site", "pattern"]) {
      if (typeof o[k] === "string") return ` ${(o[k] as string).slice(0, 80)}`
    }
    return ""
  })()
  return `${name.replace(/^mcp__chain__/, "")}${arg}`
}

export async function runAgent(run: AgentRun): Promise<AgentResult> {
  const options: Options = {
    systemPrompt: run.systemPrompt,
    allowedTools: run.allowedTools,
    // 파일을 고치거나 셸을 쓸 일이 없다. 워드프레스 발행은 코드만 한다.
    disallowedTools: ["Bash", "Write", "Edit", "NotebookEdit", "Task"],
    mcpServers: run.mcpServers,
    model: run.model,
    maxTurns: run.maxTurns ?? 40,
    // 템플릿을 Read 로 직접 읽을 수 있도록 저장소 루트에서 돌린다.
    cwd: REPO_ROOT,
    // 사용자의 CLAUDE.md·설정을 끌어오지 않는다. 이 작업만의 규칙으로 돌린다.
    settingSources: [],
    env: subscriptionEnv(),
  }

  let text = ""
  let costUsd = 0
  let turns = 0
  let sessionId = ""

  for await (const message of query({ prompt: run.prompt, options })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          run.onProgress?.(describeToolUse(block.name, block.input))
        }
      }
      continue
    }

    if (message.type !== "result") continue

    sessionId = message.session_id
    costUsd = message.total_cost_usd
    turns = message.num_turns

    if (message.subtype !== "success") {
      throw new Error(`에이전트 실패(${message.subtype})`)
    }

    // 도구가 거부되면 에이전트는 조용히 덜 한 채로 "성공" 한다. 실패로 안 보이는 실패라 막는다.
    if (message.permission_denials.length) {
      const denied = message.permission_denials
        .map((d) => d.tool_name)
        .join(", ")
      throw new Error(
        `도구 사용이 거부되어 작업이 불완전합니다: ${denied}. allowedTools 설정을 확인하세요.`
      )
    }

    text = message.result
  }

  if (!text.trim()) throw new Error("에이전트가 빈 결과를 돌려줬습니다.")
  return { text, costUsd, turns, sessionId }
}

/** 모델이 코드펜스를 붙이거나 앞뒤로 말을 얹는 경우가 잦아서 관대하게 파싱한다. */
export function parseJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced?.[1] ?? raw).trim()
  const start = candidate.search(/[[{]/)
  if (start < 0) {
    throw new Error(`JSON 을 찾을 수 없습니다: ${raw.slice(0, 200)}`)
  }
  const closing = candidate[start] === "{" ? "}" : "]"
  const end = candidate.lastIndexOf(closing)
  return JSON.parse(candidate.slice(start, end + 1)) as T
}

/** 생성 결과에서 HTML 만 뽑는다. 모델이 설명을 덧붙여도 버린다. */
export function parseHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? raw).trim()
  // 펜스가 없으면 첫 태그 앞의 잡담을 잘라낸다.
  const first = body.search(/<(p|div|style|h2|table|ul|ol)\b/)
  return first > 0 ? body.slice(first) : body
}
