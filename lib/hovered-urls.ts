"use client"

import { useSyncExternalStore } from "react"

export { normalizeUrl } from "@/lib/url"

/**
 * 네이버 광고그룹에 hover 했을 때, 그 소재의 랜딩 URL 을 애드센스 URL 보고서와
 * 연결하기 위한 아주 작은 전역 스토어.
 * 두 표가 서로 다른 서버 컴포넌트 안에 있어 props 로는 이어줄 수 없다.
 */
let hovered: readonly string[] = []
const listeners = new Set<() => void>()

const EMPTY: readonly string[] = []

function emit() {
  for (const listener of listeners) listener()
}

export function setHoveredUrls(urls: readonly string[]) {
  // 내용이 같으면 리렌더를 일으키지 않는다.
  if (
    hovered.length === urls.length &&
    hovered.every((url, i) => url === urls[i])
  ) {
    return
  }
  hovered = urls
  emit()
}

export function clearHoveredUrls() {
  setHoveredUrls(EMPTY)
}

export function useHoveredUrls(): readonly string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => hovered,
    () => EMPTY
  )
}
