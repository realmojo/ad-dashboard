import { parseHtml, parseJson, runAgent } from "@/lib/chain/agent"
import { MODEL_PLAN, SITES } from "@/lib/chain/config"
import {
  RESEARCH_SYSTEM,
  WRITE_SYSTEM,
  generatePrompt,
  planPrompt,
  researchPrompt,
} from "@/lib/chain/prompts"
import { saveJob, step } from "@/lib/chain/store"
import { buildWriteTools, checkLink, researchTools } from "@/lib/chain/tools"
import { CHAIN_ORDER } from "@/lib/chain/types"
import type {
  ChainVerification,
  Draft,
  Job,
  Plan,
  Published,
  Research,
  SiteKey,
} from "@/lib/chain/types"
import { flatten, validate } from "@/lib/chain/validate"
import {
  createPost,
  fetchEntryHtml,
  slugExists,
  updatePostStatus,
} from "@/lib/chain/wp"

async function doResearch(job: Job): Promise<Research> {
  step(job, "research", "리서치 세션을 띄웁니다.")

  const { text, costUsd, turns } = await runAgent({
    systemPrompt: RESEARCH_SYSTEM,
    prompt: researchPrompt(
      job.input.topic,
      job.input.keywords,
      job.input.finalUrl
    ),
    // 검색·열람과 링크 확인만 준다. 파일도 셸도 필요 없다.
    allowedTools: ["WebSearch", "WebFetch", "mcp__chain__check_link"],
    mcpServers: { chain: researchTools },
    maxTurns: 40,
    onProgress: (line) => step(job, "research", line),
  })

  const raw = parseJson<Omit<Research, "linkChecks">>(text)
  const finalUrl = job.input.finalUrl ?? raw.finalUrl
  if (!finalUrl) throw new Error("최종 링크를 찾지 못했습니다.")

  // 에이전트가 check_link 를 썼더라도 최종 판정은 코드가 다시 한다.
  const urls = [finalUrl, ...(raw.extraUrls ?? [])].filter(Boolean).slice(0, 3)
  const linkChecks = await Promise.all(urls.map(checkLink))

  const deadFinal = linkChecks.find((c) => c.url === finalUrl && !c.ok)
  if (deadFinal) {
    throw new Error(
      `최종 링크가 살아 있지 않습니다: ${finalUrl} (${deadFinal.reason})`
    )
  }

  // 보조 링크는 죽었으면 조용히 버린다. 최종 링크만 치명적이다.
  const extraUrls = (raw.extraUrls ?? []).filter(
    (u) => linkChecks.find((c) => c.url === u)?.ok
  )

  step(
    job,
    "research",
    `최종 링크 ${finalUrl} · 사실 ${raw.facts?.length ?? 0}건 · ${turns}턴 · $${costUsd.toFixed(3)}`
  )
  return {
    finalUrl,
    extraUrls,
    facts: raw.facts ?? [],
    cautions: raw.cautions ?? [],
    linkChecks,
  }
}

async function doPlan(job: Job, research: Research): Promise<Plan> {
  step(job, "plan", "슬러그·제목·H2 구조를 잡습니다.")

  const { text } = await runAgent({
    systemPrompt: RESEARCH_SYSTEM,
    prompt: planPrompt(job.input.topic, job.input.keywords, research),
    allowedTools: [],
    model: MODEL_PLAN,
    maxTurns: 3,
  })
  const plan = parseJson<Plan>(text)

  // 슬러그 충돌은 발행 후에 알면 늦다. 워드프레스가 조용히 -2 를 붙인다.
  const taken: SiteKey[] = []
  for (const site of CHAIN_ORDER) {
    if (await slugExists(site, plan.slug)) taken.push(site)
  }
  if (taken.length) {
    throw new Error(
      `슬러그 "${plan.slug}" 가 이미 사용 중입니다(${taken.join(", ")}). ` +
        "기존 글을 수정할지 다른 슬러그를 쓸지 정해야 합니다."
    )
  }

  step(job, "plan", `슬러그 ${plan.slug} · 키워드 "${plan.keyword}"`)
  return plan
}

function ctaFor(site: SiteKey, plan: Plan, research: Research): string {
  const target = SITES[site].linksTo
  if (target === "final") return research.finalUrl
  return `https://${SITES[target].domain}/${plan.slug}`
}

