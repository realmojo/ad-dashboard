import {
  BROWSER_UA,
  SITES,
  WP_APP_PASS,
  WP_PASS,
  WP_USER,
} from "@/lib/chain/config"
import type { SiteKey } from "@/lib/chain/types"

type Session = { cookie: string; nonce: string; at: number }

const sessions = new Map<SiteKey, Session>()
/** nonce 는 수명이 있어서 오래 들고 있으면 조용히 깨진다. 10분마다 다시 받는다. */
const SESSION_TTL = 10 * 60 * 1000

function collectCookies(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? []
  return raw.map((c) => c.split(";")[0]).join("; ")
}

async function login(site: SiteKey): Promise<Session> {
  const cached = sessions.get(site)
  if (cached && Date.now() - cached.at < SESSION_TTL) return cached

  const { domain } = SITES[site]
  if (!WP_PASS) throw new Error("WP_PASS 환경변수가 없습니다.")

  const body = new URLSearchParams({
    log: WP_USER,
    pwd: WP_PASS,
    "wp-submit": "Log In",
    redirect_to: `https://${domain}/wp-admin/`,
    testcookie: "1",
  })

  const res = await fetch(`https://${domain}/wp-login.php`, {
    method: "POST",
    body,
    redirect: "manual",
    headers: {
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: "wordpress_test_cookie=WP+Cookie+check",
    },
  })

  const cookie = collectCookies(res)
  if (!cookie.includes("wordpress_logged_in")) {
    throw new Error(`${domain} 로그인 실패 (HTTP ${res.status})`)
  }

  // REST nonce 는 post-new.php 의 wpApiSettings 안에 들어 있다.
  const admin = await fetch(`https://${domain}/wp-admin/post-new.php`, {
    headers: { "User-Agent": BROWSER_UA, Cookie: cookie },
  })
  const html = await admin.text()
  const nonce = html.match(
    /wpApiSettings = \{"root":"[^"]*","nonce":"([a-z0-9]+)"/
  )?.[1]
  if (!nonce) throw new Error(`${domain} REST nonce 파싱 실패`)

  const session: Session = { cookie, nonce, at: Date.now() }
  sessions.set(site, session)
  return session
}

async function authHeaders(site: SiteKey): Promise<Record<string, string>> {
  const appPass = WP_APP_PASS[site]
  if (appPass) {
    // 애플리케이션 비밀번호가 있으면 이쪽이 훨씬 안정적이다.
    const token = Buffer.from(`${WP_USER}:${appPass}`).toString("base64")
    return { Authorization: `Basic ${token}` }
  }
  const { cookie, nonce } = await login(site)
  return { Cookie: cookie, "X-WP-Nonce": nonce }
}

async function categoryId(site: SiteKey): Promise<number> {
  const { domain } = SITES[site]
  const headers = await authHeaders(site)
  const res = await fetch(
    `https://${domain}/wp-json/wp/v2/categories?per_page=100`,
    { headers: { ...headers, "User-Agent": BROWSER_UA } }
  )
  if (!res.ok) return 1
  const cats = (await res.json()) as { id: number; name: string }[]
  return (
    cats.find((c) => c.name === "미분류" || c.name === "Uncategorized")?.id ?? 1
  )
}

export type WpPost = {
  id: number
  url: string
  editUrl: string
  status: string
}

function editUrl(site: SiteKey, id: number) {
  return `https://${SITES[site].domain}/wp-admin/post.php?post=${id}&action=edit`
}

export async function createPost(
  site: SiteKey,
  post: {
    title: string
    slug: string
    content: string
    status: "draft" | "publish"
  }
): Promise<WpPost> {
  const { domain } = SITES[site]
  const headers = await authHeaders(site)
  const catid = await categoryId(site)

  const res = await fetch(`https://${domain}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      ...headers,
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      title: post.title,
      slug: post.slug,
      content: post.content,
      status: post.status,
      categories: [catid],
      comment_status: "closed",
      ping_status: "closed",
    }),
  })

  const json = (await res.json()) as {
    id?: number
    link?: string
    status?: string
  }
  if (!json?.id) {
    throw new Error(
      `${domain} 발행 실패: ${JSON.stringify(json).slice(0, 300)}`
    )
  }
  return {
    id: json.id,
    url: json.link ?? "",
    editUrl: editUrl(site, json.id),
    status: json.status ?? "draft",
  }
}

export async function updatePostStatus(
  site: SiteKey,
  id: number,
  status: "draft" | "publish"
): Promise<WpPost> {
  const { domain } = SITES[site]
  const headers = await authHeaders(site)
  const res = await fetch(`https://${domain}/wp-json/wp/v2/posts/${id}`, {
    method: "POST",
    headers: {
      ...headers,
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ status }),
  })
  const json = (await res.json()) as {
    id?: number
    link?: string
    status?: string
  }
  if (!json?.id) {
    throw new Error(
      `${domain} 상태 변경 실패: ${JSON.stringify(json).slice(0, 300)}`
    )
  }
  return {
    id: json.id,
    url: json.link ?? "",
    editUrl: editUrl(site, json.id),
    status: json.status ?? status,
  }
}

/** 슬러그가 이미 쓰이고 있으면 워드프레스가 조용히 -2 를 붙인다. 미리 잡는다. */
export async function slugExists(
  site: SiteKey,
  slug: string
): Promise<boolean> {
  const { domain } = SITES[site]
  const headers = await authHeaders(site)
  const res = await fetch(
    `https://${domain}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&status=any`,
    { headers: { ...headers, "User-Agent": BROWSER_UA } }
  )
  if (!res.ok) return false
  const posts = (await res.json()) as unknown[]
  return Array.isArray(posts) && posts.length > 0
}

/** 발행된 페이지를 실제로 긁어 본문 링크를 센다. 체인이 이어졌는지 최종 확인용. */
export async function fetchEntryHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA },
    redirect: "follow",
  })
  const html = await res.text()
  return (
    html.match(
      /<div class="entry-content[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>\s*<\/article>|<footer)/
    )?.[1] ?? html
  )
}
