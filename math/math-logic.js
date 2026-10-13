// 수학 4지선다 시험의 문제 만들기·보기 만들기·채점. 화면과 무관한 순수 로직.
//
// 문제 수준은 초등 1~2학년(8살) 연산 학습지 기준:
//   덧셈 가로셈(7+3, 14+9, 16+11) → 두 자리 세로셈(26+15, 87+58) → 세 자리 세로셈(279+216, 774+656)
//   뺄셈 가로셈(17-8, 23-15)       → 두 자리 세로셈(72-16, 83-79) → 세 자리 세로셈(473-127, 305-107)

export const QUIZ_COUNT = 50;
export const DEFAULT_MINUTES = 25; // 50문제 × 30초
export const MINUTE_OPTIONS = [20, 25, 30];
export const RETRY_SECONDS_PER_Q = 40; // 틀린 문제 다시 풀기: 문제당 시간

export const KIDS = [
  { id: "yuchan", name: "조유찬", avatar: "🦖" },
  { id: "inchan", name: "조인찬", avatar: "🚀" },
];

const randInt = (lo, hi, rand) => lo + Math.floor(rand() * (hi - lo + 1));

// 문제 종류. layout: "h"(가로셈) | "v"(세로셈)
export const KINDS = {
  // 한 자리 + 한 자리, 두 자리 + 한 자리, 작은 두 자리 + 두 자리 (가로셈)
  addEasy: {
    op: "+",
    layout: "h",
    make(rand) {
      const t = randInt(0, 2, rand);
      if (t === 0) {
        const a = randInt(2, 9, rand);
        return [a, randInt(Math.max(2, 10 - a), 9, rand)]; // 7+3, 9+4처럼 10을 넘기는 덧셈
      }
      if (t === 1) return [randInt(11, 29, rand), randInt(2, 9, rand)];
      return [randInt(11, 29, rand), randInt(10, 19, rand)];
    },
  },
  // 두 자리 + 한·두 자리 (세로셈, 받아올림 포함)
  add2: {
    op: "+",
    layout: "v",
    make(rand) {
      const a = randInt(10, 99, rand);
      const b = rand() < 0.25 ? randInt(5, 9, rand) : randInt(10, 99, rand);
      return [a, b];
    },
  },
  // 세 자리 + 두·세 자리 (세로셈)
  add3: {
    op: "+",
    layout: "v",
    make(rand) {
      const a = randInt(100, 799, rand);
      const b = rand() < 0.3 ? randInt(20, 99, rand) : randInt(100, 699, rand);
      return [a, b];
    },
  },
  // 10~29에서 빼기 (가로셈)
  subEasy: {
    op: "-",
    layout: "h",
    make(rand) {
      const a = randInt(10, 29, rand);
      const b = randInt(2, a - 1, rand);
      return [a, b];
    },
  },
  // 두 자리 - 한·두 자리 (세로셈, 받아내림 포함)
  sub2: {
    op: "-",
    layout: "v",
    make(rand) {
      const a = randInt(12, 99, rand);
      const b = rand() < 0.25 ? randInt(2, 9, rand) : randInt(10, a - 1, rand);
      return [a, Math.min(b, a - 1)];
    },
  },
  // 세 자리 - 두·세 자리 (세로셈)
  sub3: {
    op: "-",
    layout: "v",
    make(rand) {
      const a = randInt(110, 999, rand);
      const b = rand() < 0.3 ? randInt(10, 99, rand) : randInt(100, a - 10, rand);
      return [a, b];
    },
  },
};

// 50문제 구성 (학습지처럼 쉬운 것 → 어려운 것, 덧셈 → 뺄셈)
export const PLAN = [
  ["addEasy", 4],
  ["add2", 11],
  ["add3", 10],
  ["subEasy", 4],
  ["sub2", 11],
  ["sub3", 10],
];

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function solve(a, op, b) {
  return op === "+" ? a + b : a - b;
}

// 자리마다 따로 계산하고 받아올림/받아내림을 빼먹은 값 (아이들이 자주 하는 실수)
export function slipAnswer(a, op, b) {
  const da = String(a).split("").reverse();
  const db = String(b).split("").reverse();
  const n = Math.max(da.length, db.length);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = Number(da[i] || 0);
    const y = Number(db[i] || 0);
    out = (op === "+" ? (x + y) % 10 : Math.abs(x - y)) + out;
  }
  return Number(out);
}