async function generateOne(
  job: Job,
  site: SiteKey,
  plan: Plan,
  research: Research
): Promise<Draft> {
  const ctaUrl = ctaFor(site, plan, research)
  const allowedLinks = [research.finalUrl, ...research.extraUrls]
  const h2 = site === "good" ? [] : (plan.h2?.[site] ?? [])

  let validations = 0
  const { text, costUsd, turns } = await runAgent({
    systemPrompt: WRITE_SYSTEM,
    prompt: generatePrompt({ site, plan, research, ctaUrl, h2 }),
    // 템플릿을 직접 읽고, 검증기를 통과할 때까지 스스로 고친다.
    allowedTools: ["Read", "mcp__chain__validate_post"],
    mcpServers: {
      chain: buildWriteTools({
        keyword: plan.keyword,
        longtails: plan.longtails,
        ctaUrl,
        allowedLinks,
        titleOf: (s) => plan.titles[s],
      }),
    },
    maxTurns: 30,
    onProgress: (line) => {
      if (line.startsWith("validate_post")) validations++
      step(job, "generate", `${site} · ${line}`)
    },
  })

  const html = parseHtml(text)

  // 에이전트가 통과했다고 말해도 믿지 않는다. 제출본으로 한 번 더 검사한다.
  const violations = validate(site, {
    html,
    title: plan.titles[site],
    keyword: plan.keyword,
    longtails: plan.longtails,
    ctaUrl,
    allowedLinks,
  })

  step(
    job,
    "validate",
    violations.length
      ? `${site} 최종 검사 실패 — 초안에 남깁니다: ${violations.map((v) => v.rule).join(", ")}`
      : `${site} 검증 통과 · 자체검사 ${validations}회 · ${turns}턴 · $${costUsd.toFixed(3)}`
  )

  return {
    site,
    title: plan.titles[site],
    html,
    violations,
    attempts: validations,
  }
}

async function uploadDrafts(
  job: Job,
  plan: Plan,
  drafts: Draft[]
): Promise<Published[]> {
  step(job, "drafting", "4개 사이트에 초안으로 올립니다.")
  const published: Published[] = []

  // 역순(hub → ss → good → info). 앞 글의 주소가 다음 글의 버튼이 되므로 순서가 중요하다.
  for (const site of CHAIN_ORDER) {
    const draft = drafts.find((d) => d.site === site)
    if (!draft) continue
    const res = await createPost(site, {
      title: draft.title,
      slug: plan.slug,
      content: draft.html,
      status: "draft",
    })
    published.push({
      site,
      id: res.id,
      url: res.url,
      editUrl: res.editUrl,
      status: "draft",
    })
    step(job, "drafting", `${site} 초안 id=${res.id}`)
  }

  return published
}

/** 생성부터 초안 업로드까지. 응답을 기다리지 않고 백그라운드에서 돈다. */
export async function runChain(job: Job): Promise<void> {
  try {
    job.research = await doResearch(job)
    saveJob(job)

    const plan = await doPlan(job, job.research)
    job.plan = plan
    saveJob(job)

    step(job, "generate", "4개 글을 생성합니다.")
    const drafts: Draft[] = []
    for (const site of CHAIN_ORDER) {
      drafts.push(await generateOne(job, site, plan, job.research))
      job.drafts = drafts
      saveJob(job)
    }

    job.published = await uploadDrafts(job, plan, drafts)
    step(job, "awaiting_review", "초안 준비 완료. 확인 후 발행하세요.")
  } catch (error) {
    job.error = (error as Error).message
    step(job, "failed", job.error)
  }
}

/** 초안 4개를 발행하고, 실제 페이지를 긁어 체인이 이어졌는지 확인한다. */
export async function publishChain(job: Job): Promise<ChainVerification> {
  if (!job.published?.length) throw new Error("발행할 초안이 없습니다.")
  if (!job.plan || !job.research) {
    throw new Error("plan 또는 research 가 없습니다.")
  }

  step(job, "publishing", "초안 4개를 발행 상태로 바꿉니다.")
  for (const pub of job.published) {
    const res = await updatePostStatus(pub.site, pub.id, "publish")
    pub.status = "publish"
    pub.url = res.url
  }
  saveJob(job)

  const hops: ChainVerification["hops"] = []
  for (const site of [...CHAIN_ORDER].reverse()) {
    const pub = job.published.find((p) => p.site === site)
    if (!pub) continue
    const expected = ctaFor(site, job.plan, job.research)
    const body = await fetchEntryHtml(pub.url)
    const count = [...body.matchAll(/href=["'](https?:[^"']+)["']/g)].filter(
      (m) => m[1].startsWith(expected)
    ).length
    hops.push({ site, from: pub.url, to: expected, count })
  }

  const keywordCoverage: ChainVerification["keywordCoverage"] = []
  const infoPub = job.published.find((p) => p.site === "info")
  if (infoPub) {
    const flat = flatten(await fetchEntryHtml(infoPub.url))
    for (const k of job.plan.longtails) {
      keywordCoverage.push({
        keyword: k,
        count: flat.split(flatten(k)).length - 1,
      })
    }
  }

  const verify: ChainVerification = {
    ok:
      hops.every((h) => h.count > 0) &&
      keywordCoverage.every((k) => k.count > 0),
    hops,
    keywordCoverage,
  }
  job.verify = verify
  step(
    job,
    verify.ok ? "done" : "failed",
    verify.ok ? "체인 검증 통과" : "체인 검증 실패 — 링크 또는 키워드 누락"
  )
  return verify
}
