import { NextResponse } from "next/server"

import { runChain } from "@/lib/chain/pipeline"
import { createJob, listJobs } from "@/lib/chain/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/write — 최근 잡 목록 */
export async function GET() {
  return NextResponse.json({ jobs: listJobs() })
}

/**
 * POST /api/write — 체인 생성 시작
 * 리서치부터 초안 업로드까지 3~8분 걸리므로 즉시 202 로 돌려주고 백그라운드에서 돌린다.
 * 진행 상황은 GET /api/write/{id} 로 확인한다.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "JSON 본문이 필요합니다." },
      { status: 400 }
    )
  }

  const { topic, keywords, finalUrl } = (body ?? {}) as {
    topic?: unknown
    keywords?: unknown
    finalUrl?: unknown
  }

  if (typeof topic !== "string" || !topic.trim()) {
    return NextResponse.json(
      { error: "주제를 입력해 주세요." },
      { status: 400 }
    )
  }

  if (typeof finalUrl === "string" && finalUrl.trim()) {
    try {
      new URL(finalUrl)
    } catch {
      return NextResponse.json(
        { error: "최종 링크가 올바른 주소가 아닙니다." },
        { status: 400 }
      )
    }
  }

  const job = createJob({
    topic: topic.trim(),
    keywords: Array.isArray(keywords)
      ? keywords.filter((k): k is string => typeof k === "string" && !!k.trim())
      : [],
    finalUrl:
      typeof finalUrl === "string" && finalUrl.trim()
        ? finalUrl.trim()
        : undefined,
  })

  // 응답을 막지 않는다. 실패해도 job.status 에 남는다.
  void runChain(job)

  return NextResponse.json(
    { jobId: job.id, status: job.status },
    { status: 202 }
  )
}
