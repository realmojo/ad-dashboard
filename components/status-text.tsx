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

/**
 * 키워드의 노출 상태를 한 마디로 정리한다.
 *
 * 계정에서 실제로 나오는 조합(검수상태 / 상태 / 사유):
 *   APPROVED    / ELIGIBLE / ELIGIBLE               → 노출중
 *   PENDING     / PAUSED   / KEYWORD_DISAPPROVED    → 검토 대기
 *   UNDER_REVIEW/ PAUSED   / KEYWORD_UNDER_REVIEW   → 검토중
 *   APPROVED    / PAUSED   / KEYWORD_PAUSED (lock)  → 중지
 */
export function keywordState(keyword: {
  status?: string
  statusReason?: string
  inspectStatus?: string
  userLock?: boolean
}): { label: string; tone: "ok" | "review" | "off" } {
  if (keyword.userLock) return { label: "중지", tone: "off" }

  switch (keyword.inspectStatus) {
    case "UNDER_REVIEW":
      return { label: "검토중", tone: "review" }
    case "PENDING":
      return { label: "검토 대기", tone: "review" }
    case "REJECTED":
      return { label: "검수 거절", tone: "off" }
    default:
      break
  }

  if (keyword.status === "ELIGIBLE") return { label: "노출중", tone: "ok" }

  switch (keyword.statusReason) {
    case "KEYWORD_PAUSED":
      return { label: "중지", tone: "off" }
    case "KEYWORD_DISAPPROVED":
      return { label: "검수 미승인", tone: "off" }
    default:
      // 모르는 사유는 원문을 그대로 보여 준다.
      return { label: keyword.statusReason ?? "노출 불가", tone: "off" }
  }
}

export const KEYWORD_STATE_CLASS: Record<"ok" | "review" | "off", string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  review: "text-amber-600 dark:text-amber-500",
  off: "text-red-600 dark:text-red-400",
}
