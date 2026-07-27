import { defineCloudflareConfig } from "@opennextjs/cloudflare"

/**
 * Cloudflare Workers 배포 설정.
 *
 * 이 대시보드는 모든 페이지가 force-dynamic 이라 ISR 캐시를 쓰지 않는다.
 * fetch 의 next.revalidate(환율 5분 등)는 요청 단위로만 동작하며,
 * 인스턴스 간 공유 캐시가 필요해지면 여기에 R2/KV 캐시를 붙이면 된다.
 */
export default defineCloudflareConfig()
