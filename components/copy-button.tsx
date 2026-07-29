"use client"

import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * 텍스트를 클립보드로 복사한다.
 *
 * navigator.clipboard 는 https 나 localhost 에서만 동작하므로,
 * 사내망 http 접속 같은 경우를 위해 textarea 를 이용한 예전 방식으로 물러선다.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 아래 대체 경로로 넘어간다.
  }

  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    // 화면 밖에 두어 스크롤이 튀지 않게 한다.
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

export function CopyButton({
  text,
  /** 빈 문자열이면 아이콘만 보여준다. 좁은 자리에 붙일 때 쓴다. */
  label = "복사",
  copiedLabel = "복사됨",
  title,
  className,
}: {
  text: string
  label?: string
  copiedLabel?: string
  title?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  // 복사 표시는 잠깐만 보여준다.
  useEffect(() => {
    if (!copied && !failed) return
    const id = setTimeout(() => {
      setCopied(false)
      setFailed(false)
    }, 1500)
    return () => clearTimeout(id)
  }, [copied, failed])

  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        copyText(text).then((ok) => (ok ? setCopied(true) : setFailed(true)))
      }}
      aria-label={title ?? label ?? "복사"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border text-xs transition-colors hover:bg-muted",
        label ? "px-2 py-0.5" : "p-1",
        copied && "border-emerald-500 text-emerald-600 dark:text-emerald-400",
        failed && "border-red-500 text-red-600 dark:text-red-400",
        className
      )}
    >
      {copied ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <Copy className="size-3" aria-hidden />
      )}
      {label ? (failed ? "복사 실패" : copied ? copiedLabel : label) : null}
    </button>
  )
}
