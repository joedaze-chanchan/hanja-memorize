import { HANJA, HANJA_ORDER, LEVELS, STROKE_WIDTH, hunEum, codeOf, listByLevel } from "./hanja.js";
import { LetterTracer } from "./tracer.js";
import { radiusMarginFor } from "./pad.js";
import { ProgressStore, SettingsStore, DEFAULT_SETTINGS, BestScoreStore, BoardStore, MemoryStore } from "./progress.js";
import { setupMemorize } from "./memorize.js";
import { setupExam } from "./exam.js";
import { ProfileStore, scopedStorage, ResumeStore, AVATARS, MAX_NAME_LENGTH } from "./profiles.js";

const COLORS = {
  outline: "#b9b3a6",
  outlineFill: "#fbfaf6",
  demo: "#3b82f6",
  user: "#22c55e",
  wrong: "#ef4444",
  startDot: "#3b82f6",
};

const DEMO_SPEED = 80; // 초당 진행 거리 (좌표 단위)
const DEMO_PAUSE = 260; // 획 사이 멈춤 (ms)
const WRONG_FLASH = 550; // 오답 빨간 표시 시간 (ms)
const MAX_WRONG_STREAK = 3;

const HINTS = {
  watch: "시범을 잘 보세요",
  trace: "파란 점에서 시작해 따라 써 보세요",
  good: "좋아요! 다음 획",
  start: "파란 점에서 시작하세요",
  off: "선 밖으로 나갔어요. 획을 따라 그리세요",
  short: "끝까지 그리세요",
  replay: "시범을 다시 보여 줄게요",
};

const REPEAT_CHOICES = [1, 2, 3, 4, 5];
const ROUND_PAUSE = 1100;

const $ = (id) => document.getElementById(id);
const els = {
  main: $("main"),
  home: $("home"),
  memo: $("memo"),
  exam: $("exam"),
  practice: $("practice"),
  menuTraceProgress: $("menu-trace-progress"),
  menuMemoProgress: $("menu-memo-progress"),
  menuExamBest: $("menu-exam-best"),
  levelTabs: $("level-tabs"),
  grid: $("hanja-grid"),
  resetBtn: $("reset-btn"),
  backBtn: $("back-btn"),
  demoBtn: $("demo-btn"),
  dots: $("stroke-dots"),
  canvas: $("canvas"),
  hint: $("hint"),
  done: $("done"),
  doneText: $("done-text"),
  againBtn: $("again-btn"),
  nextBtn: $("next-btn"),
  roundLabel: $("round-label"),
  infoHanja: $("info-hanja"),
  infoHunEum: $("info-huneum"),
  infoSub: $("info-sub"),
  speakBtn: $("speak-btn"),
  settings: $("settings"),
  settingsBtn: $("settings-btn"),
  settingsRepeat: $("settings-repeat"),
  repeatOptions: $("repeat-options"),
  settingsSave: $("settings-save"),
  profile: $("profile"),
  profileList: $("profile-list"),
  profileForm: $("profile-form"),
  avatarGrid: $("avatar-grid"),
  profileName: $("profile-name"),
  profileCancel: $("profile-cancel"),
  profileSave: $("profile-save"),
  profileChip: $("profile-chip"),
  chipAvatar: $("chip-avatar"),
  chipName: $("chip-name"),
  resumePractice: $("resume-practice"),
  resumePracticeText: $("resume-practice-text"),
  resumePracticeBtn: $("resume-practice-btn"),
};

// ---------- 참여자 ----------
// 모든 기록(학습, 설정, 외우기, 시험 점수, 이어하기)은 참여자별 저장소에 따로 담긴다.
const profileStore = new ProfileStore();
let profile = null;
let store = null;
let settingsStore = null;
let memoryStore = null;
let memoBestStore = null;
let examBestStore = null;
let resumeStore = null;
let settings = null; // null이면 이 참여자의 첫 실행