// 정답 + 그럴듯한 오답 3개를 섞은 4지선다 보기
export function makeChoices(a, op, b, rand = Math.random) {
  const ans = solve(a, op, b);
  const picked = [];
  const add = (v) => {
    if (Number.isInteger(v) && v >= 1 && v !== ans && !picked.includes(v) && picked.length < 3) picked.push(v);
  };
  add(slipAnswer(a, op, b));
  const near = [1, -1, 10, -10, 2, -2, 9, -9, 11, -11];
  if (ans >= 100) near.push(100, -100);
  for (const d of shuffle(near, rand)) add(ans + d);
  // 혹시 모자라면 (아주 작은 답) 차례로 채운다
  for (let d = 3; picked.length < 3; d++) add(ans + d);
  return shuffle([ans, ...picked], rand);
}

export function makeProblem(kind, rand = Math.random) {
  const k = KINDS[kind];
  const [a, b] = k.make(rand);
  return { kind, a, op: k.op, b, layout: k.layout, answer: solve(a, k.op, b), choices: makeChoices(a, k.op, b, rand) };
}

// 시험 한 번의 문제 목록. 같은 식이 두 번 나오지 않는다.
export function makeQuiz(rand = Math.random, plan = PLAN) {
  const seen = new Set();
  const list = [];
  for (const [kind, count] of plan) {
    for (let i = 0; i < count; i++) {
      let p;
      let tries = 0;
      do {
        p = makeProblem(kind, rand);
      } while (seen.has(`${p.a}${p.op}${p.b}`) && ++tries < 50);
      seen.add(`${p.a}${p.op}${p.b}`);
      list.push(p);
    }
  }
  return list;
}

// 틀린 문제 다시 풀기용: 같은 식, 보기 순서만 새로 섞는다
export function remakeProblems(problems, rand = Math.random) {
  return problems.map((p) => ({ ...p, choices: shuffle(p.choices, rand) }));
}

// answers[i]: 고른 값 또는 null(안 풂)
export function grade(problems, answers) {
  const items = problems.map((p, i) => {
    const picked = answers[i] ?? null;
    return { ...p, no: i + 1, picked, correct: picked === p.answer };
  });
  const correct = items.filter((x) => x.correct).length;
  const total = problems.length;
  return { items, correct, total, score: total ? Math.round((correct / total) * 100) : 0 };
}

export function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function cheer(score) {
  if (score === 100) return "만점! 최고예요! 🏆";
  if (score >= 90) return "아주 잘했어요! 🌟";
  if (score >= 70) return "잘했어요! 👍";
  if (score >= 50) return "조금만 더 힘내요! 💪";
  return "틀린 문제를 다시 풀어 봐요! 📚";
}

// 아이별 기록. localStorage "math-quiz-history" = { [kidId]: [기록, ...] } (최신이 앞)
const KEY_HISTORY = "math-quiz-history";
const MAX_RECORDS = 30;

export class HistoryStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  loadAll() {
    try {
      const raw = this.storage && this.storage.getItem(KEY_HISTORY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  list(kidId) {
    const v = this.loadAll()[kidId];
    return Array.isArray(v) ? v : [];
  }

  add(kidId, record) {
    const all = this.loadAll();
    const list = Array.isArray(all[kidId]) ? all[kidId] : [];
    const rec = { id: `r${Date.now().toString(36)}`, date: new Date().toISOString(), ...record };
    all[kidId] = [rec, ...list].slice(0, MAX_RECORDS);
    try {
      this.storage && this.storage.setItem(KEY_HISTORY, JSON.stringify(all));
    } catch {
      // 저장 실패는 무시
    }
    return rec;
  }

  get(kidId, id) {
    return this.list(kidId).find((r) => r.id === id) || null;
  }

  clear(kidId) {
    const all = this.loadAll();
    delete all[kidId];
    try {
      this.storage && this.storage.setItem(KEY_HISTORY, JSON.stringify(all));
    } catch {
      // 무시
    }
  }
}

// 진행 중인 시험 (새로고침해도 이어서, 시간은 계속 흐른다). localStorage "math-quiz-session"
const KEY_SESSION = "math-quiz-session";

export const SessionStore = {
  load(storage = globalThis.localStorage) {
    try {
      const raw = storage && storage.getItem(KEY_SESSION);
      const s = raw ? JSON.parse(raw) : null;
      return s && Array.isArray(s.problems) && Array.isArray(s.answers) ? s : null;
    } catch {
      return null;
    }
  },
  save(session, storage = globalThis.localStorage) {
    try {
      storage && storage.setItem(KEY_SESSION, JSON.stringify(session));
    } catch {
      // 무시
    }
  },
  clear(storage = globalThis.localStorage) {
    try {
      storage && storage.removeItem(KEY_SESSION);
    } catch {
      // 무시
    }
  },
};
