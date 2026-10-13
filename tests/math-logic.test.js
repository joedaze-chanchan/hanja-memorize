import { test } from "node:test";
import assert from "node:assert/strict";
import { makeQuiz, makeChoices, slipAnswer, solve, grade, formatTime, HistoryStore, QUIZ_COUNT, PLAN, KIDS } from "../math/math-logic.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("한 번에 50문제, 같은 식은 겹치지 않는다", () => {
  assert.equal(PLAN.reduce((s, [, n]) => s + n, 0), QUIZ_COUNT);
  for (let r = 0; r < 50; r++) {
    const q = makeQuiz();
    assert.equal(q.length, QUIZ_COUNT);
    assert.equal(new Set(q.map((p) => `${p.a}${p.op}${p.b}`)).size, QUIZ_COUNT);
  }
});

test("답은 0 이상, 뺄셈은 큰 수에서 작은 수를 뺀다", () => {
  for (let r = 0; r < 200; r++) {
    for (const p of makeQuiz()) {
      assert.equal(p.answer, solve(p.a, p.op, p.b));
      assert.ok(p.answer >= 1, `${p.a}${p.op}${p.b}`);
      assert.ok(p.a <= 999 && p.b <= 999);
    }
  }
});

test("보기는 정답을 포함한 서로 다른 1 이상의 수 4개", () => {
  for (let r = 0; r < 200; r++) {
    for (const p of makeQuiz()) {
      assert.equal(p.choices.length, 4);
      assert.ok(p.choices.includes(p.answer));
      assert.equal(new Set(p.choices).size, 4);
      assert.ok(p.choices.every((c) => Number.isInteger(c) && c >= 1));
    }
  }
  // 아주 작은 답도 보기 4개
  const c = makeChoices(2, "-", 1);
  assert.equal(new Set(c).size, 4);
});

test("받아올림·받아내림을 빼먹은 실수 답", () => {
  assert.equal(slipAnswer(26, "+", 15), 31); // 정답 41
  assert.equal(slipAnswer(72, "-", 16), 64); // 정답 56
  assert.equal(slipAnswer(305, "-", 107), 202); // 정답 198
  assert.equal(slipAnswer(774, "+", 656), 320); // 정답 1430, 자리마다 %10: 3·2·0
});

test("채점: 안 푼 문제는 틀린 것으로 센다", () => {
  const q = makeQuiz().slice(0, 4);
  const answers = [q[0].answer, q[1].choices.find((c) => c !== q[1].answer), null, q[3].answer];
  const g = grade(q, answers);
  assert.equal(g.correct, 2);
  assert.equal(g.total, 4);
  assert.equal(g.score, 50);
  assert.deepEqual(g.items.filter((x) => !x.correct).map((x) => x.no), [2, 3]);
});

test("시간 표시", () => {
  assert.equal(formatTime(1500), "25:00");
  assert.equal(formatTime(59.2), "1:00");
  assert.equal(formatTime(-3), "0:00");
});

test("기록은 아이별로 따로 저장된다", () => {
  const h = new HistoryStore(memStorage());
  h.add(KIDS[0].id, { correct: 45, total: 50, score: 90 });
  h.add(KIDS[0].id, { correct: 50, total: 50, score: 100 });
  h.add(KIDS[1].id, { correct: 40, total: 50, score: 80 });
  assert.equal(h.list(KIDS[0].id).length, 2);
  assert.equal(h.list(KIDS[0].id)[0].score, 100);
  assert.equal(h.list(KIDS[1].id).length, 1);
  const rec = h.list(KIDS[1].id)[0];
  assert.equal(h.get(KIDS[1].id, rec.id).score, 80);
});