function useProfile(p) {
  profile = p;
  const scoped = scopedStorage(p.id);
  store = new ProgressStore(scoped);
  settingsStore = new SettingsStore(scoped);
  memoryStore = new MemoryStore(scoped);
  memoBestStore = new BestScoreStore(scopedStorage(`${p.id}-memo`));
  examBestStore = new BestScoreStore(scopedStorage(`${p.id}-exam`));
  resumeStore = new ResumeStore(scoped);
  settings = settingsStore.load();
}
const ctx = els.canvas.getContext("2d");

const state = {
  level: LEVELS[0].key, // 한자 고르기 화면의 급수 탭
  letter: null, // 연습 중인 한자
  lt: null,
  paths: [],
  strokeIndex: 0,
  mode: "idle", // idle | demo | trace | wrong | done
  liveProgress: 0,
  liveColor: COLORS.user,
  demoProgress: null,
  wrongStreak: 0,
  wrongsTotal: 0,
  replayPending: false,
  round: 1,
  demoToken: 0,
  raf: 0,
};

// ---------- 설정 (따라 쓰기 횟수) ----------

let pendingRepeat = DEFAULT_SETTINGS.repeat;

function openSettings() {
  pendingRepeat = settings ? settings.repeat : DEFAULT_SETTINGS.repeat;
  els.repeatOptions.innerHTML = "";
  for (const n of REPEAT_CHOICES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "repeat-opt" + (n === pendingRepeat ? " selected" : "");
    b.textContent = String(n);
    b.addEventListener("click", () => {
      pendingRepeat = n;
      for (const el of els.repeatOptions.children) el.classList.toggle("selected", Number(el.textContent) === n);
    });
    els.repeatOptions.appendChild(b);
  }
  els.settingsSave.textContent = settings ? "저장" : "시작하기";
  els.settings.hidden = false;
}

function saveSettings() {
  settings = { ...DEFAULT_SETTINGS, ...(settings || {}), repeat: pendingRepeat };
  settingsStore.save(settings);
  els.settings.hidden = true;
  renderMain();
}

// ---------- 발음 ----------

// 훈음 읽기: 미리 만든 mp3(audio/<코드>.mp3)를 먼저 재생하고, 없으면 한국어 음성 합성으로 대신한다.
let audioEl = null;
let currentUtterance = null;

export function speak(ch) {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
  }
  audioEl.pause();
  audioEl.onerror = () => speakWithTTS(ch);
  audioEl.src = `audio/${codeOf(ch)}.mp3`;
  const p = audioEl.play();
  if (p && typeof p.catch === "function") p.catch(() => speakWithTTS(ch));
}

function speakWithTTS(ch) {
  if (!("speechSynthesis" in window)) return;
  const h = HANJA[ch];
  try {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(`${h.hun} ${h.eum}. ${h.hun} ${h.eum}. ${h.wordKo}.`);
    u.lang = "ko-KR";
    const voice = synth.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("ko"));
    if (voice) u.voice = voice;
    u.rate = 0.85;
    currentUtterance = u;
    setTimeout(() => synth.speak(u), 60);
  } catch {
    // 음성 미지원 브라우저는 무시
  }
}

function renderInfo(ch) {
  const h = HANJA[ch];
  const level = LEVELS.find((l) => l.key === h.level);
  els.infoHanja.textContent = ch;
  els.infoHunEum.textContent = hunEum(ch);
  els.infoSub.innerHTML = `${level.label} · <b>${h.strokes.length}획</b> · <span class="hanja">${h.word}</span> ${h.wordKo}`;
}

function renderRound() {
  els.roundLabel.textContent = `${state.round}/${settings.repeat}번째 · ${Math.min(state.strokeIndex + 1, state.paths.length)}/${state.paths.length}획`;
}

// ---------- 화면 전환 ----------

// profile(참여자) | main(대문) | home(한자 고르기) | practice | memo | exam
function showScreen(name) {
  for (const key of ["profile", "main", "home", "practice", "memo", "exam"]) els[key].hidden = key !== name;
}

// ---------- 참여자 화면 ----------

let pendingAvatar = AVATARS[0];

