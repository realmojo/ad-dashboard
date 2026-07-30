export type SiteKey = "hub" | "ss" | "good" | "info"

/** 발행 역순. hub 가 최종 링크를 물고, info 가 체인의 입구다. */
export const CHAIN_ORDER: SiteKey[] = ["hub", "ss", "good", "info"]

export const SITE_LABEL: Record<SiteKey, string> = {
  hub: "허브",
  ss: "키워드에그",
  good: "굿",
  info: "인포",
}

/** 화면 표시용. 실제 설정은 lib/chain/config.ts 의 SITES 가 갖고 있다. */
export const SITE_DOMAIN: Record<SiteKey, string> = {
  hub: "hub.mindpang.com",
  ss: "ss.keywordegg.com",
  good: "good.mindpang.com",
  info: "info.mindpang.com",
}

export type Site = {
  key: SiteKey
  domain: string
  templatePath: string
  /** 이 사이트의 버튼이 향하는 다음 목적지. hub 는 외부 최종 링크. */
  linksTo: SiteKey | "final"
}

export type Fact = {
  claim: string
  /** 근거 URL. 공식 도메인(go.kr / or.kr)을 우선한다. */
  source: string
  /** 자주 바뀌는 값(금액·시간·요금)이면 true → 본문에서 단정 금지 */
  volatile: boolean
}

export type LinkCheck = {
  url: string
  status: number
  ok: boolean
  reason?: string
}

export type Research = {
  finalUrl: string
  extraUrls: string[]
  facts: Fact[]
  /** 사칭·수수료·개인정보 등 독자에게 경고할 항목 */
  cautions: string[]
  linkChecks: LinkCheck[]
}

export type Plan = {
  keyword: string
  slug: string
  titles: Record<SiteKey, string>
  /** info·ss 의 H2 는 전부 keyword 를 포함해야 한다. */
  h2: { info: string[]; ss: string[]; hub: string[] }
  longtails: string[]
}

export type Violation = {
  rule: string
  detail: string
}

export type Draft = {
  site: SiteKey
  title: string
  html: string
  violations: Violation[]
  attempts: number
}

export type Published = {
  site: SiteKey
  id: number
  url: string
  editUrl: string
  status: "draft" | "publish"
}

export type ChainVerification = {
  ok: boolean
  hops: { site: SiteKey; from: string; to: string; count: number }[]
  keywordCoverage: { keyword: string; count: number }[]
}

export type JobStatus =
  | "queued"
  | "research"
  | "plan"
  | "generate"
  | "validate"
  | "drafting"
  | "awaiting_review"
  | "publishing"
  | "done"
  | "failed"

export const TERMINAL_STATUS: JobStatus[] = [
  "awaiting_review",
  "done",
  "failed",
]

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "대기",
  research: "리서치",
  plan: "구조 설계",
  generate: "본문 생성",
  validate: "규격 검증",
  drafting: "초안 업로드",
  awaiting_review: "확인 대기",
  publishing: "발행 중",
  done: "완료",
  failed: "실패",
}

export type Job = {
  id: string
  createdAt: string
  updatedAt: string
  status: JobStatus
  input: {
    topic: string
    keywords: string[]
    finalUrl?: string
  }
  research?: Research
  plan?: Plan
  drafts?: Draft[]
  published?: Published[]
  verify?: ChainVerification
  error?: string
  log: string[]
}

export type JobSummary = Pick<
  Job,
  "id" | "status" | "createdAt" | "updatedAt" | "input"
> & { slug?: string }
