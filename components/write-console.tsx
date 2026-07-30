"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  Send,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  CHAIN_ORDER,
  SITE_LABEL,
  STATUS_LABEL,
  TERMINAL_STATUS,
} from "@/lib/chain/types"
import type { Draft, Job, JobSummary, SiteKey } from "@/lib/chain/types"
import { cn } from "@/lib/utils"

/** 파이프라인 단계. 진행 표시줄 순서와 같다. */
const STEPS = [
  { key: "research", label: "리서치" },
  { key: "plan", label: "구조 설계" },
  { key: "generate", label: "본문 생성" },
  { key: "validate", label: "규격 검증" },
  { key: "drafting", label: "초안 업로드" },
  { key: "awaiting_review", label: "확인 대기" },
] as const

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"

function stepIndex(status: Job["status"]) {
  const i = STEPS.findIndex((s) => s.key === status)
  if (i >= 0) return i
  // done·publishing 은 마지막 단계를 지난 상태, queued 는 시작 전
  if (status === "done" || status === "publishing") return STEPS.length
  return -1
}

function Progress({ job }: { job: Job }) {
  const current = stepIndex(job.status)
  const failed = job.status === "failed"

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = current > i
        const active = current === i && !failed
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-4xl px-2 py-0.5 text-xs font-medium",
                done && "bg-primary/10 text-foreground",
                active && "bg-primary text-primary-foreground",
                !done && !active && "bg-muted text-muted-foreground"
              )}
            >
              {done ? <Check className="size-3" /> : null}
              {active ? <Loader2 className="size-3 animate-spin" /> : null}
              {s.label}
            </span>
            {i < STEPS.length - 1 ? (
              <ArrowRight className="size-3 text-muted-foreground/50" />
            ) : null}
          </div>
        )
      })}
      {failed ? (
        <Badge variant="destructive" className="ml-1">
          <X className="size-3" />
          실패
        </Badge>
      ) : null}
    </div>
  )
}