function profileStat(p) {
  const prog = new ProgressStore(scopedStorage(p.id));
  const mem = new MemoryStore(scopedStorage(p.id));
  const done = HANJA_ORDER.filter((ch) => prog.get(ch).completed).length;
  const mastered = mem.countMastered(HANJA_ORDER);
  if (done === 0 && mastered === 0) return "새로 시작";
  return `★ ${done} · 외움 ${mastered}`;
}

function renderProfileList() {
  els.profileList.innerHTML = "";
  for (const p of profileStore.list()) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "profile-card";
    card.innerHTML = `<span class="avatar">${p.avatar}</span><span class="name">${escapeHtml(p.name)}</span><span class="stat">${profileStat(p)}</span>`;
    card.addEventListener("click", () => enterProfile(p));
    const rm = document.createElement("span");
    rm.className = "remove";
    rm.textContent = "✕";
    rm.setAttribute("role", "button");
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`${p.name}의 기록을 모두 지우고 삭제할까요?`)) {
        profileStore.remove(p.id);
        renderProfileList();
      }
    });
    card.appendChild(rm);
    els.profileList.appendChild(card);
  }
  const add = document.createElement("button");
  add.type = "button";
  add.className = "profile-card new";
  add.innerHTML = `<span class="avatar">＋</span><span class="name">새 친구 만들기</span>`;
  add.addEventListener("click", openProfileForm);
  els.profileList.appendChild(add);
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function showProfileScreen() {
  cancelDemo();
  cancelAnimationFrame(state.raf);
  state.mode = "idle";
  els.profileForm.hidden = true;
  els.profileList.hidden = false;
  renderProfileList();
  showScreen("profile");
}

function openProfileForm() {
  pendingAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  els.avatarGrid.innerHTML = "";
  for (const a of AVATARS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "avatar-opt" + (a === pendingAvatar ? " selected" : "");
    b.textContent = a;
    b.addEventListener("click", () => {
      pendingAvatar = a;
      for (const el of els.avatarGrid.children) el.classList.toggle("selected", el.textContent === a);
    });
    els.avatarGrid.appendChild(b);
  }
  els.profileName.value = "";
  els.profileName.maxLength = MAX_NAME_LENGTH;
  els.profileList.hidden = true;
  els.profileForm.hidden = false;
  setTimeout(() => els.profileName.focus(), 50);
}

function saveProfileForm() {
  const name = els.profileName.value.trim();
  if (!name) {
    els.profileName.focus();
    els.profileName.placeholder = "이름을 적어 주세요!";
    return;
  }
  const p = profileStore.create(name, pendingAvatar);
  enterProfile(p);
}

function enterProfile(p) {
  profileStore.select(p.id);
  useProfile(p);
  showMain();
  if (!settings) openSettings();
}

function renderMain() {
  if (profile) {
    els.chipAvatar.textContent = profile.avatar;
    els.chipName.textContent = profile.name;
  }
  els.settingsRepeat.textContent = String(settings ? settings.repeat : DEFAULT_SETTINGS.repeat);
  const done = HANJA_ORDER.filter((ch) => store.get(ch).completed).length;
  els.menuTraceProgress.textContent = done > 0 ? `★ ${done}/${HANJA_ORDER.length}` : "";
  const mastered = memoryStore.countMastered(HANJA_ORDER);
  els.menuMemoProgress.textContent = mastered > 0 ? `외움 ${mastered}/${HANJA_ORDER.length}` : "";
  const best = Math.max(0, ...["all", ...LEVELS.map((l) => l.key)].map((k) => examBestStore.get(k)));
  els.menuExamBest.textContent = best > 0 ? `최고 ${best}점` : "";
}

function showMain() {
  savePracticeProgress();
  cancelDemo();
  cancelAnimationFrame(state.raf);
  state.mode = "idle";
  renderMain();
  showScreen("main");
}

// ---------- 한자 고르기 ----------

