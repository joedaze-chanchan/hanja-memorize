import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { HANJA, HANJA_ORDER, LEVELS, LEVEL_ORDER, listByLevel, hunEum, codeOf, STROKE_WIDTH } from "../hanja.js";
import { buildPath, LetterTracer, FINISH_ZONE } from "../tracer.js";

test("8급 50자, 7급Ⅱ 50자, 총 100자이며 중복이 없다", () => {
  assert.deepEqual(LEVEL_ORDER, ["8", "7-2"]);
  assert.equal(listByLevel("8").length, 50);
  assert.equal(listByLevel("7-2").length, 50);
  assert.equal(HANJA_ORDER.length, 100);
  assert.equal(new Set(HANJA_ORDER).size, 100);
  assert.equal(listByLevel("all").length, 100);
  for (const l of LEVELS) assert.ok(l.label && l.desc);
});

test("모든 한자에 훈·음·예시 단어·획 데이터·발음 mp3가 있다", () => {
  for (const ch of HANJA_ORDER) {
    const h = HANJA[ch];
    for (const k of ["hun", "eum", "word", "wordKo"]) assert.ok(h[k], `${ch}.${k}`);
    assert.ok(h.word.includes(ch), `${ch} 예시 단어 ${h.word}에 그 한자가 들어 있어야 함`);
    assert.ok(h.strokes.length >= 1, `${ch} 획 없음`);
    assert.ok(existsSync(new URL(`../audio/${codeOf(ch)}.mp3`, import.meta.url)), `${ch} mp3`);
  }
});

test("획 데이터: 모든 획이 점 2개 이상, 좌표 0~100 안", () => {
  for (const ch of HANJA_ORDER) {
    for (const [i, s] of HANJA[ch].strokes.entries()) {
      assert.ok(s.length >= 2, `${ch} ${i}획 점 수`);
      for (const [x, y] of s) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${ch} ${i}획 (${x},${y})`);
    }
  }
});

test("획 수가 상식과 맞는다 (一 1획, 學 16획, 韓 17획)", () => {
  assert.equal(HANJA["一"].strokes.length, 1);
  assert.equal(HANJA["學"].strokes.length, 16);
  assert.equal(HANJA["韓"].strokes.length, 17);
});

test("훈음 표기와 코드", () => {
  assert.equal(hunEum("校"), "학교 교");
  assert.equal(codeOf("校"), "6821");
});

test("모든 한자를 중심선대로 따라 쓰면 정답이 된다", () => {
  for (const ch of HANJA_ORDER) {
    const lt = new LetterTracer(HANJA[ch], STROKE_WIDTH);
    for (const stroke of HANJA[ch].strokes) {
      const pts = buildPath(stroke, 1.5).map((p) => [p.x, p.y]);
      const b = lt.begin(pts[0][0], pts[0][1]);
      assert.ok(b.ok, `${ch} 시작 ${b.reason}`);
      for (let i = 1; i < pts.length - 1; i++) {
        const r = lt.moveTo(pts[i][0], pts[i][1]);
        assert.ok(r.ok, `${ch} 이동 ${r.reason}`);
      }
      const e = lt.end(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      assert.ok(e.ok, `${ch} 끝 ${e.reason} ${e.progress}`);
    }
    assert.ok(lt.done, `${ch} 완료 안 됨`);
  }
  assert.ok(FINISH_ZONE < 1);
});
