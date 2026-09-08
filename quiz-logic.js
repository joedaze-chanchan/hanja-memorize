// 외우기·시험의 문제 만들기와 점수 계산. 화면과 무관한 순수 로직.

import { HANJA, listByLevel, hunEum } from "./hanja.js";

// 한 글자를 세 단계로 연달아 다루는 순서 (외우기)
export const PHASES = [
  { key: "meaning", label: "훈음 고르기" }, // 한자를 보고 훈음 고르기
  { key: "write", label: "따라 쓰기" }, // 획순대로 따라 쓰기
  { key: "hanja", label: "한자 고르기" }, // 훈음을 보고 한자 고르기
];

export const SCORE_FIRST = 10; // 한 번에 맞힘
export const SCORE_RETRY = 5; // 틀린 뒤 맞힘
export const SCORE_WRITE = 10; // 따라 쓰기 완료

export const EXAM_COUNT = 20;
export const EXAM_SCORE_PER_Q = 5; // 20문제 × 5점 = 100점
export const EXAM_PASS = 70;

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 정답 한 글자 + 오답 n개를 섞어 4지선다 보기(한자 목록)를 만든다.
// 오답은 훈음이 정답과 겹치지 않는 글자만 고른다 (예: 日·一은 둘 다 음이 '일'이지만 훈이 달라 허용).
export function makeChoices(answer, pool, n = 3, rand = Math.random) {
  const others = pool.filter((ch) => ch !== answer && hunEum(ch) !== hunEum(answer));
  const picked = [];
  const copy = [...others];
  while (picked.length < n && copy.length > 0) {
    const i = Math.floor(rand() * copy.length);
    const ch = copy.splice(i, 1)[0];
    if (!picked.some((p) => hunEum(p) === hunEum(ch))) picked.push(ch);
  }
  return shuffle([answer, ...picked], rand);
}

// 보기를 뽑을 글자 풀: 같은 급수. 급수 글자가 부족하면 전체.
export function poolFor(level) {
  const list = listByLevel(level);
  return list.length >= 4 ? list : listByLevel("all");
}

// 외우기 한 판의 글자 순서
export function memorizeOrder(level, rand = Math.random) {
  return shuffle(listByLevel(level), rand);
}

// 시험 문제 목록. dir: "meaning"(한자→훈음) | "hanja"(훈음→한자) 번갈아.
export function examQuestions(level, count = EXAM_COUNT, rand = Math.random) {
  const pool = poolFor(level);
  const all = shuffle(listByLevel(level), rand);
  const picked = [];
  while (picked.length < count && all.length > 0) picked.push(...all.splice(0, Math.min(count - picked.length, all.length)));
  // 글자 수가 문제 수보다 적으면 반복해서 채운다
  while (picked.length < count && pool.length > 0) picked.push(pool[Math.floor(rand() * pool.length)]);
  return picked.map((ch, i) => ({ ch, dir: i % 2 === 0 ? "meaning" : "hanja", choices: makeChoices(ch, pool, 3, rand) }));
}

export function examScore(correct) {
  return correct * EXAM_SCORE_PER_Q;
}

export function examPassed(correct, total = EXAM_COUNT) {
  return examScore(correct) >= (EXAM_PASS * total) / EXAM_COUNT;
}

export { HANJA };
