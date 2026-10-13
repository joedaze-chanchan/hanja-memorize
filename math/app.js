// 수학 4지선다 시험 화면: 아이 고르기 → 준비(시간·지난 기록) → 50문제 풀기(옆에 시간 기둥) → 결과(틀린 문제만 보기·다시 풀기)

import {
  KIDS, DEFAULT_MINUTES, MINUTE_OPTIONS, RETRY_SECONDS_PER_Q,
  makeQuiz, remakeProblems, grade, formatTime, cheer, HistoryStore, SessionStore,
} from "./math-logic.js";
import { unlock, success } from "../sfx.js";

const $ = (id) => document.getElementById(id);
const history = new HistoryStore();
const KEY_MINUTES = "math-quiz-minutes";
const MARKS = ["①", "②", "③", "④"];

let kid = null; // 지금 고른 아이
let session = null; // 진행 중인 시험
let timerId = null;
let shown = null; // 결과 화면에 보이는 { kidId, record }
let filter = "wrong";
const warned = new Set();

function show(id) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id;
  window.scrollTo(0, 0);
}

const kidById = (id) => KIDS.find((k) => k.id === id) || null;

function minutes() {
  const m = Number(localStorage.getItem(KEY_MINUTES));
  return MINUTE_OPTIONS.includes(m) ? m : DEFAULT_MINUTES;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const opSign = (op) => (op === "-" ? "−" : "+");

// 식 그리기: 가로셈 "7 + 3 =" 또는 세로셈
function exprHtml(p) {
  if (p.layout === "h") return `<div class="expr-h">${p.a} ${opSign(p.op)} ${p.b} =</div>`;
  return `<div class="expr-v"><span class="op"></span><span class="n">${p.a}</span><span class="op">${opSign(p.op)}</span><span class="n">${p.b}</span><span class="bar"></span></div>`;
}

function dateText(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ---------- 처음: 누가 풀까요? ---------- */
function renderHome() {
  const list = $("kid-list");
  list.innerHTML = "";
  for (const k of KIDS) {
    const recs = history.list(k.id).filter((r) => r.mode !== "retry");
    const last = recs[0];
    const best = recs.reduce((m, r) => Math.max(m, r.score), -1);
    const info = last ? `지난번 ${last.score}점 · 최고 ${best}점` : "아직 기록이 없어요";
    const b = el("button", "kid-btn", `<span class="avatar">${k.avatar}</span><span class="kid-text"><b>${k.name}</b><small>${info}</small></span>`);
    b.type = "button";
    b.onclick = () => openReady(k.id);
    list.append(b);
  }
  show("home");
}

/* ---------- 준비: 시간 고르기 · 지난 기록 ---------- */
function openReady(kidId) {
  kid = kidById(kidId);
  $("ready-avatar").textContent = kid.avatar;
  $("ready-name").textContent = kid.name;
  renderTimePick();
  renderRecords();
  show("ready");
}

function renderTimePick() {
  const box = $("time-pick");
  box.innerHTML = "";
  for (const m of MINUTE_OPTIONS) {
    const b = el("button", "time-chip" + (m === minutes() ? " active" : ""), `⏰ ${m}분`);
    b.type = "button";
    b.onclick = () => {
      localStorage.setItem(KEY_MINUTES, String(m));
      renderTimePick();
    };
    box.append(b);
  }
}

function renderRecords() {
  const box = $("record-list");
  box.innerHTML = "";
  const recs = history.list(kid.id);
  if (!recs.length) {
    box.append(el("div", "empty", "아직 푼 기록이 없어요. 시작해 볼까요?"));
    return;
  }
  for (const r of recs) {
    const wrong = r.total - r.correct;
    const tag = r.mode === "retry" ? '<span class="r-tag">다시 풀기</span>' : "";
    const b = el(
      "button",
      "record",
      `<span class="r-score">${r.score}점</span>
       <span class="r-text"><b>${dateText(r.date)}${tag}</b><span class="muted">${r.correct}/${r.total} 맞음 · ${formatTime(r.usedSec)} 걸림${r.timeUp ? " · 시간 끝" : ""}</span></span>
       <span class="r-wrong">${wrong ? `틀린 문제 ${wrong}개 ›` : "만점 ›"}</span>`,
    );
    b.type = "button";
    b.onclick = () => openResult(kid.id, r);
    box.append(b);
  }
}

/* ---------- 문제 풀기 ---------- */
function startQuiz(problems, mode, limitSec) {
  const now = Date.now();
  session = { kidId: kid.id, mode, problems, answers: problems.map(() => null), startedAt: now, deadline: now + limitSec * 1000, limitSec };
  SessionStore.save(session);
  warned.clear();
  openQuiz();
}

function openQuiz() {
  kid = kidById(session.kidId);
  $("quiz-who").textContent = `${kid.avatar} ${kid.name}`;
  $("quiz-title").textContent = session.mode === "retry" ? `틀린 문제 다시 풀기 · ${session.problems.length}문제` : `수학 ${session.problems.length}문제`;
  $("total-count").textContent = session.problems.length;
  renderSheet();
  show("quiz");
  tick();
  clearInterval(timerId);
  timerId = setInterval(tick, 250);
}

function renderSheet() {
  const sheet = $("sheet");
  sheet.innerHTML = "";
  session.problems.forEach((p, i) => {
    const card = el("div", "q-card", `<div class="q-top"><span class="q-no">(${i + 1})</span><div class="q-body">${exprHtml(p)}</div></div>`);
    card.id = `q${i}`;
    const choices = el("div", "choices");
    p.choices.forEach((c, j) => {
      const b = el("button", "choice", `<span class="mark">${MARKS[j]}</span>${c}`);
      b.type = "button";
      b.onclick = () => pick(i, c);
      choices.append(b);
    });
    card.append(choices);
    sheet.append(card);
    paintCard(i);
  });
  updateCount();
}

function paintCard(i) {
  const card = $(`q${i}`);
  const picked = session.answers[i];
  card.classList.toggle("answered", picked !== null);
  const btns = card.querySelectorAll(".choice");
  session.problems[i].choices.forEach((c, j) => btns[j].classList.toggle("selected", c === picked));
}

function pick(i, value) {
  unlock();
  if (!session) return;
  session.answers[i] = session.answers[i] === value ? null : value; // 같은 보기를 다시 누르면 취소
  SessionStore.save(session);
  paintCard(i);
  updateCount();
}

function updateCount() {
  $("done-count").textContent = session.answers.filter((a) => a !== null).length;
}

function remainingSec() {
  return (session.deadline - Date.now()) / 1000;
}

function tick() {
  if (!session) return;
  const left = remainingSec();
  const ratio = Math.max(0, Math.min(1, left / session.limitSec));
  const rail = $("timer-rail");
  $("timer-text").textContent = formatTime(left);
  $("timer-fill").style.height = `${ratio * 100}%`;
  $("timer-runner").style.top = `${(1 - ratio) * 100}%`;
  rail.classList.toggle("mid", ratio <= 0.5 && ratio > 0.2);
  rail.classList.toggle("low", ratio <= 0.2);
  $("timer-icon").textContent = ratio > 0.5 ? "⏳" : ratio > 0.2 ? "⌛" : "⏰";
  for (const m of [5, 1]) {
    if (left <= m * 60 && left > m * 60 - 5 && session.limitSec > m * 60 && !warned.has(m)) {
      warned.add(m);
      toast(`⏰ ${m}분 남았어요!`);
    }
  }
  if (left <= 0) finish(true);
}

let toastTimer = null;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

function askSubmit() {
  unlock();
  const empty = session.answers.map((a, i) => (a === null ? i : -1)).filter((i) => i >= 0);
  if (empty.length) {
    modal({
      icon: "🤔",
      title: `아직 안 푼 문제가 ${empty.length}개 있어요`,
      text: "안 푼 문제는 틀린 것으로 채점돼요. 그래도 제출할까요?",
      ok: "제출하기",
      cancel: "안 푼 문제 풀기",
      onOk: () => finish(false),
      onCancel: () => goTo(empty[0]),
    });
  } else {
    modal({ icon: "✏️", title: "다 풀었어요! 제출할까요?", text: "제출하면 답을 바꿀 수 없어요.", ok: "제출하기", cancel: "다시 보기", onOk: () => finish(false) });
  }
}

function goTo(i) {
  const card = $(`q${i}`);
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.remove("flash");
  void card.offsetWidth;
  card.classList.add("flash");
}

// 제출 (timeUp: 시간이 끝나 저절로 제출)
function finish(timeUp) {
  if (!session) return;
  clearInterval(timerId);
  const s = session;
  session = null;
  SessionStore.clear();
  closeModal();
  const g = grade(s.problems, s.answers);
  const usedSec = Math.min(s.limitSec, Math.round((Date.now() - s.startedAt) / 1000));
  const record = history.add(s.kidId, {
    mode: s.mode,
    correct: g.correct,
    total: g.total,
    score: g.score,
    usedSec,
    limitSec: s.limitSec,
    timeUp,
    items: g.items.map(({ a, op, b, layout, answer, choices, picked }) => ({ a, op, b, layout, answer, choices, picked })),
  });
  kid = kidById(s.kidId);
  openResult(s.kidId, record);
  if (timeUp) modal({ icon: "⏰", title: "시간이 끝났어요!", text: "푼 데까지 자동으로 제출했어요.", ok: "결과 보기" });
  else success();
}

/* ---------- 결과 ---------- */
function openResult(kidId, record) {
  kid = kidById(kidId);
  shown = { kidId, record };
  const wrong = record.total - record.correct;
  $("result-score").textContent = record.score;
  $("result-cheer").textContent = cheer(record.score);
  $("result-detail").textContent = `${kid.avatar} ${kid.name} · ${record.total}문제 중 ${record.correct}개 맞음 · ${formatTime(record.usedSec)} 걸림`;
  const note = $("result-note");
  note.hidden = !record.timeUp;
  note.textContent = "⏰ 시간이 끝나서 자동으로 제출했어요";
  $("retry-btn").hidden = wrong === 0;
  $("retry-btn").textContent = `틀린 문제 ${wrong}개 다시 풀기`;
  $("tab-wrong").textContent = `틀린 문제만 (${wrong})`;
  $("tab-all").textContent = `전체 문제 (${record.total})`;
  setFilter(wrong ? "wrong" : "all");
  show("result");
}

function setFilter(f) {
  filter = f;
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.filter === f);
  renderReview();
}

function renderReview() {
  const box = $("review");
  box.innerHTML = "";
  const items = shown.record.items.map((it, i) => ({ ...it, no: i + 1, correct: it.picked === it.answer }));
  const list = filter === "wrong" ? items.filter((x) => !x.correct) : items;
  if (!list.length) {
    box.append(el("div", "empty", "틀린 문제가 없어요! 🎉"));
    return;
  }
  for (const it of list) {
    const card = el(
      "div",
      "r-card " + (it.correct ? "right" : "wrong"),
      `<div class="q-top"><span class="q-no">(${it.no})<span class="ox">${it.correct ? "⭕" : "❌"}</span></span><div class="q-body">${exprHtml(it)}</div></div>`,
    );
    const ans = el("div", "r-answers");
    if (it.correct) ans.innerHTML = `<span class="pill ok">정답<b>${it.answer}</b></span>`;
    else {
      ans.innerHTML =
        (it.picked === null ? `<span class="pill none">안 풀었어요</span>` : `<span class="pill mine">내 답<b>${it.picked}</b></span>`) +
        `<span class="pill ok">정답<b>${it.answer}</b></span>`;
    }
    card.append(ans);
    box.append(card);
  }
}

function retryWrong() {
  const wrong = shown.record.items.filter((it) => it.picked !== it.answer);
  if (!wrong.length) return;
  kid = kidById(shown.kidId);
  startQuiz(remakeProblems(wrong), "retry", Math.max(60, wrong.length * RETRY_SECONDS_PER_Q));
}

/* ---------- 알림 창 ---------- */
let modalHandlers = {};
function modal({ icon = "", title, text = "", ok = "확인", cancel = null, onOk = null, onCancel = null }) {
  $("modal-icon").textContent = icon;
  $("modal-title").textContent = title;
  $("modal-text").textContent = text;
  $("modal-ok").textContent = ok;
  $("modal-cancel").hidden = !cancel;
  if (cancel) $("modal-cancel").textContent = cancel;
  modalHandlers = { onOk, onCancel };
  $("modal").hidden = false;
}
function closeModal() {
  $("modal").hidden = true;
}
$("modal-ok").onclick = () => {
  const h = modalHandlers.onOk;
  closeModal();
  if (h) h();
};
$("modal-cancel").onclick = () => {
  const h = modalHandlers.onCancel;
  closeModal();
  if (h) h();
};

/* ---------- 버튼 연결 ---------- */
for (const b of document.querySelectorAll("[data-go=home]")) b.onclick = renderHome;
$("start-btn").onclick = () => {
  unlock();
  startQuiz(makeQuiz(), "full", minutes() * 60);
};
$("submit-btn").onclick = askSubmit;
$("rail-submit").onclick = askSubmit;
$("retry-btn").onclick = retryWrong;
$("home-btn").onclick = renderHome;
$("result-back").onclick = () => openReady(shown.kidId);
for (const t of document.querySelectorAll(".tab")) t.onclick = () => setFilter(t.dataset.filter);
document.addEventListener("visibilitychange", () => session && !document.hidden && tick());

/* ---------- 시작: 하던 시험이 있으면 이어서 (시간은 계속 흘렀다) ---------- */
const saved = SessionStore.load();
if (saved && kidById(saved.kidId)) {
  session = saved;
  kid = kidById(saved.kidId);
  if (remainingSec() > 0) openQuiz();
  else finish(true);
} else {
  SessionStore.clear();
  renderHome();
}
