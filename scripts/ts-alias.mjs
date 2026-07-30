import { registerHooks } from "node:module"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/**
 * `node --import ./scripts/ts-alias.mjs <script.ts>` 로 쓴다.
 *
 * Node 24 는 .ts 를 그대로 실행하지만 tsconfig 의 `@/*` 별칭과 확장자 없는 import 는
 * 모른다. 번들러 없이 lib/chain 코드를 돌려 보려고 두 가지만 얹는다.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function withTsExtension(path) {
  if (existsSync(path)) return path
  for (const candidate of [`${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) {
    if (existsSync(candidate)) return candidate
  }
  return path
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = withTsExtension(resolve(ROOT, specifier.slice(2)))
      return { url: pathToFileURL(target).href, shortCircuit: true }
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const target = withTsExtension(
        resolve(dirname(fileURLToPath(context.parentURL)), specifier)
      )
      return { url: pathToFileURL(target).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
