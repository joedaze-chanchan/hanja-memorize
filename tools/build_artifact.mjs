// 앱 전체를 HTML 한 파일로 묶는다 (Claude 아티팩트 등 정적 파일 하나만 올릴 수 있는 곳용).
// 사용: node tools/build_artifact.mjs  → dist/hanja-app.html
//
// - ES 모듈들을 의존 순서대로 각각 IIFE로 감싸 하나의 일반 스크립트로 합친다 (import/export 문을 고쳐 쓴다).
// - style.css는 <style>로, audio/*.mp3는 base64 data URI로 넣는다.
// - 아티팩트 규칙에 맞춰 <!doctype>, <html>, <head>, <body> 태그는 넣지 않는다.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf-8");

// 의존 순서 (앞의 것이 뒤의 것에 필요)
const MODULES = ["strokes", "hanja", "tracer", "pad", "progress", "profiles", "sfx", "quiz-logic", "memorize", "exam", "app"];
const varOf = (name) => "__m_" + name.replace(/-/g, "_");

function bundleModule(name) {
  let src = read(`${name}.js`);
  const exports = new Set();
  // import { a, b as c } from "./x.js";  →  const { a, b: c } = __m_x;
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*"\.\/([\w-]+)\.js";\s*$/gm, (_, names, mod) => {
    const list = names
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\s+as\s+/, ": "))
      .join(", ");
    return `const { ${list} } = ${varOf(mod)};`;
  });
  // import * as sfx from "./sfx.js";  →  const sfx = __m_sfx;
  src = src.replace(/^import\s*\*\s*as\s+(\w+)\s+from\s*"\.\/([\w-]+)\.js";\s*$/gm, (_, alias, mod) => `const ${alias} = ${varOf(mod)};`);
  // export const/let/function/class NAME  →  선언만 남기고 이름을 기록
  src = src.replace(/^export\s+(const|let|var|function|class|async function)\s+(\w+)/gm, (_, kind, id) => {
    exports.add(id);
    return `${kind} ${id}`;
  });
  // export { A, B };  →  이름만 기록
  src = src.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, names) => {
    for (const n of names.split(",").map((s) => s.trim()).filter(Boolean)) exports.add(n);
    return "";
  });
  if (/^\s*(import|export)\b/m.test(src)) throw new Error(`${name}.js: 처리 못 한 import/export가 남아 있음`);
  return `const ${varOf(name)} = (() => {\n${src}\nreturn { ${[...exports].join(", ")} };\n})();`;
}

function audioMap() {
  const dir = join(ROOT, "audio");
  const out = {};
  let bytes = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mp3")) continue;
    const buf = readFileSync(join(dir, f));
    bytes += buf.length;
    out[f.replace(/\.mp3$/, "")] = "data:audio/mpeg;base64," + buf.toString("base64");
  }
  return { map: out, bytes };
}

const html = read("index.html");
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/\s*<script type="module" src="app.js"><\/script>\s*/, "\n");
const css = read("style.css");
const { map, bytes } = audioMap();

let script = MODULES.map(bundleModule).join("\n\n");
// 발음: 파일 대신 data URI
script = script.replace("audioEl.src = `audio/${codeOf(ch)}.mp3`;", "audioEl.src = __AUDIO[codeOf(ch)] || `audio/${codeOf(ch)}.mp3`;");
if (!script.includes("__AUDIO[")) throw new Error("발음 경로 치환 실패");

const page = `<title>한자 배우기</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700&display=swap" />
<style>
${css}
</style>
${body}
<script>
"use strict";
const __AUDIO = ${JSON.stringify(map)};
${script}
</script>
`;

mkdirSync(join(ROOT, "dist"), { recursive: true });
const out = join(ROOT, "dist", "hanja-app.html");
writeFileSync(out, page, "utf-8");
console.log(`dist/hanja-app.html: ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB (mp3 ${Object.keys(map).length}개, ${(bytes / 1024).toFixed(0)} KB)`);