/** 초안 HTML 을 격리해서 보여준다. 워드프레스 테마가 아니라 본문만 보는 용도. */
function Preview({ html }: { html: string }) {
  const doc = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;line-height:1.8;padding:16px;margin:0;color:#111;background:#fff}
img{max-width:100%}table{width:100%;border-collapse:collapse}h2{font-size:20px;margin:28px 0 12px}</style>
<body>${html}</body>`
  return (
    <iframe
      title="초안 미리보기"
      sandbox=""
      srcDoc={doc}
      className="h-[420px] w-full rounded-lg border border-border bg-white"
    />
  )
}

function DraftCard({
  draft,
  published,
}: {
  draft: Draft
  published?: { url: string; editUrl: string; status: string }
}) {
  const [open, setOpen] = useState(false)
  const clean = draft.violations.length === 0

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={clean ? "secondary" : "destructive"}>
            {SITE_LABEL[draft.site]}
          </Badge>
          <CardTitle className="text-base">{draft.title}</CardTitle>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span>
            {clean ? "규격 통과" : `규격 위반 ${draft.violations.length}건`} ·
            생성 {draft.attempts}회 · {draft.html.length.toLocaleString()}자
          </span>
          {published ? (
            <a
              href={published.editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              워드프레스에서 열기 <ExternalLink className="size-3" />
            </a>
          ) : null}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {draft.violations.length ? (
          <ul className="space-y-1 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            {draft.violations.map((v, i) => (
              <li key={i} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                <span>
                  <code className="font-mono">{v.rule}</code> — {v.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "미리보기 접기" : "미리보기"}
        </Button>
        {open ? <Preview html={draft.html} /> : null}
      </CardContent>
    </Card>
  )
}

export function WriteConsole({ initialJobs }: { initialJobs: JobSummary[] }) {
  const [topic, setTopic] = useState("")
  const [keywords, setKeywords] = useState("")
  const [finalUrl, setFinalUrl] = useState("")
  const [starting, setStarting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 목록은 서버에서 받아 온 값으로 시작한다. 마운트 직후 다시 부르지 않아도 된다.
  const [jobs, setJobs] = useState<JobSummary[]>(initialJobs)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/write")
    if (!res.ok) return
    const body = (await res.json()) as { jobs: JobSummary[] }
    setJobs(body.jobs)
  }, [])

  // 선택된 잡이 끝날 때까지 3초마다 상태를 다시 읽는다.
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false

    const tick = async () => {
      const res = await fetch(`/api/write/${selectedId}`)
      if (cancelled) return
      if (!res.ok) return
      const body = (await res.json()) as Job
      setJob(body)
      if (!TERMINAL_STATUS.includes(body.status)) {
        timer.current = setTimeout(tick, 3000)
      } else {
        void loadJobs()
      }
    }

    void tick()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [selectedId, loadJobs])

  async function start() {
    setError(null)
    setStarting(true)
    try {
      const res = await fetch("/api/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          keywords: keywords
            .split("\n")
            .map((k) => k.trim())
            .filter(Boolean),
          finalUrl: finalUrl.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "시작하지 못했습니다.")
      setSelectedId(body.jobId)
      setJob(null)
      void loadJobs()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  async function publish() {
    if (!job) return
    setError(null)
    setPublishing(true)
    try {
      const res = await fetch(`/api/write/${job.id}/publish`, {
        method: "POST",
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "발행하지 못했습니다.")
      const fresh = await fetch(`/api/write/${job.id}`)
      setJob((await fresh.json()) as Job)
      void loadJobs()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  const draftsBySite = new Map<SiteKey, Draft>(
    (job?.drafts ?? []).map((d) => [d.site, d])
  )
  const totalViolations = (job?.drafts ?? []).reduce(
    (n, d) => n + d.violations.length,
    0
  )

  return (
    <div className="space-y-6">
      {/* 새 작업 */}
      <Card>
        <CardHeader className="gap-1">
          <CardTitle>새 글 작성</CardTitle>
          <CardDescription>
            주제를 넣으면 최종 링크를 웹에서 찾아 4개 사이트 글을 만들고
            초안으로 올립니다. 확인한 뒤 발행하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="topic" className="text-sm font-medium">
                주제
              </label>
              <input
                id="topic"
                className={inputClass}
                placeholder="숨은보험금 찾기"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={starting}
              />
              <p className="text-xs text-muted-foreground">
                검색하는 사람이 실제로 치는 말 그대로 넣으세요.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="finalUrl" className="text-sm font-medium">
                최종 링크 <span className="text-muted-foreground">(선택)</span>
              </label>
              <input
                id="finalUrl"
                className={inputClass}
                placeholder="비워 두면 웹 검색으로 공식 페이지를 찾습니다"
                value={finalUrl}
                onChange={(e) => setFinalUrl(e.target.value)}
                disabled={starting}
              />
              <p className="text-xs text-muted-foreground">
                넣으면 리서치가 이 주소를 그대로 씁니다. 살아 있는지는
                확인합니다.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="keywords" className="text-sm font-medium">
              광고 키워드{" "}
              <span className="text-muted-foreground">(한 줄에 하나)</span>
            </label>
            <textarea
              id="keywords"
              rows={6}
              className={cn(inputClass, "font-mono text-xs")}
              placeholder={
                "숨은보험금 찾기\n숨은 보험금 찾기 사이트\n숨은 보험금 찾기 수수료"
              }
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={starting}
            />
            <p className="text-xs text-muted-foreground">
              각 키워드가 H2 하나씩을 차지하도록 배치됩니다. 공백을 제거한
              형태로 본문에 실제로 들어갔는지 검사합니다.
            </p>
          </div>

          {error ? (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button onClick={start} disabled={starting || !topic.trim()}>
            {starting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            글 만들기
          </Button>
        </CardContent>
      </Card>

      {/* 최근 작업 */}
      {jobs.length ? (
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-base">최근 작업</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => {
                  setSelectedId(j.id)
                  setJob(null)
                }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted",
                  selectedId === j.id
                    ? "border-primary bg-muted"
                    : "border-border"
                )}
              >
                <div className="font-medium">{j.input.topic}</div>
                <div className="text-muted-foreground">
                  {STATUS_LABEL[j.status]} · {j.slug ?? j.id}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* 진행 상황 */}
      {job ? (
        <Card>
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{job.input.topic}</CardTitle>
              <span className="font-mono text-xs text-muted-foreground">
                {job.id}
              </span>
            </div>
            <Progress job={job} />
          </CardHeader>

          <CardContent className="space-y-4">
            {job.error ? (
              <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {job.error}
              </p>
            ) : null}

            {job.plan ? (
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">슬러그</div>
                  <code className="font-mono">{job.plan.slug}</code>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    핵심 키워드
                  </div>
                  {job.plan.keyword}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">최종 링크</div>
                  <a
                    href={job.research?.finalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 break-all text-primary underline-offset-4 hover:underline"
                  >
                    {job.research?.finalUrl}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                </div>
              </div>
            ) : null}

            {job.research?.linkChecks.length ? (
              <div className="space-y-1 text-xs">
                <div className="text-muted-foreground">링크 확인</div>
                {job.research.linkChecks.map((c) => (
                  <div key={c.url} className="flex items-start gap-2">
                    {c.ok ? (
                      <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="mt-0.5 size-3 shrink-0 text-destructive" />
                    )}
                    <span className="break-all">
                      {c.url}
                      {c.reason ? (
                        <span className="text-destructive"> — {c.reason}</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                진행 로그 {job.log.length}줄
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {job.log
                  .map((l) => {
                    const [time, status, ...rest] = l.split("\t")
                    return `${time.slice(11, 19)}  ${status.padEnd(16)}${rest.join(" ")}`
                  })
                  .join("\n")}
              </pre>
            </details>
          </CardContent>
        </Card>
      ) : null}

      {/* 초안 */}
      {job?.drafts?.length ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              초안 {job.drafts.length}개
              {totalViolations ? (
                <span className="ml-2 text-sm font-normal text-destructive">
                  규격 위반 {totalViolations}건 — 발행 전에 확인하세요
                </span>
              ) : null}
            </h2>

            {job.status === "awaiting_review" ? (
              <Button onClick={publish} disabled={publishing}>
                {publishing ? <Loader2 className="animate-spin" /> : null}
                4개 사이트 발행
              </Button>
            ) : null}
          </div>

          {/* 체인 순서대로 본다. info 가 독자가 처음 만나는 글이다. */}
          {[...CHAIN_ORDER].reverse().map((site) => {
            const draft = draftsBySite.get(site)
            if (!draft) return null
            return (
              <DraftCard
                key={site}
                draft={draft}
                published={job.published?.find((p) => p.site === site)}
              />
            )
          })}
        </div>
      ) : null}

      {/* 발행 후 검증 */}
      {job?.verify ? (
        <Card>
          <CardHeader className="gap-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">체인 검증</CardTitle>
              <Badge variant={job.verify.ok ? "secondary" : "destructive"}>
                {job.verify.ok ? "통과" : "실패"}
              </Badge>
            </div>
            <CardDescription>
              발행된 페이지를 실제로 긁어 링크와 키워드를 다시 셌습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-1">
              {job.verify.hops.map((h) => (
                <div key={h.site} className="flex items-start gap-2">
                  {h.count > 0 ? (
                    <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                  ) : (
                    <X className="mt-0.5 size-3 shrink-0 text-destructive" />
                  )}
                  <span className="break-all">
                    <a
                      href={h.from}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {SITE_LABEL[h.site]}
                    </a>{" "}
                    → {h.to} · {h.count}개
                  </span>
                </div>
              ))}
            </div>

            {job.verify.keywordCoverage.length ? (
              <div className="space-y-1">
                <div className="text-muted-foreground">
                  인포 글 키워드 실측(공백 제거 연속 매칭)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {job.verify.keywordCoverage.map((k) => (
                    <Badge
                      key={k.keyword}
                      variant={k.count > 0 ? "secondary" : "destructive"}
                    >
                      {k.keyword} {k.count}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
