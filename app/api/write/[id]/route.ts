import { NextResponse } from "next/server"

import { getJob } from "@/lib/chain/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/write/{id} — 잡 상세(리서치 결과, 플랜, 초안, 검증 위반 내역) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const job = getJob(id)
  if (!job) {
    return NextResponse.json({ error: "없는 작업입니다." }, { status: 404 })
  }
  return NextResponse.json(job)
}
