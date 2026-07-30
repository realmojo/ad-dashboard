import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import type { Site, SiteKey } from "@/lib/chain/types"

/**
 * 템플릿은 dashboard 밖, 저장소 루트의 사이트별 폴더에 있다.
 * dashboard/ 에서 한 단계 올라가면 mindpang-wp/ 다.
 */
export const REPO_ROOT = resolve(process.cwd(), "..")
/** 잡 상태 파일. .gitignore 에 들어 있다. */
export const JOB_DIR = join(process.cwd(), ".chain-jobs")

export const SITES: Record<SiteKey, Site> = {
  hub: {
    key: "hub",
    domain: "hub.mindpang.com",
    templatePath: join(REPO_ROOT, "hub", "template.md"),
    linksTo: "final",
  },
  ss: {
    key: "ss",
    domain: "ss.keywordegg.com",
    templatePath: join(REPO_ROOT, "keywordegg-wp", "template.md"),
    linksTo: "hub",
  },
  good: {
    key: "good",
    domain: "good.mindpang.com",
    templatePath: join(REPO_ROOT, "good", "template.md"),
    linksTo: "ss",
  },
  info: {
    key: "info",
    domain: "info.mindpang.com",
    templatePath: join(REPO_ROOT, "info", "template.md"),
    linksTo: "good",
  },
}

const templateCache = new Map<SiteKey, string>()

export function loadTemplate(site: SiteKey): string {
  const cached = templateCache.get(site)
  if (cached) return cached

  const path = SITES[site].templatePath
  if (!existsSync(path)) {
    throw new Error(`템플릿을 찾을 수 없습니다: ${path}`)
  }
  const text = readFileSync(path, "utf8")
  templateCache.set(site, text)
  return text
}

export const WP_USER = process.env.WP_USER ?? "mindpang"
export const WP_PASS = process.env.WP_PASS ?? ""

/** 사이트별 애플리케이션 비밀번호. 있으면 쿠키+nonce 대신 Basic 인증을 쓴다. */
export const WP_APP_PASS: Partial<Record<SiteKey, string>> = {
  hub: process.env.WP_APP_PASS_HUB,
  ss: process.env.WP_APP_PASS_SS,
  good: process.env.WP_APP_PASS_GOOD,
  info: process.env.WP_APP_PASS_INFO,
}

/**
 * 세션은 로그인한 Claude Code 구독 계정으로 돈다(API 키를 쓰지 않는다).
 * 리서치·생성은 세션 기본 모델을 쓰고, 검색이 필요 없는 구조 설계만 값싼 모델로 내린다.
 */
export const MODEL_PLAN = process.env.CHAIN_MODEL_PLAN ?? "sonnet"

/** 네이버 상표 키워드 광고 제한 대응. 여기 걸리면 생성을 되돌린다. */
export const BRAND_BLOCKLIST = (process.env.CHAIN_BRAND_BLOCKLIST ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

/** 일부 기관 사이트는 curl 기본 UA 에 응답하지 않는다. */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
