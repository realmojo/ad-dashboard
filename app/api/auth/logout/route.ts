import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE } from "@/lib/auth"
import { getPublicOrigin } from "@/lib/origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request)
  const response = NextResponse.redirect(origin)
  response.cookies.delete(SESSION_COOKIE)
  return response
}
