const QUESTIONS_FILE = "./questions.json";

const STORAGE_KEYS = {
  quizState: "quizState",
  resultData: "resultData"
};

let questions = [];

/* =========================
   基本工具
========================= */
function daySortKey(day) {
  const m = String(day).match(/^Day(\d+)(?:_(\d+))?$/i);
  if (!m) return [999, 999];

  const main = parseInt(m[1], 10);
  const sub = m[2] ? parseInt(m[2], 10) : 0;
  return [main, sub];
}

function compareDays(a, b) {
  const [a1, a2] = daySortKey(a);
  const [b1, b2] = daySortKey(b);
  if (a1 !== b1) return a1 - b1;
  return a2 - b2;
}

// async function loadQuestions() {
//   const res = await fetch(`${QUESTIONS_FILE}?t=${Date.now()}`);
//   if (!res.ok) {
//     throw new Error("無法讀取 questions.json");
//   }

//   const data = await res.json();
//   if (!Array.isArray(data)) {
//     throw new Error("questions.json 格式錯誤，最外層應為陣列");
//   }

//   return data;
// }
async function loadQuestions() {
  const cached = sessionStorage.getItem("questionsCache");
  if (cached) {
    return JSON.parse(cached);
  }

  const res = await fetch(QUESTIONS_FILE);
  if (!res.ok) {
    throw new Error("無法讀取 questions.json");
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("questions.json 格式錯誤，最外層應為陣列");
  }

  sessionStorage.setItem("questionsCache", JSON.stringify(data));
  return data;
}

function getDays(questionsList) {
  return [...new Set(
    questionsList.map(q => String(q.day || "Day1"))
  )].sort(compareDays);
}

function getState() {
  const raw = sessionStorage.getItem(STORAGE_KEYS.quizState);
  return raw ? JSON.parse(raw) : null;
}

function saveState(state) {
  sessionStorage.setItem(STORAGE_KEYS.quizState, JSON.stringify(state));
}

function clearState() {
  sessionStorage.removeItem(STORAGE_KEYS.quizState);
  sessionStorage.removeItem(STORAGE_KEYS.resultData);
}

function getResultData() {
  const raw = sessionStorage.getItem(STORAGE_KEYS.resultData);
  return raw ? JSON.parse(raw) : null;
}

function saveResultData(resultData) {
  sessionStorage.setItem(STORAGE_KEYS.resultData, JSON.stringify(resultData));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function goToPage(pageName) {
  window.location.href = pageName;
}

function getPageName() {
  const path = window.location.pathname;
  const file = path.split("/").pop();
  return file || "index.html";
}

function getCurrentQuestion(state) {
  if (!state || !Array.isArray(state.order)) return null;
  if (state.idx < 0 || state.idx >= state.order.length) return null;

  const qIndex = state.order[state.idx];
  return questions[qIndex] || null;
}

/* =========================
   流程邏輯（對應 Flask）
========================= */

// 對應 Flask: 使用者選擇 Day 後建立 session
function startDay(day) {
  const selectedDay = String(day || "").trim();
  if (!selectedDay) return;

  const order = questions
    .map((q, i) => ({ q, i }))
    .filter(item => String(item.q.day || "Day1") === selectedDay)
    .map(item => item.i);

  if (!order.length) {
    alert("該 Day 沒有題目，請重新選擇。");
    goHome();
    return;
  }

  const state = {
    day: selectedDay,
    order,
    idx: 0,
    correct: 0,
    total: 0
  };

  saveState(state);
  sessionStorage.removeItem(STORAGE_KEYS.resultData);

  goToPage("index.html");
}

// 對應 Flask: submit() -> render_template("result.html")
function submitAnswer(userAnswerRaw) {
  const state = getState();
  if (!state) {
    goHome();
    return;
  }

  const q = getCurrentQuestion(state);
  if (!q) {
    goHome();
    return;
  }

  const userAnswer = String(userAnswerRaw || "").trim().toUpperCase();
  const correctAnswer = String(q.answer || "").trim().toUpperCase();
  const isCorrect = userAnswer === correctAnswer;

  state.total = Number(state.total || 0) + 1;
  if (isCorrect) {
    state.correct = Number(state.correct || 0) + 1;
  }
  saveState(state);

  const choices = q.choices || {};
  const userChoiceText = choices[userAnswer] || "";
  const correctChoiceText = choices[correctAnswer] || "";

  const resultPayload = {
    question: q.question || "",
    choices,
    user_answer: userAnswer,
    user_choice_text: userChoiceText,
    correct_answer: correctAnswer,
    correct_choice_text: correctChoiceText,
    is_correct: isCorrect,
    explanation: q.explanation || "（本題尚未提供解析）",
    score_correct: state.correct || 0,
    score_total: state.total || 0,
    day: state.day || ""
  };

  saveResultData(resultPayload);

  // 這裡一定先去結果頁看解析
  goToPage("result.html");
}

// 對應 Flask: /next -> idx + 1 -> redirect(index)
function nextQuestion() {
  const state = getState();
  if (!state || !Array.isArray(state.order)) {
    goHome();
    return;
  }

  state.idx = Number(state.idx || 0) + 1;
  saveState(state);
  sessionStorage.removeItem(STORAGE_KEYS.resultData);

  // 對應 Flask index():
  // idx >= len(order) -> finish.html
  // 否則 -> index.html
  if (state.idx >= state.order.length) {
    goToPage("finish.html");
  } else {
    goToPage("index.html");
  }
}

function goHome() {
  clearState();
  sessionStorage.removeItem("questionsCache");  
  goToPage("select_day.html");
}
  goToPage("select_day.html");
}

