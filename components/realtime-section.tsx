import { RealtimePanel } from "@/components/realtime-panel"
import { getRealtime, type RealtimeResult } from "@/lib/ga4"

/**
 * 첫 화면에 값이 바로 보이도록 서버에서 한 번 받아 넘긴다.
 * 이후 갱신은 클라이언트가 30초마다 직접 한다.
 */
export async function RealtimeSection() {
  let initial: RealtimeResult | null = null
  try {
    initial = await getRealtime()
  } catch {
    // 실패해도 클라이언트가 곧 다시 시도한다.
  }
  return <RealtimePanel initial={initial} />
}
