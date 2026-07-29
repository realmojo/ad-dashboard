"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react"

import { StatusDot } from "@/components/status-text"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadDetail } from "@/lib/adgroup-detail-store"
import {
  clearHoveredUrls,
  normalizeUrl,
  setHoveredUrls,
} from "@/lib/hovered-urls"
import { cn } from "@/lib/utils"
import type { PowerLinkAdGroup } from "@/lib/naver-ad"

/** 네이버·카카오 광고그룹을 같은 표로 그리기 위한 최소 공통 형태. */
export type TableAdGroup = Omit<PowerLinkAdGroup, "ads" | "keywords">

const won = new Intl.NumberFormat("ko-KR")

/** CPC 기준선(원). 넘으면 빨강, 이하면 녹색. */
const CPC_THRESHOLD = 80

/** 클릭이 없어 CPC 가 0 인 경우는 판단 근거가 없으므로 색을 주지 않는다. */
function cpcToneClass(cpc: number): string | null {
  if (cpc <= 0) return null
  return cpc > CPC_THRESHOLD
    ? "font-medium text-red-600 dark:text-red-400"
    : "font-medium text-emerald-600 dark:text-emerald-400"
}
// 괄호 안에 짧게 붙이는 용도라 "US$" 대신 "$" 표기를 쓴다.
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})
const pct = (n: number) => `${n.toFixed(2)}%`

type SortKey =
  | "name"
  | "bidAmt"
  | "dailyBudget"
  | "impCnt"
  | "clkCnt"
  | "ctr"
  | "cpc"
  | "salesAmt"

type Direction = "asc" | "desc"

interface Column {
  key: SortKey
  label: string
  numeric: boolean
}

const COLUMNS: Column[] = [
  { key: "name", label: "광고그룹", numeric: false },
  { key: "bidAmt", label: "기본입찰가", numeric: true },
  { key: "dailyBudget", label: "하루예산", numeric: true },
  { key: "impCnt", label: "노출수", numeric: true },
  { key: "clkCnt", label: "클릭수", numeric: true },
  { key: "ctr", label: "클릭률", numeric: true },
  { key: "cpc", label: "CPC", numeric: true },
  { key: "salesAmt", label: "비용", numeric: true },
]

/** 1차 정렬 값이 같을 때 가르는 기준. 항상 내림차순으로 적용한다. */
const TIE_BREAK_KEY = "impCnt" as const

function valueOf(group: TableAdGroup, key: SortKey): string | number {
  switch (key) {
    case "name":
      return group.name
    case "bidAmt":
      return group.bidAmt
    case "dailyBudget":
      // 제한없음은 사실상 가장 큰 예산이므로 정렬에서 맨 위로 간다.
      return group.useDailyBudget ? group.dailyBudget : Number.MAX_SAFE_INTEGER
    default:
      return group.stat[key]
  }
}