function renderLevelTabs() {
  els.levelTabs.innerHTML = "";
  for (const l of LEVELS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "level-tab" + (l.key === state.level ? " selected" : "");
    const chars = listByLevel(l.key);
    const done = chars.filter((ch) => store.get(ch).completed).length;
    b.innerHTML = `${l.label}<small>★ ${done}/${chars.length}</small>`;
    b.addEventListener("click", () => {
      state.level = l.key;
      renderLevelTabs();
      renderGrid();
    });
    els.levelTabs.appendChild(b);
  }
}

function renderGrid() {
  els.grid.innerHTML = "";
  for (const ch of listByLevel(state.level)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hanja-btn";
    btn.innerHTML = `<span class="ch hanja">${ch}</span><span class="rd">${hunEum(ch)}</span>`;
    if (store.get(ch).completed) {
      btn.classList.add("completed");
      const star = document.createElement("span");
      star.className = "star";
      star.textContent = "★";
      btn.appendChild(star);
    }
    btn.addEventListener("click", () => openLetter(ch));
    els.grid.appendChild(btn);
  }
}

function renderResumeBanner() {
  const r = resumeStore.get("practice");
  if (!r || !HANJA[r.letter] || store.get(r.letter).completed) {
    els.resumePractice.hidden = true;
    return;
  }
  const strokeCount = HANJA[r.letter].strokes.length;
  const part = r.strokeIndex > 0 ? ` · ${r.strokeIndex + 1}획째부터` : "";
  els.resumePracticeText.textContent = `${r.letter}(${hunEum(r.letter)}) 쓰던 중이에요 (${r.round}번째${part}, 총 ${strokeCount}획)`;
  els.resumePractice.hidden = false;
}

function showHome() {
  savePracticeProgress();
  cancelDemo();
  cancelAnimationFrame(state.raf);
  state.mode = "idle";
  if (state.letter) state.level = HANJA[state.letter].level;
  renderLevelTabs();
  renderGrid();
  renderResumeBanner();
  showScreen("home");
}

function savePracticeProgress() {
  if (!resumeStore || !state.letter || els.practice.hidden) return;
  if (state.mode === "idle") return;
  const strokeIndex = state.lt ? state.lt.index : 0;
  if (state.mode === "done" && strokeIndex >= state.paths.length && state.round >= settings.repeat) return;
  resumeStore.set("practice", { letter: state.letter, round: state.round, strokeIndex, wrongsTotal: state.wrongsTotal });
}

// ---------- 연습 ----------

function openLetter(letter, resume = null) {
  state.letter = letter;
  state.wrongStreak = 0;
  state.wrongsTotal = resume ? resume.wrongsTotal || 0 : 0;
  state.round = resume ? Math.max(1, Math.min(resume.round || 1, settings.repeat)) : 1;
  resetStrokes();
  els.done.hidden = true;
  showScreen("practice");
  renderInfo(letter);
  renderRound();
  speak(letter);
  resizeCanvas();
  renderDots();
  startLoop();
  if (resume && (resume.round > 1 || resume.strokeIndex > 0)) {
    const skip = Math.min(resume.strokeIndex || 0, state.paths.length - 1);
    state.lt.skipTo(skip);
    state.mode = "trace";
    beginTrace();
    setHint(`${state.round}번째, ${skip + 1}획째부터 이어서 써 볼까요`, "ok");
    savePracticeProgress();
    return;
  }
  setHint(HINTS.watch);
  savePracticeProgress();
  runDemo().then((finished) => {
    if (finished) beginTrace();
  });
}

function resetStrokes() {
  const padPx = els.canvas.getBoundingClientRect().width;
  state.lt = new LetterTracer(HANJA[state.letter], STROKE_WIDTH, { radiusMargin: radiusMarginFor(padPx) });
  state.paths = state.lt.paths;
  state.strokeIndex = 0;
  state.liveProgress = 0;
}

function beginTrace() {
  state.mode = "trace";
  state.lt.startStroke();
  state.paths = state.lt.paths;
  state.strokeIndex = state.lt.index;
  state.liveProgress = 0;
  state.liveColor = COLORS.user;
  renderDots();
  renderRound();
  setHint(HINTS.trace);
}

function setHint(text, kind = "") {
  els.hint.textContent = text;
  els.hint.className = "hint " + kind;
}

