import { test } from "node:test";
import assert from "node:assert/strict";
import { makeChoices, poolFor, memorizeOrder, examQuestions, examScore, examPassed, EXAM_COUNT, PHASES, shuffle } from "../quiz-logic.js";
import { HANJA, hunEum, listByLevel } from "../hanja.js";
import { BoardStore, MemoryStore } from "../progress.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("외우기는 세 단계: 훈음 고르기 → 따라 쓰기 → 한자 고르기", () => {
  assert.deepEqual(
    PHASES.map((p) => p.key),
    ["meaning", "write", "hanja"],
  );
});

test("4지선다 보기는 정답을 포함한 서로 다른 4개이고 훈음이 겹치지 않는다", () => {
  const pool = poolFor("8");
  for (const ch of pool) {
    const c = makeChoices(ch, pool);
    assert.equal(c.length, 4);
    assert.ok(c.includes(ch));
    assert.equal(new Set(c).size, 4);
    assert.equal(new Set(c.map(hunEum)).size, 4, `${ch}: ${c.map(hunEum)}`);
  }
});

test("보기는 같은 급수 글자에서만 뽑는다", () => {
  const pool = poolFor("7-2");
  for (let i = 0; i < 30; i++) {
    for (const ch of makeChoices(pool[i % pool.length], pool)) assert.equal(HANJA[ch].level, "7-2");
  }
});

test("외우기 순서는 급수의 모든 글자를 한 번씩 섞어 담는다", () => {
  const order = memorizeOrder("8");
  assert.equal(order.length, 50);
  assert.deepEqual([...order].sort(), [...listByLevel("8")].sort());
  assert.equal(memorizeOrder("all").length, 100);
});

test("shuffle은 원본을 바꾸지 않고 같은 원소를 돌려준다", () => {
  const a = [1, 2, 3, 4, 5];
  const b = shuffle(a, () => 0.3);
  assert.deepEqual(a, [1, 2, 3, 4, 5]);
  assert.deepEqual([...b].sort(), a);
});

test("시험 문제 20개: 글자가 겹치지 않고 방향이 번갈아 나오며 보기에 정답이 있다", () => {
  const qs = examQuestions("8");
  assert.equal(qs.length, EXAM_COUNT);
  assert.equal(new Set(qs.map((q) => q.ch)).size, EXAM_COUNT);
  qs.forEach((q, i) => {
    assert.equal(q.dir, i % 2 === 0 ? "meaning" : "hanja");
    assert.ok(q.choices.includes(q.ch));
    assert.equal(q.choices.length, 4);
    assert.equal(HANJA[q.ch].level, "8");
  });
});

test("시험 점수: 문제당 5점, 70점 이상 합격", () => {
  assert.equal(examScore(20), 100);
  assert.equal(examScore(13), 65);
  assert.ok(examPassed(14));
  assert.ok(!examPassed(13));
});

test("MemoryStore: 틀린 적 없이 한 바퀴 돌면 외운 것으로 표시", () => {
  const m = new MemoryStore(memStorage());
  assert.equal(m.get("校").mastered, false);
  m.record("校", 2);
  assert.equal(m.get("校").rounds, 1);
  assert.equal(m.get("校").mastered, false);
  m.record("校", 0);
  assert.equal(m.get("校").mastered, true);
  assert.equal(m.get("校").rounds, 2);
  assert.equal(m.countMastered(["校", "門"]), 1);
  m.reset();
  assert.equal(m.get("校").rounds, 0);
});

test("기록판: 점수 순 정렬과 순위", () => {
  const b = new BoardStore("t", memStorage());
  assert.equal(b.add({ name: "a", score: 50 }), 1);
  assert.equal(b.add({ name: "b", score: 80 }), 1);
  assert.equal(b.add({ name: "c", score: 50 }), 3);
  assert.deepEqual(
    b.top(3).map((e) => e.name),
    ["b", "a", "c"],
  );
});