export function AdGroupTable({
  adgroups,
  defaultSortKey = "salesAmt",
  tableMaxHeight,
  stickyHeader,
  date,
  usdKrw,
  selectedId,
  onSelect,
}: {
  adgroups: TableAdGroup[]
  defaultSortKey?: SortKey
  /** 상세(키워드·소재) 성과를 조회할 날짜 "YYYY-MM-DD" */
  date?: string
  /**
   * 표 영역에만 적용할 최대 높이 클래스 (예: "max-h-[32rem]").
   * 상세 패널은 이 스크롤 영역 밖에 놓여 항상 보인다.
   */
  tableMaxHeight?: string
  /** 바깥 컨테이너가 스크롤될 때도 컬럼명을 고정하려면 켠다. */
  stickyHeader?: boolean
  /** 1 USD 당 원화. 주면 비용을 달러로도 병기한다. */
  usdKrw?: number
  /** 현재 선택된 광고그룹. 상세는 이 표 바깥에서 그린다. */
  selectedId?: string | null
  onSelect?: (nccAdgroupId: string | null) => void
}) {
  // 기본은 비용 내림차순 — 돈을 많이 쓴 그룹부터 보이도록.
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey)
  const [direction, setDirection] = useState<Direction>("desc")
  // hover 한 광고그룹의 소재 URL 을 애드센스 URL 보고서로 흘려보낸다.
  // 소재는 광고그룹마다 따로 받아야 해서(일괄 조회 API 없음) hover 시점에 지연 로딩한다.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveredId = useRef<string | null>(null)

  const cancelHover = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }, [])

  const handleEnter = useCallback(
    (nccAdgroupId: string) => {
      cancelHover()
      hoveredId.current = nccAdgroupId
      // 행 위를 빠르게 지나갈 때 요청이 쏟아지지 않도록 잠깐 기다린다.
      hoverTimer.current = setTimeout(() => {
        loadDetail(nccAdgroupId, date)
          .then((detail) => {
            // 기다리는 사이 다른 행으로 옮겨갔다면 버린다.
            if (hoveredId.current !== nccAdgroupId) return
            const urls = detail.ads
              .flatMap((ad) => {
                const content = ad.ad ?? ad.adAttr ?? {}
                return [content.pc?.final, content.mobile?.final]
              })
              .filter((url): url is string => Boolean(url))
              .map(normalizeUrl)
            setHoveredUrls([...new Set(urls)])
          })
          .catch(() => {
            // 하이라이트는 부가 기능이라 실패해도 조용히 넘어간다.
          })
      }, 150)
    },
    [cancelHover, date]
  )

  const handleLeave = useCallback(() => {
    cancelHover()
    hoveredId.current = null
    clearHoveredUrls()
  }, [cancelHover])

  // 표가 사라질 때 하이라이트가 남지 않도록 정리한다.
  useEffect(() => () => clearHoveredUrls(), [])

  const sorted = useMemo(() => {
    const rows = [...adgroups]
    rows.sort((a, b) => {
      const left = valueOf(a, sortKey)
      const right = valueOf(b, sortKey)

      const compared =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right, "ko")
          : Number(left) - Number(right)

      if (compared !== 0) return direction === "asc" ? compared : -compared

      // 1차 값이 같으면 노출수 많은 순으로 가른다.
      // (비용이 0원으로 같은 그룹이 많아 순서가 뒤죽박죽 보이는 걸 막는다.)
      if (sortKey !== TIE_BREAK_KEY) {
        const tie = a.stat[TIE_BREAK_KEY] - b.stat[TIE_BREAK_KEY]
        if (tie !== 0) return -tie
      }

      // 그래도 같으면 이름순으로 고정해 렌더마다 순서가 흔들리지 않게 한다.
      return a.name.localeCompare(b.name, "ko")
    })
    return rows
  }, [adgroups, sortKey, direction])

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDirection((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    // 숫자 컬럼은 큰 값부터, 이름은 가나다순이 자연스럽다.
    setDirection(COLUMNS.find((c) => c.key === key)?.numeric ? "desc" : "asc")
  }

  return (
    <div className={cn("overflow-auto", tableMaxHeight)}>
      <Table>
        <TableHeader
          className={cn(
            // 높이를 제한한 경우 스크롤해도 컬럼명이 보이도록 고정한다.
            (tableMaxHeight || stickyHeader) &&
              "sticky top-0 z-10 bg-background"
          )}
        >
          <TableRow>
            {COLUMNS.map((column) => {
              const active = column.key === sortKey
              const Icon = !active
                ? ChevronsUpDown
                : direction === "asc"
                  ? ChevronUp
                  : ChevronDown

              return (
                <TableHead
                  key={column.key}
                  aria-sort={
                    active
                      ? direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={cn(column.numeric && "text-right")}
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                      column.numeric && "flex-row-reverse",
                      active && "font-medium text-foreground"
                    )}
                  >
                    {column.label}
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0",
                        active ? "opacity-100" : "opacity-40"
                      )}
                      aria-hidden
                    />
                  </button>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((adgroup) => (
            <TableRow
              key={adgroup.nccAdgroupId}
              onClick={() =>
                onSelect?.(
                  selectedId === adgroup.nccAdgroupId
                    ? null
                    : adgroup.nccAdgroupId
                )
              }
              onMouseEnter={() => handleEnter(adgroup.nccAdgroupId)}
              onMouseLeave={handleLeave}
              aria-selected={adgroup.nccAdgroupId === selectedId}
              className={cn(
                "cursor-pointer hover:bg-muted/60",
                adgroup.nccAdgroupId === selectedId && "bg-muted"
              )}
            >
              <TableCell className="font-medium">
                {/* URL 표와 같은 방식 — 컬럼을 늘리지 않고 이름 오른쪽에 상태를 붙인다. */}
                <span className="flex items-center justify-between gap-3">
                  <span>{adgroup.name}</span>
                  <StatusDot
                    status={adgroup.status}
                    userLock={adgroup.userLock}
                  />
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {won.format(adgroup.bidAmt)}원
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {adgroup.useDailyBudget ? (
                  `${won.format(adgroup.dailyBudget)}원`
                ) : (
                  <span className="text-muted-foreground">제한없음</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {won.format(adgroup.stat.impCnt)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {won.format(adgroup.stat.clkCnt)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {pct(adgroup.stat.ctr)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  cpcToneClass(adgroup.stat.cpc)
                )}
              >
                {won.format(adgroup.stat.cpc)}원
              </TableCell>
              <TableCell className="text-right font-bold tabular-nums">
                {won.format(adgroup.stat.salesAmt)}원
                {usdKrw ? (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({usd.format(adgroup.stat.salesAmt / usdKrw)})
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
