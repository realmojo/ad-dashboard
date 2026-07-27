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

/**
 * 상태를 한글 텍스트로 보여준다.
 * 정상은 녹색, 그 외(중지·거절 등 노출되지 않는 상태)는 빨간색.
 */
export function StatusText({
  status,
  userLock,
  className,
}: {
  status?: string
  userLock?: boolean
  className?: string
}) {
  const off = Boolean(userLock)
  const label = off ? "OFF" : (STATUS_LABEL[status ?? ""] ?? status ?? "-")
  const ok = !off && (status === "ELIGIBLE" || status === "APPROVED")

  return (
    <span
      className={cn(
        "font-medium",
        ok
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
        className
      )}
    >
      {label}
    </span>
  )
}
