"use client"

import { useState, type ReactNode } from "react"

import { AdGroupDetail } from "@/components/adgroup-detail"
import { AdGroupTable } from "@/components/adgroup-table"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { PowerLinkAdGroup } from "@/lib/naver-ad"
import { cn } from "@/lib/utils"

interface Props {
  adgroups: PowerLinkAdGroup[]
  /** 카드 헤더에 넣을 캠페인 정보 (서버에서 그려 넘긴다) */
  header?: ReactNode
  cardClassName?: string
  contentClassName?: string
  tableMaxHeight?: string
  stickyHeader?: boolean
  date?: string
  usdKrw?: number
}

/**
 * 광고그룹 표 카드와, 선택한 광고그룹의 상세를 위아래로 나눠 그린다.
 * 상세를 표 카드 밖으로 뺐기 때문에 카드 높이나 내부 스크롤에 갇히지 않는다.
 */
export function AdGroupSection({
  adgroups,
  header,
  cardClassName,
  contentClassName,
  tableMaxHeight,
  stickyHeader,
  date,
  usdKrw,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected =
    adgroups.find((group) => group.nccAdgroupId === selectedId) ?? null

  return (
    <div className="space-y-4">
      <Card className={cardClassName}>
        {header ? <CardHeader>{header}</CardHeader> : null}
        <CardContent className={cn(contentClassName)}>
          {adgroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              광고그룹이 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              <AdGroupTable
                adgroups={adgroups}
                tableMaxHeight={tableMaxHeight}
                stickyHeader={stickyHeader}
                date={date}
                usdKrw={usdKrw}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              {!selected ? (
                <p className="text-xs text-muted-foreground">
                  광고그룹 행을 클릭하면 아래에 키워드와 소재가 표시됩니다.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <AdGroupDetail
          nccAdgroupId={selected.nccAdgroupId}
          name={selected.name}
          date={date}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  )
}
