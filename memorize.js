// 한자 외우기: 급수를 골라 글자마다 세 단계(훈음 고르기 → 따라 쓰기 → 한자 고르기)를 돈다.
//
//   const memo = setupMemorize({ onExit, memoryStore, bestStore, resume, speak });
//   memo.showMenu();

import { HANJA, LEVELS, hunEum, listByLevel } from "./hanja.js";
import { PHASES, SCORE_FIRST, SCORE_RETRY, SCORE_WRITE, makeChoices, poolFor, memorizeOrder } from "./quiz-logic.js";
import { TracePad } from "./pad.js";
import * as sfx from "./sfx.js";

const LEVEL_CHOICES = [...LEVELS, { key: "all", label: "전체", desc: "8급과 7급Ⅱ 100자를 한꺼번에" }];
const NEXT_DELAY = 650; // 정답 표시 뒤 다음 단계로 넘어가기까지 (ms)

export function setupMemorize({ onExit, memoryStore, bestStore, resume, speak }) {
  const $ = (id) => document.getElementById(id);
  const els = {
    menu: $("memo-menu"),
    play: $("memo-play"),
    back: $("memo-back"),
    levelList: $("memo-level"),
    best: $("memo-best"),
    start: $("memo-start"),
    resumeBanner: $("memo-resume"),
    resumeText: $("memo-resume-text"),
    resumeBtn: $("memo-resume-btn"),
    count: $("memo-count"),
    phase: $("memo-phase"),
    score: $("memo-score"),
    pause: $("memo-pause"),
    q: $("memo-q"),
    big: $("memo-big"),
    opts: $("memo-opts"),
    write: $("memo-write"),
    strokes: $("memo-strokes"),
    padCanvas: $("memo-pad"),
    msg: $("memo-msg"),
    paused: $("memo-paused"),
    quit: $("mo-quit"),
    resumePlay: $("mo-resume"),
    over: $("memo-over"),
    overTitle: $("mo-title"),
    overScore: $("mo-score"),
    overMastered: $("mo-mastered"),
    overBest: $("mo-best"),
    overMenu: $("mo-menu"),
    overRetry: $("mo-retry"),
  };

  let level = LEVELS[0].key;
  let g = null; // 진행 중인 판
  let raf = 0;
  let locked = false;
  let timer = 0;

  const pad = new TracePad(els.padCanvas, {
    onLetterDone: () => writeDone(),
    onStrokeDone: () => renderStrokeCount(),
    onWrong: () => setMsg("획순대로, 파란 점에서 시작해 보세요", "bad"),
  });

  // ---------- 메뉴 ----------

  function showMenu() {
    stopLoop();
    g = null;
    els.play.hidden = true;
    els.menu.hidden = false;
    els.paused.hidden = true;
    els.over.hidden = true;
    renderLevels();
    renderResume();
  }

  function renderLevels() {
    els.levelList.innerHTML = "";
    for (const l of LEVEL_CHOICES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "diff-btn" + (l.key === level ? " selected" : "");
      const chars = listByLevel(l.key);
      const mastered = memoryStore.countMastered(chars);
      b.innerHTML = `<b>${l.label} <small>· 외운 한자 ${mastered}/${chars.length}</small></b><small>${l.desc}</small>`;
      b.addEventListener("click", () => {
        level = l.key;
        renderLevels();
      });
      els.levelList.appendChild(b);
    }
    const best = bestStore.get(level);
    els.best.textContent = best > 0 ? `${labelOf(level)} 최고 점수 ${best}점` : "아직 기록이 없어요";
  }

  function labelOf(key) {
    return (LEVEL_CHOICES.find((l) => l.key === key) || LEVEL_CHOICES[0]).label;
  }

  function renderResume() {
    const r = resume ? resume.get() : null;
    if (!r || !Array.isArray(r.order) || r.index >= r.order.length || !r.order.every((ch) => HANJA[ch])) {
      els.resumeBanner.hidden = true;
      return;
    }
    els.resumeText.textContent = `${labelOf(r.level)} · ${r.index + 1}/${r.order.length}번째 · ${r.score}점 → 이어서 하기`;
    els.resumeBanner.hidden = false;
  }

  // ---------- 진행 ----------

  function start(saved = null) {
    clearTimeout(timer);
    sfx.unlock();
    if (saved) level = saved.level;
    g = saved
      ? { level: saved.level, order: saved.order, index: saved.index, phase: saved.phase || 0, score: saved.score || 0, wrongs: saved.wrongs || 0, perfect: saved.perfect || 0, retried: false }
      : { level, order: memorizeOrder(level), index: 0, phase: 0, score: 0, wrongs: 0, perfect: 0, retried: false };
    if (!saved && resume) resume.clear();
    els.menu.hidden = true;
    els.play.hidden = false;
    els.paused.hidden = true;
    els.over.hidden = true;
    startLoop();
    showPhase();
  }

  function current() {
    return g.order[g.index];
  }

  function saveState() {
    if (!g || !resume) return;
    resume.set({ level: g.level, order: g.order, index: g.index, phase: g.phase, score: g.score, wrongs: g.wrongs, perfect: g.perfect });
  }

  function renderHud() {
    els.count.textContent = `${g.index + 1}/${g.order.length}`;
    els.score.textContent = `${g.score}점`;
    const p = PHASES[g.phase];
    els.phase.textContent = `${g.phase + 1} ${p.label}`;
    els.phase.className = "phase-chip" + (g.phase === 1 ? " p2" : g.phase === 2 ? " p3" : "");
  }

  function showPhase() {
    locked = false;
    g.retried = false;
    renderHud();
    const ch = current();
    const key = PHASES[g.phase].key;
    els.opts.innerHTML = "";
    els.opts.hidden = key === "write";
    els.write.hidden = key !== "write";
    els.big.className = "memo-big";
    if (key === "meaning") {
      els.q.textContent = "이 한자의 훈과 음은?";
      els.big.innerHTML = `<span class="hanja">${ch}</span>`;
      for (const c of makeChoices(ch, poolFor(g.level))) addChoice(hunEum(c), c === ch, false);
      setMsg("맞는 훈음을 골라 보세요");
    } else if (key === "write") {
      els.q.textContent = "획순대로 따라 써 보세요";
      els.big.className = "memo-big reading";
      els.big.innerHTML = `${hunEum(ch)} <span class="sm hanja">${ch}</span>`;
      pad.resize();
      pad.setLetter(ch);
      pad.enabled = true;
      renderStrokeCount();
      setMsg("파란 점에서 시작해요");
      speak(ch);
    } else {
      els.q.textContent = "어느 한자일까요?";
      els.big.className = "memo-big reading";
      els.big.textContent = hunEum(ch);
      for (const c of makeChoices(ch, poolFor(g.level))) addChoice(c, c === ch, true);
      setMsg("맞는 한자를 골라 보세요");
    }
  }

  function addChoice(text, correct, isHanja) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quiz-opt" + (isHanja ? " hanja" : "");
    b.textContent = text;
    b.addEventListener("click", () => answer(correct, b));
    els.opts.appendChild(b);
  }

  function answer(correct, btn) {
    if (locked || !g) return;
    if (!correct) {
      btn.classList.add("wrong");
      btn.disabled = true;
      g.wrongs += 1;
      g.retried = true;
      setMsg("아니에요. 다시 골라 보세요!", "bad");
      return;
    }
    locked = true;
    btn.classList.add("right");
    for (const el of els.opts.children) el.disabled = true;
    const gain = g.retried ? SCORE_RETRY : SCORE_FIRST;
    g.score += gain;
    renderHud();
    sfx.success();
    setMsg(`정답! +${gain}점`, "ok");
    if (PHASES[g.phase].key === "meaning") speak(current());
    timer = setTimeout(nextPhase, NEXT_DELAY);
  }

  function renderStrokeCount() {
    if (!pad.lt) return;
    els.strokes.textContent = `${Math.min(pad.strokeIndex + 1, pad.paths.length)} / ${pad.paths.length}획`;
  }

  function writeDone() {
    if (!g) return;
    g.score += SCORE_WRITE;
    renderHud();
    sfx.success();
    setMsg(`다 썼어요! +${SCORE_WRITE}점`, "ok");
    timer = setTimeout(nextPhase, NEXT_DELAY);
  }

  function nextPhase() {
    if (!g) return;
    if (g.phase < PHASES.length - 1) {
      g.phase += 1;
      saveState();
      showPhase();
      return;
    }
    // 한 글자의 세 단계를 다 마침
    const ch = current();
    memoryStore.record(ch, g.wrongs);
    if (g.wrongs === 0) g.perfect += 1;
    g.wrongs = 0;
    g.phase = 0;
    g.index += 1;
    pad.clear();
    if (g.index >= g.order.length) {
      finish();
      return;
    }
    saveState();
    showPhase();
  }

  function finish() {
    if (resume) resume.clear();
    const best = bestStore.update(g.level, g.score);
    els.overTitle.textContent = g.score >= best && g.score > 0 ? "최고 기록!" : "한 바퀴 끝!";
    els.overScore.textContent = `${g.score}점`;
    els.overMastered.textContent = `한 번도 안 틀린 한자 ${g.perfect}/${g.order.length}자`;
    els.overBest.textContent = `최고 점수 ${best}점`;
    els.over.hidden = false;
  }

  function setMsg(text, kind = "") {
    els.msg.textContent = text;
    els.msg.className = "game-msg " + kind;
  }

  // ---------- 루프 (쓰기 판 그리기) ----------

  function startLoop() {
    stopLoop();
    const loop = (now) => {
      if (!els.write.hidden) pad.render(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(timer);
  }

  // ---------- 이벤트 ----------

  els.back.addEventListener("click", onExit);
  els.start.addEventListener("click", () => start());
  els.resumeBtn.addEventListener("click", () => {
    const r = resume ? resume.get() : null;
    if (r) start(r);
  });
  els.pause.addEventListener("click", () => {
    if (!g) return;
    pad.enabled = false;
    els.paused.hidden = false;
  });
  els.resumePlay.addEventListener("click", () => {
    pad.enabled = true;
    els.paused.hidden = true;
  });
  els.quit.addEventListener("click", () => {
    saveState();
    showMenu();
  });
  els.overMenu.addEventListener("click", showMenu);
  els.overRetry.addEventListener("click", () => start());
  window.addEventListener("resize", () => {
    if (!els.play.hidden) pad.resize();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && g && !els.play.hidden && els.over.hidden) saveState();
  });

  return { showMenu };
}
