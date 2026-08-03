/**
 * 애드센스 최초 1회 인증 스크립트.
 *
 *   npm run adsense:auth
 *
 * 브라우저에서 구글 계정 동의를 마치면 refresh token 을 받아
 * .env 에 ADSENSE_REFRESH_TOKEN 으로 저장한다.
 */
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const PORT = 5813;
const REDIRECT_URI = `http://localhost:${PORT}`;
// 애드센스(수익) · GA4(페이지별 지표) 를 읽고, 스프레드시트에는 쓴다.
//
// refresh token 은 발급받던 순간의 스코프를 그대로 들고 다닌다.
// 콘솔에서 API 를 켜거나 동의 화면에 스코프를 추가해도 기존 토큰은 그대로다.
// 여기를 고쳤으면 반드시 인증을 다시 받아야 한다.
const SCOPE = [
  "https://www.googleapis.com/auth/adsense.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

function loadClient() {
  const explicit = process.env.GOOGLE_OAUTH_CLIENT_FILE;
  const path =
    explicit ??
    (() => {
      const found = readdirSync(ROOT).find(
        (n) => n.startsWith("client_secret") && n.endsWith(".json"),
      );
      return found ? join(ROOT, found) : null;
    })();

  if (!path) {
    console.error(
      "client_secret*.json 을 찾을 수 없습니다. 프로젝트 루트에 두거나 GOOGLE_OAUTH_CLIENT_FILE 을 설정하세요.",
    );
    process.exit(1);
  }

  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const config = parsed.installed ?? parsed.web;
  if (!config?.client_id || !config?.client_secret) {
    console.error(`OAuth 클라이언트 JSON 형식이 올바르지 않습니다: ${path}`);
    process.exit(1);
  }
  return { path, clientId: config.client_id, clientSecret: config.client_secret };
}

const { path: clientPath, clientId, clientSecret } = loadClient();

const consentUrl =
  "https://accounts.google.com/o/oauth2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  }).toString();

console.log(`OAuth 클라이언트: ${clientPath}`);
console.log(`\n아래 주소가 브라우저에서 열립니다. 열리지 않으면 직접 붙여넣으세요:\n`);
console.log(consentUrl);
console.log(`\n리디렉션 URI 로 ${REDIRECT_URI} 가 등록되어 있어야 합니다.`);
console.log(
  "  → Google Cloud Console > API 및 서비스 > 사용자 인증 정보 > 해당 OAuth 클라이언트 > 승인된 리디렉션 URI\n",
);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (error) {
    res.end(`<h1>인증 실패</h1><p>${error}</p>`);
    console.error("인증 실패:", error);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.end("<p>code 파라미터가 없습니다.</p>");
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const body = await tokenRes.json();

    if (!tokenRes.ok || !body.refresh_token) {
      res.end(
        `<h1>토큰 교환 실패</h1><pre>${JSON.stringify(body, null, 2)}</pre>`,
      );
      console.error("토큰 교환 실패:", body);
      server.close();
      process.exit(1);
    }

    const envPath = join(ROOT, ".env");
    const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    const line = `ADSENSE_REFRESH_TOKEN=${body.refresh_token}`;
    const next = /^ADSENSE_REFRESH_TOKEN=.*$/m.test(current)
      ? current.replace(/^ADSENSE_REFRESH_TOKEN=.*$/m, line)
      : `${current.replace(/\n*$/, "")}\n${line}\n`;
    writeFileSync(envPath, next);

    res.end(
      "<h1>인증 완료</h1><p>.env 에 ADSENSE_REFRESH_TOKEN 을 저장했습니다. 이 창은 닫아도 됩니다.</p>",
    );
    console.log("\n인증 완료. .env 에 ADSENSE_REFRESH_TOKEN 을 저장했습니다.");
    console.log("dev 서버를 재시작한 뒤 /adsense 로 접속하세요.");
    server.close();
    process.exit(0);
  } catch (e) {
    res.end(`<h1>오류</h1><pre>${String(e)}</pre>`);
    console.error(e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`콜백 대기 중: ${REDIRECT_URI}`);
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  spawn(opener, [consentUrl], { stdio: "ignore", detached: true }).unref();
});
