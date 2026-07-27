import { cookies } from "next/headers"

import { SESSION_COOKIE, verifySessionValue, type Session } from "@/lib/auth"

/** 서버 컴포넌트/라우트에서 현재 로그인 세션을 읽는다. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  return verifySessionValue(store.get(SESSION_COOKIE)?.value)
}
