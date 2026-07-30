#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { extractPost } from "./lib/post/extract.js"
import { renderPost } from "./lib/post/render.js"
import { TARGETS } from "./lib/post/targets.js"

/**
 * 발행한 info 글을 다른 사이트 게시판에 옮겨 등록한다.
 *
 *   node upload-post.js <infoUrl>                     등록 대상 전체
 *   node upload-post.js <infoUrl> --site ezday        한 곳만
 *   node upload-post.js <infoUrl> --dry-run           파일로만 출력
 *   node upload-post.js <infoUrl> --title "제목" --board 자유톡 --no-anonymous
 *
 * 자격증명은 .env 에서 읽는다(사이트별 *_ID, *_PW).
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function parseArgs(argv) {
  const args = { dryRun: false, anonymous: true, sites: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dry-run") args.dryRun = true
    else if (a === "--no-anonymous") args.anonymous = false
    else if (a === "--title") args.title = argv[++i]
    else if (a === "--cta") args.ctaText = argv[++i]
    else if (a === "--board") args.board = argv[++i]
    else if (a === "--site") args.sites.push(argv[++i])
    else if (!a.startsWith("--")) args.url = a
  }
  if (!args.sites.length) args.sites = Object.keys(TARGETS)
  return args
}

/** .env 를 직접 읽는다. 이 스크립트는 Next 밖에서도 돌아야 한다. */
function loadEnv() {
  try {
    const text = readFileSync(join(HERE, ".env"), "utf8")
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
      }
    }
  } catch {
    // .env 가 없어도 환경변수로 넘길 수 있다.
  }
}

async function uploadTo(key, { title, html, board, anonymous }) {
  const target = TARGETS[key]
  const id = process.env[target.envId]
  const pw = process.env[target.envPw]
  if (!id || !pw) {
    throw new Error(`.env 에 ${target.envId}, ${target.envPw} 가 필요합니다.`)
  }

  const boardName = board ?? target.defaultBoard
  const boardConfig = target.boards[boardName]
  if (!boardConfig) {
    throw new Error(
      `${target.label} 에 없는 게시판입니다: ${boardName} ` +
        `(가능: ${Object.keys(target.boards).join(", ")})`
    )
  }

  const client = target.create()
  await client.login(id, pw)

  const { postUrl } = await client.writePost({
    board: boardConfig,
    title,
    html,
    ...(target.supportsAnonymous ? { anonymous } : {}),
  })
  return { boardName, postUrl }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.url) {
    console.error(
      "사용법: node upload-post.js https://info.mindpang.com/<slug> [--site ezday] [--dry-run]"
    )
    console.error(`등록 대상: ${Object.keys(TARGETS).join(", ")}`)
    process.exit(1)
  }

  let slug
  try {
    slug = new URL(args.url).pathname.replace(/^\/|\/$/g, "") || "post"
  } catch {
    console.error("올바른 주소가 아닙니다:", args.url)
    process.exit(1)
  }

  for (const key of args.sites) {
    if (!TARGETS[key]) {
      console.error(
        `모르는 사이트입니다: ${key} (가능: ${Object.keys(TARGETS).join(", ")})`
      )
      process.exit(1)
    }
  }

  console.log("원본 :", args.url)
  const res = await fetch(args.url, { headers: { "User-Agent": UA } })
  if (!res.ok) {
    console.error(`원본 글을 읽지 못했습니다 (HTTP ${res.status})`)
    process.exit(1)
  }

  const { title, blocks, highlight } = extractPost(await res.text())
  const finalTitle = args.title ?? title
  const ctaText =
    args.ctaText ?? `${title.split(" ").slice(0, 3).join(" ")} 자세히 보기`
  const html = renderPost({
    title: finalTitle,
    blocks,
    highlight,
    ctaUrl: args.url,
    ctaText,
  })

  console.log("제목 :", finalTitle)
  console.log(
    "본문 :",
    `${html.length.toLocaleString()}자 · 블록 ${blocks.length}개`
  )
  console.log("버튼 :", `${ctaText} → ${args.url}`)

  const outDir = join(HERE, "out")
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, `${slug}.html`)
  writeFileSync(outFile, html, "utf8")
  console.log("저장 :", outFile)

  if (args.dryRun) {
    console.log("\n--dry-run 이라 등록하지 않았습니다.")
    return
  }

  loadEnv()
  console.log("")

  // 한 곳이 실패해도 나머지는 계속 올린다. 결과는 마지막에 한 번에 본다.
  const results = []
  for (const key of args.sites) {
    const label = TARGETS[key].label
    try {
      const { boardName, postUrl } = await uploadTo(key, {
        title: finalTitle,
        html,
        board: args.board,
        anonymous: args.anonymous,
      })
      console.log(`✅ ${label} · ${boardName}`)
      console.log(`   ${postUrl}`)
      results.push({ key, ok: true })
    } catch (error) {
      console.log(`❌ ${label}: ${error.message}`)
      results.push({ key, ok: false })
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 등록 완료`)
  if (failed.length) process.exit(1)
}

main().catch((error) => {
  console.error("\n실패:", error.message)
  process.exit(1)
})
