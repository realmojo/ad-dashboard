/**
 * 검색 기록을 브라우저(localStorage)에 둔다. 서버로 보내지 않는다.
 *
 * useSyncExternalStore 로 읽을 수 있게 만들었다. effect 안에서 setState 하는
 * 방식과 달리 첫 렌더에 바로 값이 잡히고, 탭이 여러 개 열려 있어도
 * storage 이벤트로 함께 맞춰진다.
 */
const KEY = "naver-search-history"
const MAX = 50

const listeners = new Set<() => void>()

/**
 * getSnapshot 은 같은 값이면 같은 참조를 돌려줘야 한다.
 * 그래서 배열이 아니라 저장된 문자열을 그대로 기억해 둔다.
 */
let snapshot: string | undefined

const EMPTY = "[]"

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? EMPTY
  } catch {
    // 사생활 보호 모드 등에서 접근이 막힐 수 있다.
    return EMPTY
  }
}

function write(terms: string[]) {
  const json = JSON.stringify(terms)
  snapshot = json
  try {
    window.localStorage.setItem(KEY, json)
  } catch {
    // 저장에 실패해도 이번 세션 동안은 화면에 보이게 둔다.
  }
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== KEY) return
  snapshot = undefined
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage)
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener("storage", onStorage)
  }
}

export function getSnapshot() {
  if (snapshot === undefined) snapshot = read()
  return snapshot
}

/** 서버에는 localStorage 가 없다. 기록 없는 상태로 그린 뒤 채운다. */
export function getServerSnapshot() {
  return EMPTY
}

export function parseHistory(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === "string")
  } catch {
    return []
  }
}

/** 최근 것이 맨 위. 같은 검색어는 위로 끌어올린다. */
export function pushHistory(term: string) {
  const trimmed = term.trim()
  if (!trimmed) return

  const current = parseHistory(getSnapshot())
  if (current[0] === trimmed) return

  write([trimmed, ...current.filter((t) => t !== trimmed)].slice(0, MAX))
}

export function removeHistory(term: string) {
  write(parseHistory(getSnapshot()).filter((t) => t !== term))
}

export function clearHistory() {
  write([])
}
