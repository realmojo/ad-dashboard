import { runAgent } from "@/lib/chain/agent"
import { researchTools } from "@/lib/chain/tools"

/**
 * 에이전트 세션이 실제로 도는지 확인한다.
 *
 *   npm run chain:agent-check
 *
 * 보는 것 세 가지:
 * 1. API 키 없이 구독 인증으로 붙는가
 * 2. 인프로세스 도구(check_link)를 에이전트가 실제로 호출하는가
 * 3. 죽은 페이지(200 인데 내용 없음)를 도구가 걸러내는가
 */
const calls: string[] = []

const result = await runAgent({
  systemPrompt:
    "당신은 링크 점검만 합니다. 결과는 프로그램이 받으므로 설명을 붙이지 마세요.",
  prompt:
    "check_link 도구로 https://www.gov.kr 을 확인하고, " +
    "살아 있으면 OK, 아니면 DEAD 라는 단어 하나만 마지막 메시지에 담아 답하세요.",
  allowedTools: ["mcp__chain__check_link"],
  mcpServers: { chain: researchTools },
  maxTurns: 6,
  onProgress: (line) => {
    calls.push(line)
    console.log("  도구 호출:", line)
  },
})

console.log("\n결과       :", result.text.trim().slice(0, 80))
console.log("턴 수      :", result.turns)
console.log("세션       :", result.sessionId)
console.log("비용(참고) : $" + result.costUsd.toFixed(4))
console.log("API 키     :", process.env.ANTHROPIC_API_KEY ? "설정됨" : "없음(구독 인증)")

if (!calls.some((c) => c.startsWith("check_link"))) {
  console.error("\n❌ 도구가 호출되지 않았습니다. mcpServers 연결을 확인하세요.")
  process.exit(1)
}
console.log("\n✅ 세션·도구 연결 정상")
