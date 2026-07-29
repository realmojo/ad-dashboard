"use client"

import { useEffect, useState } from "react"

import { CopyButton } from "@/components/copy-button"
import {
  KEYWORD_STATE_CLASS,
  StatusDot,
  keywordState,
} from "@/components/status-text"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  detailCacheKey,
  getCachedDetail,
  hasCachedDetail,
  loadDetail,
} from "@/lib/adgroup-detail-store"
import type { AdGroupDetailResult } from "@/lib/naver-ad"
import { cn } from "@/lib/utils"

const won = new Intl.NumberFormat("ko-KR")
const pct = (n: number) => `${n.toFixed(2)}%`

type Detail = AdGroupDetailResult

export function AdGroupDetail({
  nccAdgroupId,
  name,
  date,
  platform = "naver",
  campaignId,
  onClose,
}: {
  nccAdgroupId: string
  name: string
  /** 어느 매체의 상세 API 를 부를지 */
  platform?: "naver" | "kakao"
  /** 카카오 키워드 성과 조회에 필요 */
  campaignId?: string
  /** 성과 조회 날짜 "YYYY-MM-DD". 날짜가 바뀌면 다시 조회한다. */
  date?: string
  onClose?: () => void
}) {
  // 날짜별로 성과가 다르므로 캐시 키에 날짜를 포함한다.
  const cacheKey = detailCacheKey(nccAdgroupId, date)
  // 결과는 광고그룹 id 를 키로 담아둔다. 이렇게 하면 effect 안에서
  // 동기적으로 상태를 되돌릴 필요 없이, 렌더 중에 현재 id 의 값만 꺼내 쓰면 된다.
  const [loaded, setLoaded] = useState<Record<string, Detail>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const detail = getCachedDetail(cacheKey) ?? loaded[cacheKey] ?? null
  const error = errors[cacheKey] ?? null

  useEffect(() => {
    if (hasCachedDetail(cacheKey)) return

    let cancelled = false

    loadDetail(nccAdgroupId, date, platform, campaignId)
      .then((body) => {
        if (!cancelled) setLoaded((prev) => ({ ...prev, [cacheKey]: body }))
      })
      .catch((e: Error) => {
        if (!cancelled)
          setErrors((prev) => ({ ...prev, [cacheKey]: e.message }))
      })

    return () => {
      cancelled = true
    }
  }, [nccAdgroupId, cacheKey, date, platform, campaignId])

  // 표에 보이는 순서 그대로 복사되도록 한 번만 정렬해 재사용한다.
  const sortedKeywords = detail
    ? [...detail.keywords].sort((a, b) => b.stat.salesAmt - a.stat.salesAmt)
    : []

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium">{name}</span>
        <code className="text-xs text-muted-foreground">{nccAdgroupId}</code>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            닫기
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !detail ? (
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-20 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide uppercase">
              소재 {detail.ads.length}개
            </h4>
            {detail.ads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                등록된 소재가 없습니다.
              </p>
            ) : (
              <ul className="space-y-3">
                {detail.ads.map((ad) => {
                  const content = ad.ad ?? ad.adAttr ?? {}
                  const url = content.pc?.final ?? content.mobile?.final
                  return (
                    <li
                      key={ad.nccAdId}
                      className="space-y-1 rounded-md border bg-background p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {content.headline ?? "(제목 없음)"}
                        </span>
                        <StatusDot
                          status={ad.inspectStatus ?? ad.status}
                          userLock={ad.userLock}
                        />
                        {content.headline ? (
                          <CopyButton
                            text={content.headline}
                            label=""
                            title="제목 복사"
                          />
                        ) : null}
                      </div>
                      <div className="flex items-start gap-2">
                        <p className="text-sm text-muted-foreground">
                          {content.description ?? "(설명 없음)"}
                        </p>
                        {content.description ? (
                          <CopyButton
                            text={content.description}
                            label=""
                            title="설명 복사"
                          />
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        노출 {won.format(ad.stat.impCnt)} · 클릭{" "}
                        {won.format(ad.stat.clkCnt)} · 클릭률 {pct(ad.stat.ctr)}{" "}
                        · CPC {won.format(ad.stat.cpc)}원 · 비용{" "}
                        {won.format(ad.stat.salesAmt)}원
                      </p>
                      {url ? (
                        <div className="flex items-start gap-2">
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs break-all text-blue-600 underline underline-offset-2 dark:text-blue-400"
                          >
                            {url}
                          </a>
                          <CopyButton text={url} label="" title="URL 복사" />
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs font-semibold tracking-wide uppercase">
                키워드 {detail.keywords.length}개
              </h4>
              {sortedKeywords.length > 0 ? (
                <CopyButton
                  text={sortedKeywords.map((k) => k.keyword).join("\n")}
                  label="키워드 복사"
                  copiedLabel={`${sortedKeywords.length}개 복사됨`}
                  title="표에 보이는 순서대로 한 줄에 하나씩 복사합니다"
                />
              ) : null}
            </div>
            {detail.keywords.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                등록된 키워드가 없습니다.
              </p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-md border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>키워드</TableHead>
                      <TableHead className="text-right">노출수</TableHead>
                      <TableHead className="text-right">클릭수</TableHead>
                      <TableHead className="whitespace-nowrap">상태</TableHead>
                      <TableHead className="text-right">클릭률</TableHead>
                      <TableHead className="text-right">CPC</TableHead>
                      <TableHead className="text-right">비용</TableHead>
                      <TableHead className="text-right">평균순위</TableHead>
                      <TableHead className="text-right">입찰가</TableHead>
                      <TableHead className="text-right">품질지수</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedKeywords.map((keyword) => (
                      <TableRow key={keyword.nccKeywordId}>
                        <TableCell className="font-medium">
                          {keyword.keyword}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {won.format(keyword.stat.impCnt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {won.format(keyword.stat.clkCnt)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-medium whitespace-nowrap",
                            KEYWORD_STATE_CLASS[keywordState(keyword).tone]
                          )}
                        >
                          {keywordState(keyword).label}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(keyword.stat.ctr)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {won.format(keyword.stat.cpc)}원
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {won.format(keyword.stat.salesAmt)}원
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {keyword.stat.avgRnk > 0 ? keyword.stat.avgRnk : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {won.format(keyword.bidAmt)}원
                          {keyword.useGroupBidAmt ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (그룹)
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {keyword.nccQi?.qiGrade ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