function restartDay() {
  const state = getState();
  if (!state || !Array.isArray(state.order) || !state.day) {
    goHome();
    return;
  }

  state.idx = 0;
  state.correct = 0;
  state.total = 0;
  saveState(state);
  sessionStorage.removeItem(STORAGE_KEYS.resultData);

  goToPage("index.html");
}

/* =========================
   頁面初始化：select_day.html
========================= */
function initSelectDayPage() {
  const form = document.getElementById("day-form");
  const select = document.getElementById("day-select");
  const hint = document.getElementById("hint-text");
  const error = document.getElementById("error-text");

  if (!form || !select) return;

  const days = getDays(questions);

  if (!days.length) {
    select.innerHTML = `<option value="">沒有可用的 Day</option>`;
    if (hint) hint.textContent = "題庫是空的，請先在 questions.json 放入題目。";
    return;
  }

  select.innerHTML = days
    .map(day => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`)
    .join("");

  if (hint) hint.textContent = `目前共有 ${days.length} 個 Day 可供練習。`;
  if (error) error.textContent = "";

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const selectedDay = select.value;
    if (!selectedDay) return;
    startDay(selectedDay);
  });
}

/* =========================
   頁面初始化：index.html
========================= */
function initQuestionPage() {
  const metaEl = document.getElementById("question-meta");
  const textEl = document.getElementById("question-text");
  const choicesEl = document.getElementById("choices-container");
  const form = document.getElementById("quiz-form");

  if (!metaEl || !textEl || !choicesEl || !form) return;

  const state = getState();

  // 對應 Flask index(): 若 session 不完整就回首頁
  if (!state || !state.day || !Array.isArray(state.order) || !state.order.length) {
    goHome();
    return;
  }

  // 對應 Flask index(): 題目做完才顯示 finish
  if (state.idx >= state.order.length) {
    goToPage("finish.html");
    return;
  }

  const q = getCurrentQuestion(state);
  if (!q) {
    goHome();
    return;
  }

  document.title = `${state.day} 刷題`;
  metaEl.textContent = `${state.day} ｜ 第 ${state.idx + 1} / ${state.order.length} 題`;
  textEl.textContent = q.question || "";

  const choices = q.choices || {};
  const entries = Object.entries(choices);

  if (!entries.length) {
    choicesEl.innerHTML = `<div class="choice">此題沒有選項</div>`;
    return;
  }

  choicesEl.innerHTML = entries.map(([key, val]) => `
    <div class="choice">
      <label>
        <input type="radio" name="answer" value="${escapeHtml(key)}" required>
        <b>${escapeHtml(key)}</b>. ${escapeHtml(val)}
      </label>
    </div>
  `).join("");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const checked = form.querySelector('input[name="answer"]:checked');
    if (!checked) {
      alert("請先選擇答案。");
      return;
    }

    submitAnswer(checked.value);
  });
}

/* =========================
   頁面初始化：result.html
========================= */
function initResultPage() {
  const qEl = document.getElementById("result-question");
  const userEl = document.getElementById("user-answer-text");
  const correctEl = document.getElementById("correct-answer-text");
  const statusEl = document.getElementById("result-status");
  const expEl = document.getElementById("result-explanation");
  const scoreEl = document.getElementById("result-score");

  if (!qEl || !userEl || !correctEl || !statusEl || !expEl || !scoreEl) return;

  const state = getState();
  const r = getResultData();

  // result.html 必須有 state 與 resultData
  if (!state || !r) {
    goHome();
    return;
  }

  document.title = "作答結果";

  qEl.textContent = r.question || "";

  const userText = `${r.user_answer || ""} (${r.user_choice_text || ""})`;
  const correctText = `${r.correct_answer || ""} (${r.correct_choice_text || ""})`;

  userEl.textContent = userText;
  correctEl.textContent = correctText;
  expEl.textContent = r.explanation || "（本題尚未提供解析）";
  scoreEl.textContent = `目前得分：${r.score_correct ?? 0} / ${r.score_total ?? 0}`;

  if (r.is_correct) {
    userEl.className = "correct-text";
    statusEl.className = "ok";
    statusEl.textContent = "✅ 答對";
  } else {
    userEl.className = "wrong-text";
    statusEl.className = "ng";
    statusEl.textContent = "❌ 答錯";
  }
}

/* =========================
   頁面初始化：finish.html
========================= */
function initFinishPage() {
  const titleEl = document.getElementById("finish-title");
  const scoreEl = document.getElementById("finish-score");

  if (!titleEl || !scoreEl) return;

  const state = getState();
  if (!state || !state.day) {
    goHome();
    return;
  }

  document.title = "完成刷題";
  titleEl.textContent = `🎉 ${state.day} 完成`;
  scoreEl.textContent = `答對 ${state.correct ?? 0} / ${state.total ?? 0} 題`;
}

/* =========================
   主初始化
========================= */
async function initApp() {
  try {
    questions = await loadQuestions();
  } catch (err) {
    console.error(err);

    const errorBox = document.getElementById("error-text");
    const hint = document.getElementById("hint-text");

    if (errorBox) {
      errorBox.textContent = `載入題庫失敗：${err.message}`;
    } else {
      document.body.innerHTML = `
        <div style="padding:24px;font-family:system-ui;">
          <h2>載入題庫失敗</h2>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }

    if (hint) hint.textContent = "";
    return;
  }

  const page = getPageName();

  if (page === "select_day.html") {
    initSelectDayPage();
  } else if (page === "index.html" || page === "") {
    initQuestionPage();
  } else if (page === "result.html") {
    initResultPage();
  } else if (page === "finish.html") {
    initFinishPage();
  }
}

window.goHome = goHome;
window.startDay = startDay;
window.submitAnswer = submitAnswer;
window.nextQuestion = nextQuestion;
window.restartDay = restartDay;

document.addEventListener("DOMContentLoaded", initApp);
