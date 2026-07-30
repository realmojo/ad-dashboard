import { WriteConsole } from "@/components/write-console"
import { listJobs } from "@/lib/chain/store"
import { CHAIN_ORDER, SITE_DOMAIN } from "@/lib/chain/types"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "글 작성",
  description: "주제 하나로 4개 사이트 체인 글을 만들고 발행합니다.",
}

export default function WritePage() {
  // 목록은 서버에서 바로 읽어 넘긴다. 클라이언트가 마운트 직후 또 부를 필요가 없다.
  const initialJobs = listJobs()

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">글 작성</h1>
        <p className="text-sm text-muted-foreground">
          {[...CHAIN_ORDER]
            .reverse()
            .map((s) => SITE_DOMAIN[s])
            .join(" → ")}{" "}
          → 최종 공식 링크
        </p>
        <p className="text-xs text-muted-foreground">
          글은 역순으로 만들어집니다. 앞에서 만들어진 주소가 다음 글의 버튼이
          되기 때문입니다. 리서치부터 초안 업로드까지 3~8분 걸립니다.
        </p>
      </header>

      <WriteConsole initialJobs={initialJobs} />
    </main>
  )
}