function renderDots() {
  els.dots.innerHTML = "";
  state.paths.forEach((_, i) => {
    const d = document.createElement("span");
    d.className = "dot";
    if (i < state.strokeIndex) d.classList.add("filled");
    else if (i === state.strokeIndex && state.mode === "trace") d.classList.add("current");
    els.dots.appendChild(d);
  });
}

// ---------- 시범 ----------

function cancelDemo() {
  state.demoToken++;
  state.demoProgress = null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runDemo() {
  cancelDemo();
  const token = state.demoToken;
  state.mode = "demo";
  renderDots();
  setHint(HINTS.watch);
  for (let i = 0; i < state.paths.length; i++) {
    const total = pathLength(HANJA[state.letter].strokes[i]);
    const duration = Math.max(180, (total / DEMO_SPEED) * 1000);
    const startAt = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        if (token !== state.demoToken) return resolve();
        const t = Math.min(1, (now - startAt) / duration);
        state.demoProgress = { index: i, t };
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    if (token !== state.demoToken) return false;
    await sleep(DEMO_PAUSE);
    if (token !== state.demoToken) return false;
  }
  await sleep(400);
  if (token !== state.demoToken) return false;
  state.demoProgress = null;
  return true;
}

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return len;
}

// ---------- 터치 ----------

function toLetterCoords(e) {
  const rect = els.canvas.getBoundingClientRect();
  return [((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100];
}

let pointerId = null;

function onPointerDown(e) {
  if (pointerId !== null) return;
  if (state.mode === "wrong" && !state.replayPending) beginTrace();
  if (state.mode !== "trace") return;
  e.preventDefault();
  pointerId = e.pointerId;
  try {
    els.canvas.setPointerCapture(pointerId);
  } catch {
    // 합성 이벤트 등
  }
  const [x, y] = toLetterCoords(e);
  const r = state.lt.begin(x, y);
  state.paths = state.lt.paths;
  if (!r.ok) {
    releasePointer();
    fail(r.reason, 0);
    return;
  }
  state.liveProgress = r.progress;
  state.liveColor = COLORS.user;
}

function onPointerMove(e) {
  if (state.mode !== "trace" || e.pointerId !== pointerId) return;
  e.preventDefault();
  const events = typeof e.getCoalescedEvents === "function" && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e];
  for (const ev of events) {
    const [x, y] = toLetterCoords(ev);
    const r = state.lt.moveTo(x, y);
    state.paths = state.lt.paths;
    state.strokeIndex = state.lt.index;
    if (!r.ok) {
      releasePointer();
      fail(r.reason, r.progress);
      return;
    }
    state.liveProgress = r.progress;
  }
}

function onPointerCancel(e) {
  if (e.pointerId !== pointerId) return;
  releasePointer();
  if (state.mode !== "trace") return;
  state.lt.cancel();
  state.paths = state.lt.paths;
  state.strokeIndex = state.lt.index;
  state.liveProgress = 0;
}

function onPointerUp(e) {
  if (state.mode !== "trace" || e.pointerId !== pointerId) return;
  e.preventDefault();
  releasePointer();
  const [ux, uy] = toLetterCoords(e);
  const r = state.lt.end(ux, uy);
  state.paths = state.lt.paths;
  state.strokeIndex = state.lt.index;
  if (!r.ok) {
    fail(r.reason, r.progress);
    return;
  }
  if (r.letterDone) {
    finishLetter();
    return;
  }
  succeed(r.strokeDone);
}

function releasePointer() {
  if (pointerId !== null) {
    try {
      els.canvas.releasePointerCapture(pointerId);
    } catch {
      // 이미 해제됨
    }
  }
  pointerId = null;
}

async function fail(reason, progress) {
  state.mode = "wrong";
  state.wrongStreak++;
  state.wrongsTotal++;
  state.liveProgress = progress;
  state.liveColor = COLORS.wrong;
  state.replayPending = state.wrongStreak >= MAX_WRONG_STREAK;
  setHint(HINTS[reason] || HINTS.off, "bad");
  await sleep(WRONG_FLASH);
  if (state.mode !== "wrong") return;
  state.liveProgress = 0;
  if (state.replayPending) {
    state.replayPending = false;
    state.wrongStreak = 0;
    setHint(HINTS.replay, "bad");
    await sleep(600);
    if (state.mode !== "wrong") return;
    const finished = await runDemo();
    if (!finished) return;
  }
  beginTrace();
}

function succeed(strokeDone) {
  state.wrongStreak = 0;
  state.liveProgress = 0;
  beginTrace();
  if (strokeDone) setHint(HINTS.good, "ok");
  savePracticeProgress();
}

async function finishLetter() {
  state.mode = "done";
  state.liveProgress = 0;
  renderDots();
  renderRound();
  store.recordAttempt(state.letter, state.wrongsTotal);
  if (state.round < settings.repeat) {
    const nextRound = state.round + 1;
    setHint(`잘했어요! ${nextRound}번째 써 볼까요`, "ok");
    const letter = state.letter;
    await sleep(ROUND_PAUSE);
    if (state.mode !== "done" || state.letter !== letter) return;
    state.round = nextRound;
    resetStrokes();
    renderRound();
    beginTrace();
    savePracticeProgress();
    return;
  }
  store.markCompleted(state.letter);
  resumeStore.clear("practice");
  setHint("완성!", "ok");
  const idx = HANJA_ORDER.indexOf(state.letter);
  const hasNext = idx < HANJA_ORDER.length - 1;
  const times = settings.repeat > 1 ? `${settings.repeat}번 다 썼어요. ` : "";
  const name = `${state.letter} (${hunEum(state.letter)})`;
  els.doneText.textContent = state.wrongsTotal === 0 ? `${name} 완성! ${times}한 번도 안 틀렸어요` : `${name} 완성! ${times}틀린 횟수 ${state.wrongsTotal}번`;
  els.nextBtn.textContent = hasNext ? "다음 한자" : "홈으로";
  els.done.hidden = false;
}

// ---------- 렌더링 ----------

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const size = Math.round(rect.width * dpr);
  if (els.canvas.width !== size || els.canvas.height !== size) {
    els.canvas.width = size;
    els.canvas.height = size;
  }
}

