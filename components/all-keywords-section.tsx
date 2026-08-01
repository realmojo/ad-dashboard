import { AllKeywordsCard } from "@/components/all-keywords-card"
import { loadAllKeywords } from "@/lib/all-keywords-cache"

/** 첫 화면 값은 서버에서 받아 넘기고, 이후 갱신은 카드가 직접 한다. */
export async function AllKeywordsSection() {
  const { keywords, error, fetchedAt } = await loadAllKeywords()
  return (
    <AllKeywordsCard keywords={keywords} error={error} fetchedAt={fetchedAt} />
  )
}
