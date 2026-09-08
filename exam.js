// 한자 시험: 급수를 골라 20문제(한자→훈음, 훈음→한자 번갈아)를 푼다. 문제당 5점, 70점 이상 합격.
//
//   const exam = setupExam({ onExit, bestStore, board, profile, speak });
//   exam.showMenu();

import { HANJA, LEVELS, hunEum } from "./hanja.js";
import { examQuestions, examScore, examPassed, EXAM_COUNT } from "./quiz-logic.js";
import * as sfx from "./sfx.js";

const LEVEL_CHOICES = [...LEVELS, { key: "all", label: "전체", desc: "8급과 7급Ⅱ에서 골고루" }];
const NEXT_DELAY = 800;

export function setupExam({ onExit, bestStore, board, profile, speak }) {
  const $ = (id) => document.getElementById(id);
  const els = {
    menu: $("exam-menu"),
    play: $("exam-play"),
    back: $("exam-back"),
    levelList: $("exam-level"),
    best: $("exam-best"),
    start: $("exam-start"),
    boardBtn: $("exam-board-btn"),
    board: $("exam-board"),
    boardList: $("exam-board-list"),
    boardClose: $("exam-board-close"),
    count: $("exam-count"),
    correct: $("exam-correct"),
    quit: $("exam-quit"),
    progress: $("exam-progress"),
    q: $("exam-q"),
    big: $("exam-big"),
    opts: $("exam-opts"),
    msg: $("exam-msg"),
    over: $("exam-over"),
    overStar: $("eo-star"),
    overTitle: $("eo-title"),
    overScore: $("eo-score"),
    overCorrect: $("eo-correct"),
    overRank: $("eo-rank"),
    overBest: $("eo-best"),
    overWrong: $("eo-wrong"),
    overMenu: $("eo-menu"),
    overRetry: $("eo-retry"),
  };

  let level = LEVELS[0].key;
  let g = null;
  let locked = false;
  let timer = 0;

  function labelOf(key) {
    return (LEVEL_CHOICES.find((l) => l.key === key) || LEVEL_CHOICES[0]).label;
  }

  // ---------- 메뉴 ----------

  function showMenu() {
    clearTimeout(timer);
    g = null;
    els.play.hidden = true;
    els.menu.hidden = false;
    els.over.hidden = true;
    els.board.hidden = true;
    renderLevels();
  }

  function renderLevels() {
    els.levelList.innerHTML = "";
    for (const l of LEVEL_CHOICES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "diff-btn" + (l.key === level ? " selected" : "");
      b.innerHTML = `<b>${l.label}</b><small>${l.desc}</small>`;
      b.addEventListener("click", () => {
        level = l.key;
        renderLevels();
      });
      els.levelList.appendChild(b);
    }
    const best = bestStore.get(level);
    els.best.textContent = best > 0 ? `${labelOf(level)} 최고 점수 ${best}점` : "아직 기록이 없어요";
  }

  function renderBoard(highlightAt = null) {
    const me = profile();
    const list = board.top(10);
    els.boardList.innerHTML = "";
    if (list.length === 0) {
      els.boardList.innerHTML = `<li class="board-empty">아직 기록이 없어요</li>`;
      return;
    }
    list.forEach((e, i) => {
      const li = document.createElement("li");
      if (me && e.profileId === me.id && (!highlightAt || e.at === highlightAt)) li.classList.add("me");
      li.innerHTML = `<span class="rank${i < 3 ? " gold" : ""}">${i + 1}</span><span class="av">${e.avatar || "🙂"}</span><span class="nm">${escapeHtml(e.name)} <span class="lv">${labelOf(e.level)}</span></span><span class="sc">${e.score}점</span>`;
      els.boardList.appendChild(li);
    });
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // ---------- 진행 ----------

  function start() {
    clearTimeout(timer);
    sfx.unlock();
    g = { level, qs: examQuestions(level), index: 0, correct: 0, wrong: [] };
    els.menu.hidden = true;
    els.play.hidden = false;
    els.over.hidden = true;
    showQuestion();
  }

  function showQuestion() {
    locked = false;
    const q = g.qs[g.index];
    els.count.textContent = `문제 ${g.index + 1}/${g.qs.length}`;
    els.correct.textContent = `맞힘 ${g.correct}`;
    els.progress.style.width = `${Math.round((g.index / g.qs.length) * 100)}%`;
    els.opts.innerHTML = "";
    if (q.dir === "meaning") {
      els.q.textContent = "이 한자의 훈과 음은?";
      els.big.className = "memo-big";
      els.big.innerHTML = `<span class="hanja">${q.ch}</span>`;
    } else {
      els.q.textContent = "어느 한자일까요?";
      els.big.className = "memo-big reading";
      els.big.textContent = hunEum(q.ch);
    }
    for (const c of q.choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-opt" + (q.dir === "hanja" ? " hanja" : "");
      b.textContent = q.dir === "meaning" ? hunEum(c) : c;
      b.dataset.ch = c;
      b.addEventListener("click", () => answer(c === q.ch, b));
      els.opts.appendChild(b);
    }
    setMsg("");
  }

  function answer(correct, btn) {
    if (locked || !g) return;
    locked = true;
    const q = g.qs[g.index];
    for (const el of els.opts.children) {
      el.disabled = true;
      if (el.dataset.ch === q.ch) el.classList.add("right");
    }
    if (correct) {
      g.correct += 1;
      sfx.success();
      setMsg("정답!", "ok");
    } else {
      btn.classList.add("wrong");
      g.wrong.push(q.ch);
      setMsg(`아쉬워요. ${q.ch}는 '${hunEum(q.ch)}'`, "bad");
    }
    speak(q.ch);
    els.correct.textContent = `맞힘 ${g.correct}`;
    timer = setTimeout(() => {
      if (!g) return;
      g.index += 1;
      if (g.index >= g.qs.length) finish();
      else showQuestion();
    }, NEXT_DELAY);
  }

  function finish() {
    const score = examScore(g.correct);
    const passed = examPassed(g.correct, g.qs.length);
    const best = bestStore.update(g.level, score);
    const me = profile();
    const entry = { profileId: me ? me.id : null, name: me ? me.name : "?", avatar: me ? me.avatar : "", level: g.level, score };
    const rank = board.add(entry);
    els.progress.style.width = "100%";
    els.overStar.textContent = passed ? "🎉" : "💪";
    els.overTitle.textContent = passed ? `${labelOf(g.level)} 합격!` : "조금만 더 해 봐요";
    els.overScore.textContent = `${score}점`;
    els.overCorrect.textContent = `${g.qs.length}문제 중 ${g.correct}개 맞힘`;
    els.overRank.textContent = `기록판 ${rank}위`;
    els.overBest.textContent = `최고 점수 ${best}점`;
    els.overWrong.innerHTML =
      g.wrong.length === 0
        ? `<h3>다 맞았어요! 🌟</h3>`
        : `<h3>틀린 한자 ${g.wrong.length}자</h3>` + g.wrong.map((ch) => `<span><b class="hanja">${ch}</b> ${hunEum(ch)}</span>`).join("");
    els.over.hidden = false;
  }

  function setMsg(text, kind = "") {
    els.msg.textContent = text;
    els.msg.className = "game-msg " + kind;
  }

  // ---------- 이벤트 ----------

  els.back.addEventListener("click", onExit);
  els.start.addEventListener("click", start);
  els.quit.addEventListener("click", () => {
    if (!g || confirm("시험을 그만둘까요? 점수는 저장되지 않아요.")) showMenu();
  });
  els.boardBtn.addEventListener("click", () => {
    renderBoard();
    els.board.hidden = false;
  });
  els.boardClose.addEventListener("click", () => {
    els.board.hidden = true;
  });
  els.overMenu.addEventListener("click", showMenu);
  els.overRetry.addEventListener("click", start);

  return { showMenu };
}