function strokePath(path, t, width, color) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  let started = false;
  for (const p of path) {
    if (p.t > t + 1e-9) break;
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else ctx.lineTo(p.x, p.y);
  }
  if (started && t <= 0.001) ctx.lineTo(path[0].x + 0.01, path[0].y);
  ctx.stroke();
}

// 연습 판 바탕: 한자 공책처럼 가운데 십자 점선
function drawGuide() {
  ctx.save();
  ctx.strokeStyle = "#e9e4d6";
  ctx.lineWidth = 0.6;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(50, 2);
  ctx.lineTo(50, 98);
  ctx.moveTo(2, 50);
  ctx.lineTo(98, 50);
  ctx.stroke();
  ctx.restore();
}

function render(now) {
  const size = els.canvas.width;
  const k = size / 100;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, 100, 100);
  drawGuide();

  for (const path of state.paths) strokePath(path, 1, STROKE_WIDTH + 3, COLORS.outline);
  for (const path of state.paths) strokePath(path, 1, STROKE_WIDTH, COLORS.outlineFill);

  if (state.demoProgress) {
    const { index, t } = state.demoProgress;
    for (let i = 0; i < index; i++) strokePath(state.paths[i], 1, STROKE_WIDTH, COLORS.demo);
    strokePath(state.paths[index], t, STROKE_WIDTH, COLORS.demo);
    return;
  }

  for (let i = 0; i < state.strokeIndex; i++) strokePath(state.paths[i], 1, STROKE_WIDTH, COLORS.user);

  if ((state.mode === "trace" || state.mode === "wrong") && state.liveProgress > 0 && state.strokeIndex < state.paths.length) {
    strokePath(state.paths[state.strokeIndex], state.liveProgress, STROKE_WIDTH, state.liveColor);
  }

  if (state.mode === "trace" && pointerId === null && state.strokeIndex < state.paths.length) {
    const p0 = state.paths[state.strokeIndex][0];
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, 3 + pulse * 2, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.startDot;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, 3 + pulse * 2 + 2.5, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.startDot;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function startLoop() {
  cancelAnimationFrame(state.raf);
  const loop = (now) => {
    render(now);
    state.raf = requestAnimationFrame(loop);
  };
  state.raf = requestAnimationFrame(loop);
}

// ---------- 이벤트 ----------

els.canvas.addEventListener("pointerdown", onPointerDown);
els.canvas.addEventListener("pointermove", onPointerMove);
els.canvas.addEventListener("pointerup", onPointerUp);
els.canvas.addEventListener("pointercancel", onPointerCancel);
els.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

els.backBtn.addEventListener("click", showHome);
els.demoBtn.addEventListener("click", () => {
  if (state.mode === "done" || state.mode === "idle") return;
  releasePointer();
  state.liveProgress = 0;
  runDemo().then((finished) => {
    if (finished) beginTrace();
  });
});
els.againBtn.addEventListener("click", () => openLetter(state.letter));
els.nextBtn.addEventListener("click", () => {
  const idx = HANJA_ORDER.indexOf(state.letter);
  if (idx < HANJA_ORDER.length - 1) openLetter(HANJA_ORDER[idx + 1]);
  else showHome();
});
els.speakBtn.addEventListener("click", () => speak(state.letter));
els.settingsBtn.addEventListener("click", openSettings);
els.settingsSave.addEventListener("click", saveSettings);
els.resetBtn.addEventListener("click", () => {
  if (confirm("따라쓰기·외우기 기록을 모두 지울까요?")) {
    store.reset();
    memoryStore.reset();
    renderMain();
  }
});

const memo = setupMemorize({
  onExit: showMain,
  memoryStore: { record: (ch, w) => memoryStore.record(ch, w), countMastered: (list) => memoryStore.countMastered(list) },
  bestStore: { get: (l) => memoBestStore.get(l), update: (l, sc) => memoBestStore.update(l, sc) },
  resume: { get: () => resumeStore.get("memo"), set: (d) => resumeStore.set("memo", d), clear: () => resumeStore.clear("memo") },
  speak,
});
const examBoard = new BoardStore("hanja-exam-board"); // 참여자 공통 기록판
const exam = setupExam({
  onExit: showMain,
  bestStore: { get: (l) => examBestStore.get(l), update: (l, sc) => examBestStore.update(l, sc) },
  board: examBoard,
  profile: () => profile,
  speak,
});

els.profileChip.addEventListener("click", showProfileScreen);
els.profileSave.addEventListener("click", saveProfileForm);
els.profileName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveProfileForm();
});
els.profileCancel.addEventListener("click", () => {
  els.profileForm.hidden = true;
  els.profileList.hidden = false;
  if (profileStore.list().length === 0) openProfileForm();
});
els.resumePracticeBtn.addEventListener("click", () => {
  const r = resumeStore.get("practice");
  if (r && HANJA[r.letter]) openLetter(r.letter, r);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) savePracticeProgress();
});
window.addEventListener("pagehide", savePracticeProgress);
for (const btn of document.querySelectorAll("[data-go]")) {
  btn.addEventListener("click", () => {
    const go = btn.dataset.go;
    if (go === "home") showHome();
    else if (go === "main") showMain();
    else if (go === "memo") {
      showScreen("memo");
      memo.showMenu();
    } else if (go === "exam") {
      showScreen("exam");
      exam.showMenu();
    } else showScreen(go);
  });
}
window.addEventListener("resize", () => {
  if (!els.practice.hidden) resizeCanvas();
});

// 시작: 참여자가 있으면 바로 대문, 없으면 참여자 만들기부터
const startProfile = profileStore.current();
if (startProfile) {
  useProfile(startProfile);
  renderMain();
  showScreen("main");
  if (!settings) openSettings();
} else {
  showProfileScreen();
  if (profileStore.list().length === 0) openProfileForm();
}
