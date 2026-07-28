/**
 * OAuth 클라이언트 ID 와 시크릿이 서로 짝이 맞는지 확인한다.
 *
 *   node scripts/check-oauth-client.mjs <client_id> <client_secret>
 *
 * 일부러 잘못된 grant 를 보내 구글의 반응만 본다.
 *   invalid_grant  → 클라이언트 인증은 통과 (짝이 맞음)
 *   invalid_client → 클라이언트 인증 실패 (짝이 안 맞음)
 * 실제 로그인이나 토큰 발급은 일어나지 않는다.
 */
const [, , clientId, clientSecret] = process.argv

if (!clientId || !clientSecret) {
  console.error(
    "사용법: node scripts/check-oauth-client.mjs <client_id> <client_secret>"
  )
  process.exit(1)
}

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId.trim(),
    client_secret: clientSecret.trim(),
    // 존재할 수 없는 값. 클라이언트 인증 단계만 확인하기 위한 것이다.
    refresh_token: "1//0-not-a-real-token",
    grant_type: "refresh_token",
  }),
})

const body = await response.json().catch(() => ({}))

console.log(`클라이언트: ${clientId.trim().split(".")[0]}`)
console.log(
  `구글 응답 : ${body.error ?? "-"} — ${body.error_description ?? "-"}`
)
console.log()

if (body.error === "invalid_grant") {
  console.log("✅ ID 와 시크릿의 짝이 맞습니다.")
  process.exit(0)
}

if (body.error === "invalid_client") {
  console.log("❌ 짝이 맞지 않습니다.")
  console.log(
    "   구글 클라우드 콘솔 > 사용자 인증 정보 에서 해당 클라이언트를 열어\n" +
      "   시크릿을 다시 복사하거나, 새로 만들어 사용하세요."
  )
  process.exit(1)
}

console.log("판정할 수 없는 응답입니다. 위 메시지를 확인하세요.")
process.exit(1)
