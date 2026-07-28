import { cn } from "@/lib/utils"

/** 검색광고 API 가 돌려주는 상태 코드의 한글 표기. */
const STATUS_LABEL: Record<string, string> = {
  ELIGIBLE: "정상",
  PAUSED: "중지",
  PAUSED_BY_USER: "중지",
  PAUSED_BY_ADMIN: "관리자 중지",
  PAUSED_CAMPAIGN_BUDGET: "캠페인 예산 소진",
  PAUSED_ADGROUP_BUDGET: "그룹 예산 소진",
  PAUSED_CAMPAIGN_PERIOD: "캠페인 기간 종료",
  DELETED: "삭제됨",
  PENDING_INSPECT: "검수 대기",
  UNDER_REVIEW: "검수중",
  APPROVED: "정상",
  REJECTED: "검수 거절",
  NOT_ELIGIBLE: "노출 불가",
}

export function statusLabel(status?: string, userLock?: boolean) {
  if (userLock) return "OFF"
  return STATUS_LABEL[status ?? ""] ?? status ?? "-"
}

export function isRunning(status?: string, userLock?: boolean) {
  return !userLock && (status === "ELIGIBLE" || status === "APPROVED")
}

/**
 * 상태를 색 점 하나로 보여준다.
 * 정상은 녹색, 그 외(중지·거절 등 노출되지 않는 상태)는 빨강.
 * 정확한 상태는 마우스를 올리면 나온다.
 */
export function StatusDot({
  status,
  userLock,
  className,
}: {
  status?: string
  userLock?: boolean
  className?: string
}) {
  const ok = isRunning(status, userLock)
  const label = statusLabel(status, userLock)

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn(
        // 10px 였던 것을 절반으로. 임의값을 써야 정확히 5px 가 된다.
        "inline-block size-[5px] shrink-0 rounded-full",
        ok ? "bg-emerald-500" : "bg-red-500",
        className
      )}
    />
  )
}

/** 이전 이름 호환 — 표시는 점으로 통일한다. */
export const StatusText = StatusDot
