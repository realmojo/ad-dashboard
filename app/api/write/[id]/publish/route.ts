import { NextResponse } from "next/server"

import { publishChain } from "@/lib/chain/pipeline"
import { getJob } from "@/lib/chain/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/write/{id}/publish
 * 초안 4개를 발행 상태로 바꾸고, 실제 페이지를 긁어 체인이 이어졌는지 확인한다.
 * 사람이 초안을 본 뒤에만 호출되어야 하므로 awaiting_review 상태에서만 받는다.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const job = getJob(id)
  if (!job) {
    return NextResponse.json({ error: "없는 작업입니다." }, { status: 404 })
  }
  if (job.status !== "awaiting_review") {
    return NextResponse.json(
      {
        error: `현재 상태가 ${job.status} 입니다. 초안 확인 대기 상태에서만 발행할 수 있습니다.`,
      },
      { status: 409 }
    )
  }

  try {
    const verify = await publishChain(job)
    return NextResponse.json({
      jobId: job.id,
      published: job.published,
      verify,
    })
  } catch (error) {
    console.error("[write/publish]", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
