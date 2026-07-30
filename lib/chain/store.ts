import { randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import { JOB_DIR } from "@/lib/chain/config"
import type { Job, JobStatus, JobSummary } from "@/lib/chain/types"

/**
 * 잡 상태를 파일로 둔다. next dev 는 HMR 로 모듈이 통째로 다시 로드되는데,
 * 인메모리 Map 이면 그때 진행 중인 잡이 사라진다.
 */
function ensureDir() {
  if (!existsSync(JOB_DIR)) mkdirSync(JOB_DIR, { recursive: true })
}

const file = (id: string) => join(JOB_DIR, `${id}.json`)

export function createJob(input: Job["input"]): Job {
  ensureDir()
  const now = new Date().toISOString()
  const job: Job = {
    id: randomUUID().slice(0, 8),
    createdAt: now,
    updatedAt: now,
    status: "queued",
    input,
    log: [],
  }
  saveJob(job)
  return job
}

export function saveJob(job: Job): void {
  ensureDir()
  job.updatedAt = new Date().toISOString()
  writeFileSync(file(job.id), JSON.stringify(job, null, 2), "utf8")
}

export function getJob(id: string): Job | null {
  // 경로 조작 방지. id 는 uuid 앞 8자라 영숫자만 나온다.
  if (!/^[a-f0-9]{8}$/.test(id)) return null
  if (!existsSync(file(id))) return null
  return JSON.parse(readFileSync(file(id), "utf8")) as Job
}

export function listJobs(limit = 20): JobSummary[] {
  ensureDir()
  return readdirSync(JOB_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(JOB_DIR, f), "utf8")) as Job)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(({ id, status, createdAt, updatedAt, input, plan }) => ({
      id,
      status,
      createdAt,
      updatedAt,
      input,
      slug: plan?.slug,
    }))
}

export function step(job: Job, status: JobStatus, message: string): void {
  job.status = status
  job.log.push(`${new Date().toISOString()}\t${status}\t${message}`)
  saveJob(job)
  console.log(`[chain ${job.id}] ${status}: ${message}`)
}
