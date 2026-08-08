const STORAGE_KEY = "lps-state-v1";

const PRIORITY_WEIGHT = {
  high: 30,
  normal: 16,
  low: 8,
};

const DEFAULT_STATE = {
  todos: [],
  focusSessions: [],
  memos: [],
  chatHistory: [
    {
      id: cryptoId(),
      role: "assistant",
      message: "안녕하세요. 일정, 메모, 건강 상태, 집중 시간을 말해주시면 대화하면서 스케줄을 짜드릴게요.",
      createdAt: new Date().toISOString(),
    },
  ],
  pendingChat: null,
  routines: [
    { id: cryptoId(), name: "운동", checkedDates: [], streak: 0, lastCheckedAt: null },
    { id: cryptoId(), name: "약 복용", checkedDates: [], streak: 0, lastCheckedAt: null },
    { id: cryptoId(), name: "독서", checkedDates: [], streak: 0, lastCheckedAt: null },
  ],
  health: {
    sleepHours: 7,
    fatigue: 4,
    exerciseDone: false,
    medsTaken: false,
    focusWindowStart: "09:00",
    focusWindowEnd: "18:00",
  },
  timer: {
    durationMinutes: 25,
    remainingSeconds: 25 * 60,
    running: false,
    startedAt: null,
    activeSessionId: null,
  },
  activityLog: [],
  voiceDraft: "",
  aiMode: true,
  auth: {
    users: [],
    currentUser: null,
  },
  userSettings: {},
  llm: {
    enabled: false,
    provider: "azure",
    endpoint: "http://localhost:8787/api/llm/chat",
    model: "gpt-4o-mini",
    apiKey: "",
    dailyLimit: 20,
    usageDate: todayKey(),
    usageCount: 0,
  },
};

const appState = loadState();
let timerTickHandle = null;

const elements = {
  todoForm: document.getElementById("todo-form"),
  todoTitle: document.getElementById("todo-title"),
  todoPriority: document.getElementById("todo-priority"),
  todoDue: document.getElementById("todo-due"),
  todoTime: document.getElementById("todo-time"),
  todoEstimate: document.getElementById("todo-estimate"),
  todoNote: document.getElementById("todo-note"),
  clearForm: document.getElementById("clear-form"),
  healthForm: document.getElementById("health-form"),
  sleepHours: document.getElementById("sleep-hours"),
  fatigue: document.getElementById("fatigue"),
  exerciseDone: document.getElementById("exercise-done"),
  medsTaken: document.getElementById("meds-taken"),
  focusWindowStart: document.getElementById("focus-window-start"),
  focusWindowEnd: document.getElementById("focus-window-end"),
  todoList: document.getElementById("todo-list"),
  activityList: document.getElementById("activity-list"),
  routineList: document.getElementById("routine-list"),
  memoForm: document.getElementById("memo-form"),
  memoTitle: document.getElementById("memo-title"),
  memoBody: document.getElementById("memo-body"),
  memoTag: document.getElementById("memo-tag"),
  memoPinned: document.getElementById("memo-pinned"),
  memoReset: document.getElementById("memo-reset"),
  memoClearDone: document.getElementById("memo-clear-done"),
  memoList: document.getElementById("memo-list"),
  memoCount: document.getElementById("memo-count"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  chatThread: document.getElementById("chat-thread"),
  chatClear: document.getElementById("chat-clear"),
  authForm: document.getElementById("auth-form"),
  authUsername: document.getElementById("auth-username"),
  authPassword: document.getElementById("auth-password"),
  authRegister: document.getElementById("auth-register"),
  authLogout: document.getElementById("auth-logout"),
  authState: document.getElementById("auth-state"),
  settingsPanel: document.querySelector(".settings-panel"),
  settingsForm: document.getElementById("settings-form"),
  settingsLLMEnabled: document.getElementById("settings-llm-enabled"),
  settingsLLMProvider: document.getElementById("settings-llm-provider"),
  settingsLLMEndpoint: document.getElementById("settings-llm-endpoint"),
  settingsLLMModel: document.getElementById("settings-llm-model"),
  settingsLLMApiKey: document.getElementById("settings-llm-api-key"),
  settingsLLMApiKeyLabel: document.getElementById("settings-llm-api-key-label"),
  settingsLLMDailyLimit: document.getElementById("settings-llm-daily-limit"),
  settingsSave: document.getElementById("settings-save"),
  llmUsage: document.getElementById("llm-usage"),
  llmStatusLabel: document.getElementById("llm-status-label"),
  aiList: document.getElementById("ai-list"),
  aiSummary: document.getElementById("ai-summary"),
  aiConfidence: document.getElementById("ai-confidence"),
  aiApply: document.querySelector('[data-action="apply-ai"]'),
  recalculateAI: document.getElementById("recalculate-ai-secondary"),
  voiceText: document.getElementById("voice-text"),
  voicePreview: document.getElementById("voice-preview"),
  startVoice: document.getElementById("start-voice"),
  applyVoice: document.getElementById("apply-voice"),
  timerValue: document.getElementById("timer-value"),
  timerState: document.getElementById("timer-state"),
  timerStart: document.getElementById("timer-start"),
  timerPause: document.getElementById("timer-pause"),
  timerReset: document.getElementById("timer-reset"),
  timerPresets: Array.from(document.querySelectorAll(".chip-btn[data-duration]")),
  todoCount: document.getElementById("todo-count"),
  doneCount: document.getElementById("done-count"),
  sessionCount: document.getElementById("session-count"),
  streakBest: document.getElementById("streak-best"),
  statusMessage: document.getElementById("status-message"),
};

(async () => {
  await boot();
})();

async function boot() {
  const currentUser = appState.auth?.currentUser;
  if (currentUser && appState.auth.users.some((item) => item.username === currentUser)) {
    loadSettingsForUser(currentUser);
  } else {
    appState.auth.currentUser = null;
  }

  // Azure OpenAI 상태 감지
  await detectAzureStatus();

  bindEvents();
  syncFormFromState();
  renderAll();
  updateVoicePreview();
  if (appState.timer.running) {
    startTimerTick();
  }
}

async function detectAzureStatus() {
  try {
    const response = await fetch("http://localhost:8787/health");
    if (response.ok) {
      const data = await response.json();
      if (data?.providers?.azure?.configured) {
        appState.llm.provider = "azure";
        appState.llm.endpoint = "http://localhost:8787/api/llm/chat";
        const statusLabel = document.getElementById('llm-status-label');
        if (statusLabel) {
          statusLabel.textContent = '✓ Azure OpenAI 연결됨';
          statusLabel.style.color = '#4caf50';
        }
        persistState();
        return;
      }
    }
  } catch (e) {
    console.log('Azure detection error:', e.message);
  }

  // Azure 미설정 또는 오류
  const statusLabel = document.getElementById('llm-status-label');
  if (statusLabel) {
    statusLabel.textContent = 'Azure OpenAI 설정 필요';
    statusLabel.style.color = '#ff9800';
  }
}

function bindEvents() {
  elements.todoForm.addEventListener("submit", handleTodoSubmit);
  elements.clearForm.addEventListener("click", resetTodoForm);
  if (elements.chatForm) {
    elements.chatForm.addEventListener("submit", handleChatSubmit);
  }
  if (elements.chatClear) {
    elements.chatClear.addEventListener("click", clearChatHistory);
  }
  if (elements.authForm) {
    elements.authForm.addEventListener("submit", handleAuthLogin);
  }
  if (elements.authRegister) {
    elements.authRegister.addEventListener("click", handleAuthRegister);
  }
  if (elements.authLogout) {
    elements.authLogout.addEventListener("click", handleAuthLogout);
  }
  if (elements.settingsForm) {
    elements.settingsForm.addEventListener("submit", handleSettingsSave);
  }
  if (elements.settingsLLMProvider) {
    elements.settingsLLMProvider.addEventListener("change", handleProviderChange);
  }
  if (elements.memoForm) {
    elements.memoForm.addEventListener("submit", handleMemoSubmit);
  }
  if (elements.memoReset) {
    elements.memoReset.addEventListener("click", resetMemoForm);
  }
  if (elements.memoClearDone) {
    elements.memoClearDone.addEventListener("click", clearAllMemos);
  }

  [
    elements.sleepHours,
    elements.fatigue,
    elements.exerciseDone,
    elements.medsTaken,
    elements.focusWindowStart,
    elements.focusWindowEnd,
  ].forEach((element) => {
    element.addEventListener("input", handleHealthChange);
    element.addEventListener("change", handleHealthChange);
  });

  elements.recalculateAI.addEventListener("click", () => {
    renderAI();
    showStatus("AI 추천을 다시 계산했습니다.", "info");
    addLog("ai", "AI 추천을 다시 계산함");
  });

  if (elements.aiApply) {
    elements.aiApply.addEventListener("click", applyAIOrdering);
  }

  elements.startVoice.addEventListener("click", startVoiceRecognition);
  elements.applyVoice.addEventListener("click", applyVoiceDraft);
  elements.voiceText.addEventListener("input", () => {
    appState.voiceDraft = elements.voiceText.value;
    updateVoicePreview();
    persistState();
  });

  elements.timerStart.addEventListener("click", startTimer);
  elements.timerPause.addEventListener("click", pauseTimer);
  elements.timerReset.addEventListener("click", resetTimer);
  elements.timerPresets.forEach((button) => {
    button.addEventListener("click", () => {
      const minutes = Number(button.dataset.duration);
      setTimerDuration(minutes);
      elements.timerPresets.forEach((presetButton) => presetButton.classList.toggle("is-active", presetButton === button));
      showStatus(`${minutes}분 타이머로 설정했습니다.`, "info");
      addLog("timer", `${minutes}분 프리셋 선택`);
    });
  });

  document.querySelectorAll(".routine-btn").forEach((button) => {
    button.addEventListener("click", () => {
      toggleRoutine(button.dataset.routine);
    });
  });

  elements.todoList.addEventListener("click", handleTodoActions);
  elements.activityList.addEventListener("click", handleActivityActions);
  elements.routineList.addEventListener("click", handleRoutineActions);
  if (elements.memoList) {
    elements.memoList.addEventListener("click", handleMemoActions);
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const message = elements.chatInput.value.trim();
  if (!message) {
    showStatus("메시지를 입력해 주세요.", "warning");
    return;
  }

  pushChatMessage("user", message);
  elements.chatInput.value = "";
  
  const response = await resolveChatResponse(message);

  if (Array.isArray(response.actions)) {
    response.actions.forEach((action) => {
      if (action.type === "todo") {
        appState.todos.unshift(action.todo);
        addLog("todo", `챗봇 추가: ${action.todo.title}`);
      }
      if (action.type === "memo") {
        appState.memos.unshift(action.memo);
        appState.memos = sortMemos(appState.memos);
        addLog("memo", `챗봇 메모 저장: ${action.memo.title}`);
      }
      if (action.type === "health") {
        appState.health = {
          ...appState.health,
          ...action.health,
        };
      }
      if (action.type === "chat-clear-pending") {
        appState.pendingChat = null;
      }
      if (action.type === "chat-pending") {
        appState.pendingChat = action.pending;
      }
    });
  }

  if (response.todo) {
    appState.todos.unshift(response.todo);
    addLog("todo", `챗봇 추가: ${response.todo.title}`);
  }

  if (response.memo) {
    appState.memos.unshift(response.memo);
    appState.memos = sortMemos(appState.memos);
    addLog("memo", `챗봇 메모 저장: ${response.memo.title}`);
  }

  if (response.pending) {
    appState.pendingChat = response.pending;
  }

  if (response.health) {
    appState.health = {
      ...appState.health,
      ...response.health,
    };
    updateRangeLabels();
  }

  pushChatMessage("assistant", response.message, response.meta);
  console.log("[DEBUG] After pushChatMessage, chatHistory:", appState.chatHistory?.length);
  persistState();
  console.log("[DEBUG] Calling renderAll()");
  renderAll();
  console.log("[DEBUG] After renderAll, threadHTML:", document.querySelector('#chat-thread')?.innerHTML?.substring(0, 50));
  
  if (response.message) {
    showStatus(response.message, response.tone || "info");
  }
}

async function resolveChatResponse(message) {
  if (!appState.llm?.enabled) {
    return generateChatResponse(message);
  }

  refreshLLMQuotaForToday();
  if ((appState.llm.usageCount || 0) >= (appState.llm.dailyLimit || 20)) {
    const fallback = generateChatResponse(message);
    fallback.meta = [...(fallback.meta || []), `오늘 LLM 한도 ${appState.llm.dailyLimit}회 사용 완료`];
    fallback.tone = "warning";
    showStatus(`오늘 LLM 한도(${appState.llm.dailyLimit}회)를 모두 사용해 규칙 엔진으로 답변했습니다.`, "warning");
    addLog("chat", `LLM 일일 한도 도달 (${appState.llm.usageCount}/${appState.llm.dailyLimit})`);
    return fallback;
  }

  try {
    const llmResponse = await requestLLMResponse(message);
    if (llmResponse?.message) {
      appState.llm.usageCount = (appState.llm.usageCount || 0) + 1;
      persistState();
      return llmResponse;
    }
  } catch (error) {
    console.warn("LLM response failed, fallback to rules", error);
    addLog("chat", "LLM 호출 실패로 규칙 엔진으로 전환");
    showStatus("LLM 연결이 실패해 규칙 엔진으로 답변했습니다.", "warning");
  }

  return generateChatResponse(message);
}

async function requestLLMResponse(message) {
  const endpoint = normalizeText(appState.llm?.endpoint || "");
  if (!endpoint) {
    throw new Error("LLM endpoint is empty");
  }

  const recent = appState.chatHistory.slice(0, 10).reverse().map((item) => ({
    role: item.role === "assistant" ? "assistant" : "user",
    content: item.message,
  }));

  const context = {
    now: new Date().toISOString(),
    pendingChat: appState.pendingChat,
    health: appState.health,
    todosTop: appState.todos.slice(0, 6).map((todo) => ({
      title: todo.title,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime,
      priority: todo.priority,
      estimateMinutes: todo.estimateMinutes,
    })),
  };

  const payload = {
    provider: appState.llm.provider || "azure",
    model: appState.llm.model || "gpt-4o-mini",
    apiKey: appState.llm.apiKey || "",
    messages: [
      {
        role: "system",
        content: [
          "당신은 일정/메모/건강 코치 역할의 한국어 비서입니다.",
          "반드시 JSON만 출력하세요. 코드블록 사용 금지.",
          "스키마: {message:string,tone:'info'|'success'|'warning'|'danger',meta:string[],todo?:object,memo?:object,health?:object,pending?:object,actions?:array}",
          "사용자 의도가 일정 추가가 아니면 날짜/시간을 강요하지 마세요.",
          "부상/복용/날씨 질문은 조언형 답변으로 처리하세요.",
          "todo 생성 시 필수: title,dueDate(YYYY-MM-DD),dueTime(HH:MM),priority(high|normal|low),estimateMinutes,note.",
          "memo 생성 시 필수: title,body,tag(general|work|health|idea|study).",
        ].join(" "),
      },
      {
        role: "system",
        content: `앱 상태 컨텍스트: ${JSON.stringify(context)}`,
      },
      ...recent,
      {
        role: "user",
        content: message,
      },
    ],
    temperature: 0.3,
    max_tokens: 520,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM endpoint error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const parsed = normalizeLLMResponse(data);
  return parsed;
}

function normalizeLLMResponse(data) {
  // 프록시 응답 우선 처리: data.content
  let rawText = "";
  if (data?.content) {
    rawText = data.content;
  } else if (typeof data?.message === "string") {
    rawText = data.message;
  } else if (data?.output) {
    rawText = data.output;
  }
  
  const json = safeJsonParse(extractJsonObject(rawText));
  if (!json || typeof json !== "object") {
    return { message: normalizeText(rawText) || "응답을 이해하지 못해 기본 모드로 처리합니다.", tone: "info" };
  }

  const tone = ["info", "success", "warning", "danger"].includes(json.tone) ? json.tone : "info";
  const meta = Array.isArray(json.meta) ? json.meta.map((item) => normalizeText(String(item))).filter(Boolean).slice(0, 4) : [];

  const normalized = {
    message: normalizeText(String(json.message || "")) || "응답을 생성했습니다.",
    tone,
    meta,
  };

  if (json.todo && typeof json.todo === "object") {
    normalized.todo = {
      id: cryptoId(),
      title: normalizeText(String(json.todo.title || "새 일정")),
      priority: ["high", "normal", "low"].includes(json.todo.priority) ? json.todo.priority : "normal",
      dueDate: normalizeText(String(json.todo.dueDate || "")) || null,
      dueTime: normalizeText(String(json.todo.dueTime || "")) || null,
      estimateMinutes: clampNumber(Number(json.todo.estimateMinutes || 30), 5, 480),
      note: normalizeText(String(json.todo.note || "AI 챗봇으로 추가됨")),
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "chatbot-llm",
    };
  }

  if (json.memo && typeof json.memo === "object") {
    const body = normalizeText(String(json.memo.body || ""));
    normalized.memo = {
      id: cryptoId(),
      title: normalizeText(String(json.memo.title || makeShortTitle(body) || "대화 메모")),
      body,
      tag: ["general", "work", "health", "idea", "study"].includes(json.memo.tag) ? json.memo.tag : "general",
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  if (json.health && typeof json.health === "object") {
    normalized.health = {
      fatigue: json.health.fatigue != null ? clampNumber(Number(json.health.fatigue), 1, 10) : appState.health.fatigue,
      sleepHours: json.health.sleepHours != null ? clampNumber(Number(json.health.sleepHours), 0, 12) : appState.health.sleepHours,
      exerciseDone: json.health.exerciseDone != null ? Boolean(json.health.exerciseDone) : appState.health.exerciseDone,
      medsTaken: json.health.medsTaken != null ? Boolean(json.health.medsTaken) : appState.health.medsTaken,
      focusWindowStart: normalizeText(String(json.health.focusWindowStart || appState.health.focusWindowStart)),
      focusWindowEnd: normalizeText(String(json.health.focusWindowEnd || appState.health.focusWindowEnd)),
    };
  }

  if (json.pending && typeof json.pending === "object") {
    normalized.pending = json.pending;
  }

  if (Array.isArray(json.actions)) {
    normalized.actions = json.actions;
  }

  return normalized;
}

function extractJsonObject(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return "{}";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function handleAuthLogin(event) {
  event.preventDefault();
  const username = normalizeText(elements.authUsername?.value || "").toLowerCase();
  const password = elements.authPassword?.value || "";
  if (!username || !password) {
    showStatus("아이디와 비밀번호를 입력해 주세요.", "warning");
    return;
  }

  const user = appState.auth.users.find((item) => item.username === username);
  if (!user || user.passwordHash !== simpleHash(password)) {
    showStatus("로그인에 실패했습니다. 계정을 확인해 주세요.", "danger");
    return;
  }

  appState.auth.currentUser = username;
  loadSettingsForUser(username);
  persistState();
  renderAll();
  showStatus(`${username} 계정으로 로그인했습니다.`, "success");
  addLog("chat", `로그인: ${username}`);
}

function handleAuthRegister() {
  const username = normalizeText(elements.authUsername?.value || "").toLowerCase();
  const password = elements.authPassword?.value || "";
  if (!username || !password) {
    showStatus("회원 생성을 위해 아이디와 비밀번호를 입력해 주세요.", "warning");
    return;
  }

  if (appState.auth.users.some((item) => item.username === username)) {
    showStatus("이미 존재하는 아이디입니다.", "warning");
    return;
  }

  appState.auth.users.push({
    id: cryptoId(),
    username,
    passwordHash: simpleHash(password),
    createdAt: new Date().toISOString(),
  });
  appState.auth.currentUser = username;
  loadSettingsForUser(username);
  persistState();
  renderAll();
  showStatus(`${username} 계정을 생성하고 로그인했습니다.`, "success");
  addLog("chat", `회원 생성: ${username}`);
}

function handleAuthLogout() {
  if (!appState.auth.currentUser) {
    showStatus("이미 로그아웃 상태입니다.", "warning");
    return;
  }

  appState.auth.currentUser = null;
  appState.pendingChat = null;
  persistState();
  renderAll();
  showStatus("로그아웃되었습니다.", "info");
}

function handleSettingsSave(event) {
  event.preventDefault();
  if (!appState.auth.currentUser) {
    showStatus("설정 저장은 로그인 후 가능합니다.", "warning");
    return;
  }

  refreshLLMQuotaForToday();
  appState.llm = {
    ...appState.llm,
    enabled: Boolean(elements.settingsLLMEnabled?.checked),
    provider: "azure",
    endpoint: normalizeText(elements.settingsLLMEndpoint?.value || ""),
    model: normalizeText(elements.settingsLLMModel?.value || "") || "gpt-4o-mini",
    apiKey: normalizeText(elements.settingsLLMApiKey?.value || ""),
    dailyLimit: clampNumber(Number(elements.settingsLLMDailyLimit?.value || appState.llm.dailyLimit || 20), 1, 500, 20),
  };

  saveSettingsForCurrentUser();
  persistState();
  renderLLMUsage();
  const modeLabel = appState.llm.enabled ? "활성화" : "비활성화";
  showStatus(`설정을 저장했습니다. LLM ${modeLabel} 상태입니다.`, "info");
  addLog("chat", `설정 저장: ${appState.auth.currentUser}`);
}

function loadSettingsForUser(username) {
  const saved = appState.userSettings?.[username]?.llm || {};
  appState.llm = {
    ...DEFAULT_STATE.llm,
    ...saved,
  };
  refreshLLMQuotaForToday();
}

function saveSettingsForCurrentUser() {
  const username = appState.auth.currentUser;
  if (!username) return;
  if (!appState.userSettings || typeof appState.userSettings !== "object") {
    appState.userSettings = {};
  }
  appState.userSettings[username] = {
    llm: {
      ...appState.llm,
    },
    updatedAt: new Date().toISOString(),
  };
}

function handleProviderChange() {
  const provider = elements.settingsLLMProvider?.value || "azure";
  if (elements.settingsLLMApiKeyLabel) {
    elements.settingsLLMApiKeyLabel.style.display = provider === "azure" ? "grid" : "none";
  }
}

function renderProviderUI() {
  const provider = elements.settingsLLMProvider?.value || "azure";
  if (elements.settingsLLMApiKeyLabel) {
    elements.settingsLLMApiKeyLabel.style.display = provider === "azure" ? "grid" : "none";
  }
}
  let hash = 0;
  const value = String(text || "");
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return String(hash);
}

function refreshLLMQuotaForToday() {
  if (!appState.llm) return;
  const today = todayKey();
  if (appState.llm.usageDate !== today) {
    appState.llm.usageDate = today;
    appState.llm.usageCount = 0;
  }
}

function renderLLMUsage() {
  if (!elements.llmUsage) return;
  if (!appState.auth?.currentUser) {
    elements.llmUsage.textContent = "로그인 후 사용량이 표시됩니다.";
    return;
  }
  refreshLLMQuotaForToday();
  const used = appState.llm?.usageCount || 0;
  const limit = appState.llm?.dailyLimit || 20;
  elements.llmUsage.textContent = `오늘 LLM 사용 ${used}/${limit}`;
}

function clearChatHistory() {
  appState.chatHistory = [
    {
      id: cryptoId(),
      role: "assistant",
      message: "대화를 초기화했습니다. 다시 일정을 말해 주세요.",
      createdAt: new Date().toISOString(),
    },
  ];
  appState.pendingChat = null;
  persistState();
  renderAll();
  showStatus("챗봇 대화를 초기화했습니다.", "warning");
}

function pushChatMessage(role, message, meta = []) {
  appState.chatHistory.unshift({
    id: cryptoId(),
    role,
    message,
    meta,
    createdAt: new Date().toISOString(),
  });
  appState.chatHistory = appState.chatHistory.slice(0, 30);
}

function renderChat() {
  const chatThread = document.querySelector('#chat-thread');
  if (!chatThread) return;

  const items = appState.chatHistory.slice(0, 12).reverse();
  chatThread.innerHTML = items.map((item) => {
    const role = item.role === "assistant" ? "AI" : item.role === "system" ? "안내" : "나";
    const meta = item.meta?.length ? `<div class="memo-meta">${item.meta.map(t => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : "";
    return `<article class="chat-message ${escapeHtml(item.role)}">
      <div class="chat-message-head"><strong>${role}</strong><span class="subtle">${formatRelativeTime(item.createdAt)}</span></div>
      <div class="chat-message-body">${escapeHtml(item.message)}</div>${meta}</article>`;
  }).join("");
}

function generateChatResponse(message) {
  const normalized = normalizeText(message);
  const lower = normalized.toLowerCase();
  const hasPending = Boolean(appState.pendingChat);

  if (isInjuryExerciseQuestion(normalized)) {
    return {
      message: buildInjuryExerciseGuidance(normalized),
      tone: "warning",
      meta: ["부상 상태 우선", "무리 없는 운동 권장"],
    };
  }

  if (isMedicationGuidanceText(normalized)) {
    return {
      message: buildMedicationGuidance(normalized),
      tone: "info",
      meta: ["약 복용 안내", "처방전 우선 확인"],
    };
  }

  if (hasPending) {
    return resolvePendingChat(normalized, appState.pendingChat);
  }

  if (/(오늘|이번주|스케줄|일정|계획).*(짜|정리|만들)/.test(normalized)) {
    const ranked = scoreTodos();
    const nextItem = ranked[0]?.todo;
    const focusAdvice = buildFocusAdvice();
    return {
      message: nextItem
        ? `오늘은 ${nextItem.title}부터 시작하는 게 좋겠습니다.\n${focusAdvice}\n원하면 "30분 단위로 짜줘"처럼 말해 더 세분화할 수 있어요.`
        : `아직 일정이 비어 있습니다. 할 일, 메모, 건강 상태를 말해주시면 함께 계획을 짜드릴게요.\n${focusAdvice}`,
      meta: nextItem ? [
        `추천 1순위: ${nextItem.title}`,
        `예상 ${nextItem.estimateMinutes}분`,
      ] : ["일정 초안 없음"],
      tone: "info",
    };
  }

  if (/피곤|피로|졸리|잠/.test(lower)) {
    return {
      message: "피로가 높을 때는 고부하 작업을 뒤로 미루고, 20~30분짜리 가벼운 작업을 먼저 두는 편이 좋습니다. 필요한 경우 오늘 일정을 줄여드릴게요.",
      health: { fatigue: Math.min(10, Math.max(appState.health.fatigue, 7)) },
      tone: "warning",
      meta: ["고부하 작업 뒤로 이동", "짧은 작업 우선"],
    };
  }

  if (/날씨|기온|온도|비|강수|흐림|맑음|우산/.test(lower) && !/(일정|계획|할 일|메모|추가|등록|짜|정리|만들)/.test(lower)) {
    return {
      message: "이 앱은 실시간 날씨를 직접 가져오지 못합니다. 날씨를 알려주시면 조깅하기 좋은지, 실내 운동으로 바꿀지 기준을 같이 정리해드릴게요.",
      tone: "info",
      meta: ["날씨 입력 후 조깅 판단", "실내 운동 대안 가능"],
    };
  }

  if (/수면|잠을.?못|잠이.?적/.test(lower)) {
    return {
      message: "수면이 부족한 날은 집중 블록을 짧게 쪼개고, 쉬운 일부터 처리하는 편이 안정적입니다. 수면 상태를 반영해 추천 순서를 다시 계산했습니다.",
      health: { sleepHours: Math.min(appState.health.sleepHours, 5.5) },
      tone: "warning",
      meta: ["짧은 집중 블록 추천", "쉬운 일 먼저"],
    };
  }

  if (/(먹을|먹어|먹는|마실|마셔|복용|섭취).*(언제|몇 시|어느|조금|바로)/.test(lower) && !/(일정|계획|할 일|메모|추가|등록|짜|정리|만들)/.test(lower)) {
    return {
      message: "실시간 건강 정보는 없어서 정확한 식사 시간은 단정할 수 없지만, 보통은 아침 식사 후나 오후 간식 시간처럼 부담이 적은 때가 무난합니다. 속이 비어 있거나 운동 전후라면 그 조건도 같이 말해주면 더 맞게 조언할 수 있어요.",
      tone: "info",
      meta: ["식사/복용 시간 조언", "조건을 주면 더 구체화 가능"],
    };
  }

  if (/메모|기억|남겨/.test(lower)) {
    const memo = buildMemoFromChat(normalized);
    return {
      message: `메모로 정리해 두었습니다: ${memo.title}`,
      memo,
      tone: "success",
      meta: [memo.tag === "idea" ? "아이디어 메모" : "빠른 메모"],
    };
  }

  const parsed = parseScheduleFromChat(normalized);
  if (parsed.intent === "todo") {
    if (parsed.missing.length) {
      return {
        message: `좋아요. ${parsed.baseTitle || "일정"}을/를 추가하려고 합니다. ${parsed.missing.join(" 그리고 ")}만 알려주면 바로 초안을 만들어드릴게요.`,
        pending: {
          type: "todo",
          baseTitle: parsed.baseTitle,
          missing: parsed.missing,
          draft: parsed.draft,
        },
        tone: "info",
        meta: ["추가 정보 대기"],
      };
    }

    return {
      message: `일정을 추가했습니다. ${parsed.todo.title}\n원하시면 "오늘 일정 짜줘"라고 말해 우선순위를 다시 맞춰드릴 수 있어요.`,
      todo: parsed.todo,
      tone: "success",
      meta: [
        parsed.todo.dueDate ? `날짜 ${parsed.todo.dueDate}` : "날짜 미지정",
        parsed.todo.dueTime ? `시간 ${parsed.todo.dueTime}` : "시간 미지정",
      ],
    };
  }

  if (/오늘.*정리|우선순위|추천/.test(normalized)) {
    const ranked = scoreTodos();
    const top = ranked[0]?.todo;
    return {
      message: top
        ? `지금 가장 먼저 할 일은 ${top.title} 입니다.\n건강 상태와 마감일을 함께 고려해 전체 순서를 정리해 두었습니다.`
        : "아직 정리할 할 일이 없습니다. 먼저 하고 싶은 일을 말해 주세요.",
      tone: "info",
      meta: ranked.slice(0, 3).map((item) => item.todo.title),
    };
  }

  if (/도와|어떻게|뭐부터|추천/.test(lower)) {
    return {
      message: `원하시는 방식으로 도와드릴게요.\n1. "내일 3시에 회의 추가"처럼 말하면 일정으로 바꿉니다.\n2. "오늘 일정 짜줘"라고 말하면 우선순위를 정리합니다.\n3. "피곤하니까 가볍게"라고 말하면 컨디션을 반영합니다.`,
      tone: "info",
    };
  }

  return {
    message: `들으신 내용은 "${normalized}" 입니다.\n일정으로 만들려면 날짜와 시간을 함께 말해 주세요. 예: "내일 오전 9시에 회의"`,
    pending: null,
    tone: "info",
  };
}

function parseScheduleFromChat(text) {
  const normalized = normalizeText(text);
  const result = {
    intent: "todo",
    baseTitle: normalized,
    missing: [],
    draft: null,
    todo: null,
  };

  const dateMatch = normalized.match(/(오늘|내일|모레|그저께)/);
  const timeMatch = normalized.match(/(오전|오후)?\s*(\d{1,2})(?:[:시](\d{1,2}))?\s*(?:분)?/);
  const title = cleanupChatText(normalized)
    .replace(/(추가해?줘|만들어?줘|넣어?줘|적어?줘|등록해?줘|정리해?줘|보여?줘|해줘|해 줘|줘)/g, "")
    .replace(/(일정|할 일|메모|계획)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const dueDate = dateMatch ? relativeDateKey(dateMatch[1]) : null;
  const dueTime = timeMatch ? normalizeTimeMatch(timeMatch[1], timeMatch[2], timeMatch[3]) : null;

  if (!dueDate) result.missing.push("날짜");
  if (!dueTime) result.missing.push("시간");
  if (!title) result.missing.push("제목");

  result.baseTitle = title || normalized;

  if (!result.missing.length) {
    result.todo = {
      id: cryptoId(),
      title,
      priority: appState.health.fatigue >= 7 ? "normal" : "high",
      dueDate,
      dueTime,
      estimateMinutes: 30,
      note: "AI 챗봇으로 추가됨",
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "chatbot",
    };
  }

  return result;
}

function resolvePendingChat(text, pending) {
  if (pending.type !== "todo") {
    appState.pendingChat = null;
    return {
      message: "대기 중인 요청을 처리할 수 없어 초기화했습니다.",
      tone: "warning",
    };
  }

  if (isInjuryExerciseQuestion(text)) {
    appState.pendingChat = null;
    return {
      message: buildInjuryExerciseGuidance(text),
      tone: "warning",
      meta: ["부상 상태 우선", "대기 요청 초기화"],
    };
  }

  if (isMedicationGuidanceText(text)) {
    appState.pendingChat = null;
    return {
      message: buildMedicationGuidance(text),
      tone: "info",
      meta: ["약 복용 안내", "대기 요청 초기화"],
    };
  }

  if (/날씨|기온|온도|비|강수|흐림|맑음|우산/.test(text) && !/(일정|계획|할 일|메모|추가|등록|짜|정리|만들)/.test(text)) {
    appState.pendingChat = null;
    return {
      message: "이 앱은 실시간 날씨를 직접 가져오지 못합니다. 날씨를 알려주시면 조깅해도 되는지 바로 같이 판단해드릴게요.",
      tone: "info",
      meta: ["날씨 입력 후 조깅 판단", "대기 요청 초기화"],
    };
  }

  const draft = pending.draft || {};
  let { baseTitle } = pending;
  let dueDate = draft.dueDate || null;
  let dueTime = draft.dueTime || null;

  const dateMatch = text.match(/(오늘|내일|모레|그저께)/);
  const timeMatch = text.match(/(오전|오후)?\s*(\d{1,2})(?:[:시](\d{1,2}))?\s*(?:분)?/);

  if (dateMatch) {
    dueDate = relativeDateKey(dateMatch[1]);
  }
  if (timeMatch) {
    dueTime = normalizeTimeMatch(timeMatch[1], timeMatch[2], timeMatch[3]);
  }

  const cleaned = normalizeText(
    text
      .replace(/(오늘|내일|모레|그저께)/g, "")
      .replace(/(오전|오후|새벽|아침|점심|저녁|밤)/g, "")
      .replace(/\d{1,2}\s*(?:[:시]\s*\d{1,2})?\s*시?\s*(?:분)?\s*에?/g, "")
      .replace(/(추가|만들어|넣어줘|적어줘|등록|그리고|와|및)/g, "")
  );

  if (cleaned && cleaned.length > 1) {
    baseTitle = cleaned;
  }

  if (!dueDate) {
    appState.pendingChat = {
      ...pending,
      baseTitle,
      draft: { ...draft, dueDate, dueTime },
    };
    return {
      message: `날짜가 아직 필요합니다. "내일" 또는 "오늘"처럼 말해 주세요.`,
      tone: "info",
    };
  }

  if (!dueTime) {
    appState.pendingChat = {
      ...pending,
      baseTitle,
      draft: { ...draft, dueDate, dueTime },
    };
    return {
      message: `시간이 아직 필요합니다. "오전 9시"처럼 말해 주세요.`,
      tone: "info",
    };
  }

  const todo = {
    id: cryptoId(),
    title: baseTitle || pending.baseTitle,
    priority: appState.health.fatigue >= 7 ? "normal" : "high",
    dueDate,
    dueTime,
    estimateMinutes: 30,
    note: "AI 챗봇으로 추가됨",
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "chatbot",
  };

  appState.pendingChat = null;
  return {
    message: `챗봇 대화로 일정을 추가했습니다. ${todo.title}`,
    todo,
    tone: "success",
  };
}

function buildMemoFromChat(text) {
  const clauses = String(text)
    .split(/[.!?。！？]/)
    .map((part) => normalizeText(part))
    .filter(Boolean);
  const candidateClause = clauses.find((clause) => !/메모|남겨|적어|저장/.test(clause)) || clauses.at(-1) || text;
  const body = normalizeText(candidateClause);
  const title = makeShortTitle(body) || "대화 메모";
  return {
    id: cryptoId(),
    title,
    body: body || text,
    tag: /건강|약|병원/.test(text) ? "health" : /아이디어|생각/.test(text) ? "idea" : "general",
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function cleanupChatText(text) {
  return normalizeText(
    String(text)
      .replace(/(오늘|내일|모레|그저께)/g, "")
      .replace(/(오전|오후|새벽|아침|점심|저녁|밤)/g, "")
      .replace(/\d{1,2}\s*(?:[:시]\s*\d{1,2})?\s*시?\s*(?:분)?\s*에?/g, "")
      .replace(/(에는|까지|부터|정도|쯤)(?=\s|$)/g, "")
      .replace(/(메모로?|메모를?|메모에|일정으로|일정에|할 일로|할 일에|계획으로|계획에)/g, "")
      .replace(/(추가해?줘|만들어?줘|넣어?줘|적어?줘|등록해?줘|정리해?줘|보여?줘|해줘|해 줘|줘)/g, "")
      .replace(/\s+/g, " ")
  );
}

function makeShortTitle(text) {
  const summary = normalizeText(String(text).split(/\s+/).slice(0, 4).join(" "));
  return summary.replace(/(을|를|은|는|이|가|의|에|에서|로|으로|도|만|과|와|및|듯|처럼)$/g, "").trim();
}

function isMedicationGuidanceText(text) {
  const normalized = normalizeText(String(text));
  const isSchedulingIntent = /(일정|계획|할 일|메모|추가|등록|짜|정리|만들)/.test(normalized);
  if (isSchedulingIntent) return false;

  const hasMedicationWord = /(약|복용|처방|약봉투|알약|캡슐|시럽)/.test(normalized);
  const hasInstructionWord = /(먹으래|먹으라고|먹어래|먹어라|먹어야|복용하래|복용하라고|먹고|식후|식전|공복|취침|잠들기\s*전|잠자기\s*전|자기\s*전)/.test(normalized);

  return hasMedicationWord && hasInstructionWord;
}

function buildMedicationGuidance(text) {
  const normalized = normalizeText(String(text));
  if (/(먹지\s*말|먹지\s*마|복용하지\s*말|복용\s*금지|금지래|하지\s*말래|말래)/.test(normalized)) {
    return "알려주신 내용대로 해당 시간대 복용은 피하는 것이 맞습니다. 최종 복용 기준은 처방전과 약봉투 안내를 우선으로 따르고, 헷갈리면 병원이나 약국에 바로 확인해 주세요.";
  }
  if (/(취침|잠들기\s*전|잠자기\s*전|자기\s*전)/.test(normalized)) {
    return "처방대로 잠들기 직전이나 취침 30분 전쯤 복용하면 됩니다. 다만 약마다 복용 간격이 다를 수 있으니 처방전과 약봉투의 시간을 가장 우선으로 따라주세요.";
  }
  if (/(점심|아침|저녁|식사|밥|식후)/.test(normalized)) {
    return "처방대로 식사를 마친 뒤 복용하면 됩니다. 약마다 공복/식후 기준과 간격이 다를 수 있으니 처방전과 약봉투 안내를 가장 먼저 확인해 주세요.";
  }
  return "복용 시점은 처방전과 약봉투 안내가 가장 정확합니다. 복용 간격이나 식전/식후 조건이 헷갈리면 병원 또는 약국에 확인하는 것이 안전합니다.";
}

function isInjuryExerciseQuestion(text) {
  const normalized = normalizeText(String(text));
  const hasInjuryWord = /(부러|골절|삐|인대|통증|다쳤|수술|깁스|재활)/.test(normalized);
  const hasBodyPart = /(다리|무릎|발목|허리|어깨|팔|손목|발)/.test(normalized);
  const asksExercise = /(운동|스트레칭|재활|어떤|뭐|추천|가능|해도|아령|덤벨|웨이트|근력|들까|들어도|해도 되)/.test(normalized);
  const hasSchedulingIntent = /(일정|계획|할 일|추가|등록|짜|정리|만들)/.test(normalized);
  return (hasInjuryWord || hasBodyPart) && asksExercise && !hasSchedulingIntent;
}

function buildInjuryExerciseGuidance(text) {
  const normalized = normalizeText(String(text));
  if (/(팔|어깨|손목)/.test(normalized)) {
    return "팔/어깨 부상이 있으면 아령 같은 저항 운동은 먼저 피하는 것이 안전합니다. 통증이 없는 범위의 가벼운 관절 가동과 반대쪽 보상 동작만 최소로 하고, 가능한 운동 범위는 담당 의사나 물리치료사 지시에 맞춰 진행해 주세요.";
  }
  if (/(다리|무릎|발목|깁스|골절|부러)/.test(normalized)) {
    return "다리 부상이나 골절이 있으면 체중 부하 운동은 피하고, 통증이 없는 범위에서 상체 위주의 가벼운 운동과 호흡 운동부터 시작하는 편이 안전합니다. 담당 의사나 물리치료사에게 가능한 동작 범위를 먼저 확인해 주세요.";
  }
  return "부상이 있으면 통증을 유발하는 동작은 피하고, 통증 없는 범위의 저강도 운동부터 시작하는 것이 좋습니다. 정확한 운동 종류는 진단명과 회복 단계에 따라 달라지므로 의료진 확인을 우선해 주세요.";
}

function buildFocusAdvice() {
  const health = appState.health;
  if (health.fatigue >= 7 || health.sleepHours <= 5.5) {
    return "지금은 25분 이하의 짧은 집중 블록이 좋습니다.";
  }
  if (health.exerciseDone) {
    return "운동을 했다면 50분짜리 중간 집중 블록도 괜찮습니다.";
  }
  return "현재 컨디션 기준으로 25~50분 집중 블록이 무난합니다.";
}

function handleMemoSubmit(event) {
  event.preventDefault();

  const title = elements.memoTitle.value.trim();
  const body = elements.memoBody.value.trim();
  if (!title && !body) {
    showStatus("메모 제목이나 내용을 입력해 주세요.", "warning");
    return;
  }

  const memo = {
    id: cryptoId(),
    title: title || body.slice(0, 20) || "메모",
    body,
    tag: elements.memoTag.value,
    pinned: elements.memoPinned.checked,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  appState.memos.unshift(memo);
  appState.memos = sortMemos(appState.memos);
  addLog("memo", `메모 저장: ${memo.title}`);
  persistState();
  renderAll();
  resetMemoForm();
  showStatus("메모를 저장했습니다.", "success");
}

function handleMemoActions(event) {
  const target = event.target.closest("button[data-memo-action]");
  if (!target) return;

  const memoId = target.closest(".memo-item")?.dataset.id;
  if (!memoId) return;

  if (target.dataset.memoAction === "toggle-pin") {
    toggleMemoPin(memoId);
  }

  if (target.dataset.memoAction === "delete") {
    deleteMemo(memoId);
  }
}

function handleTodoSubmit(event) {
  event.preventDefault();

  const title = elements.todoTitle.value.trim();
  if (!title) {
    showStatus("할 일을 입력해 주세요.", "warning");
    return;
  }

  const estimateMinutes = clampNumber(elements.todoEstimate.value, 5, 480, 30);
  const todo = {
    id: cryptoId(),
    title,
    priority: elements.todoPriority.value,
    dueDate: elements.todoDue.value || null,
    dueTime: elements.todoTime.value || null,
    estimateMinutes,
    note: elements.todoNote.value.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "manual",
  };

  appState.todos.unshift(todo);
  addLog("todo", `할 일 추가: ${todo.title}`);
  persistState();
  resetTodoForm();
  renderAll();
  showStatus("할 일이 추가되었습니다.", "success");
}

function handleHealthChange() {
  appState.health.sleepHours = Number(elements.sleepHours.value);
  appState.health.fatigue = Number(elements.fatigue.value);
  appState.health.exerciseDone = elements.exerciseDone.checked;
  appState.health.medsTaken = elements.medsTaken.checked;
  appState.health.focusWindowStart = elements.focusWindowStart.value;
  appState.health.focusWindowEnd = elements.focusWindowEnd.value;
  updateRangeLabels();
  persistState();
  renderAI();
}

function handleTodoActions(event) {
  const target = event.target.closest("button[data-action]");
  if (!target) return;

  const todoId = target.closest(".todo-item")?.dataset.id;
  if (!todoId) return;

  if (target.dataset.action === "toggle") {
    toggleTodo(todoId);
  }

  if (target.dataset.action === "delete") {
    deleteTodo(todoId);
  }
}

function handleActivityActions(event) {
  const target = event.target.closest("button[data-action]");
  if (!target) return;

  if (target.dataset.action === "apply-ai") {
    applyAIOrdering();
  }
}

function handleRoutineActions(event) {
  const target = event.target.closest("button[data-routine-action]");
  if (!target) return;

  toggleRoutine(target.dataset.routineAction);
}

function toggleTodo(todoId) {
  const todo = appState.todos.find((item) => item.id === todoId);
  if (!todo) return;

  todo.completed = !todo.completed;
  todo.updatedAt = new Date().toISOString();
  addLog("todo", `${todo.completed ? "완료" : "미완료"}: ${todo.title}`);
  persistState();
  renderAll();
  showStatus(todo.completed ? "할 일을 완료했습니다." : "완료를 해제했습니다.", "info");
}

function deleteTodo(todoId) {
  const index = appState.todos.findIndex((item) => item.id === todoId);
  if (index < 0) return;

  const [removed] = appState.todos.splice(index, 1);
  addLog("todo", `할 일 삭제: ${removed.title}`);
  persistState();
  renderAll();
  showStatus("할 일을 삭제했습니다.", "warning");
}

function startTimer() {
  if (appState.timer.running) return;

  const now = new Date().toISOString();
  if (!appState.timer.activeSessionId) {
    const session = {
      id: cryptoId(),
      durationMinutes: appState.timer.durationMinutes,
      startedAt: now,
      endedAt: null,
      status: "running",
    };
    appState.focusSessions.unshift(session);
    appState.timer.activeSessionId = session.id;
    appState.timer.startedAt = now;
  } else {
    const session = appState.focusSessions.find((item) => item.id === appState.timer.activeSessionId);
    if (session) {
      session.status = "running";
    }
    appState.timer.startedAt = now;
  }

  appState.timer.running = true;
  addLog("timer", `${appState.timer.durationMinutes}분 타이머 시작`);
  startTimerTick();
  persistState();
  renderTimer();
  showStatus("집중 타이머를 시작했습니다.", "success");
}

function pauseTimer() {
  if (!appState.timer.running) return;

  appState.timer.running = false;
  const session = appState.focusSessions.find((item) => item.id === appState.timer.activeSessionId);
  if (session) {
    session.status = "paused";
  }
  stopTimerTick();
  persistState();
  renderTimer();
  addLog("timer", "집중 타이머 일시정지");
  showStatus("타이머를 일시정지했습니다.", "info");
}

function resetTimer() {
  appState.timer.running = false;
  appState.timer.remainingSeconds = appState.timer.durationMinutes * 60;
  appState.timer.startedAt = null;
  const session = appState.focusSessions.find((item) => item.id === appState.timer.activeSessionId);
  if (session && session.status !== "done") {
    session.status = "paused";
  }
  stopTimerTick();
  persistState();
  renderTimer();
  addLog("timer", "타이머 리셋");
  showStatus("타이머를 초기화했습니다.", "warning");
}

function setTimerDuration(minutes) {
  appState.timer.durationMinutes = minutes;
  appState.timer.remainingSeconds = minutes * 60;
  if (!appState.timer.running) {
    renderTimer();
  }
  persistState();
}

function startTimerTick() {
  stopTimerTick();
  let lastTick = Date.now();
  timerTickHandle = window.setInterval(() => {
    if (!appState.timer.running) return;
    const now = Date.now();
    const elapsed = Math.max(1, Math.round((now - lastTick) / 1000));
    lastTick = now;
    appState.timer.remainingSeconds = Math.max(0, appState.timer.remainingSeconds - elapsed);
    renderTimer();

    if (appState.timer.remainingSeconds <= 0) {
      completeTimerSession();
    }
  }, 1000);
}

function stopTimerTick() {
  if (timerTickHandle) {
    window.clearInterval(timerTickHandle);
    timerTickHandle = null;
  }
}

function completeTimerSession() {
  stopTimerTick();
  appState.timer.running = false;
  appState.timer.remainingSeconds = appState.timer.durationMinutes * 60;
  const session = appState.focusSessions.find((item) => item.id === appState.timer.activeSessionId);
  if (session) {
    session.status = "done";
    session.endedAt = new Date().toISOString();
  }
  appState.timer.activeSessionId = null;
  appState.timer.startedAt = null;
  persistState();
  renderAll();
  addLog("timer", "집중 세션 완료");
  showStatus("집중 세션이 끝났습니다.", "success");
}

function toggleRoutine(name) {
  const routine = appState.routines.find((item) => item.name === name);
  if (!routine) return;

  const today = todayKey();
  const alreadyChecked = routine.checkedDates.includes(today);
  if (alreadyChecked) {
    routine.checkedDates = routine.checkedDates.filter((date) => date !== today);
    routine.lastCheckedAt = routine.checkedDates.at(-1) || null;
    routine.streak = calculateStreak(routine.checkedDates);
    addLog("routine", `${routine.name} 체크 해제`);
    showStatus(`${routine.name} 해제를 완료했습니다.`, "warning");
  } else {
    routine.checkedDates.push(today);
    routine.checkedDates = dedupeDates(routine.checkedDates);
    routine.lastCheckedAt = new Date().toISOString();
    routine.streak = calculateStreak(routine.checkedDates);
    addLog("routine", `${routine.name} 체크 완료`);
    showStatus(`${routine.name} 체크를 완료했습니다.`, "success");
  }

  persistState();
  renderAll();
}

function applyAIOrdering() {
  const ranked = scoreTodos();
  appState.todos = ranked.map((item) => item.todo);
  addLog("ai", "AI 추천 순서 적용");
  persistState();
  renderAll();
  showStatus("AI 추천 순서를 적용했습니다.", "success");
}

function scoreTodos() {
  const health = appState.health;
  const currentHour = new Date().getHours();
  const windowStart = toMinutes(health.focusWindowStart);
  const windowEnd = toMinutes(health.focusWindowEnd);
  const nowMinutes = currentHour * 60 + new Date().getMinutes();
  const inFocusWindow = windowStart <= windowEnd
    ? nowMinutes >= windowStart && nowMinutes <= windowEnd
    : nowMinutes >= windowStart || nowMinutes <= windowEnd;

  return appState.todos
    .map((todo, index) => {
      let score = PRIORITY_WEIGHT[todo.priority] ?? 10;
      const reasons = [];

      if (todo.completed) {
        score -= 80;
        reasons.push("완료된 항목");
      }

      if (todo.dueDate) {
        const diffDays = dayDiff(todo.dueDate, todayKey());
        if (diffDays < 0) {
          score += 45 + Math.abs(diffDays) * 8;
          reasons.push(`마감 지남 ${Math.abs(diffDays)}일`);
        } else if (diffDays === 0) {
          score += 28;
          reasons.push("오늘 마감");
        } else if (diffDays === 1) {
          score += 18;
          reasons.push("내일 마감");
        } else {
          score += Math.max(0, 12 - diffDays * 2);
          reasons.push(`${diffDays}일 뒤 마감`);
        }
      }

      if (todo.dueTime) {
        const dueMinutes = toMinutes(todo.dueTime);
        const diff = Math.abs(dueMinutes - nowMinutes);
        if (diff <= 60) {
          score += 10;
          reasons.push("가까운 시간대 일정");
        }
      }

      score -= Math.min(12, Math.round(todo.estimateMinutes / 10));
      if (todo.estimateMinutes <= 20) {
        reasons.push("짧은 작업");
      } else if (todo.estimateMinutes >= 60) {
        reasons.push("긴 작업");
      }

      const fatiguePenalty = health.fatigue * 3;
      const sleepBonus = health.sleepHours >= 7 ? 4 : health.sleepHours <= 5.5 ? -8 : 0;
      const exerciseBonus = health.exerciseDone ? 2 : 0;
      const medsBonus = health.medsTaken ? 1 : 0;
      score -= fatiguePenalty;
      score += sleepBonus + exerciseBonus + medsBonus;

      if (health.fatigue >= 7 && todo.estimateMinutes > 45) {
        score -= 10;
        reasons.push("피로도 고려: 고부하 조정");
      }

      if (!inFocusWindow && todo.priority === "low") {
        score -= 2;
      }

      if (inFocusWindow && todo.priority === "high") {
        score += 8;
        reasons.push("집중 시간과 적합");
      }

      return {
        todo,
        score,
        reasons,
        index,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function renderAll() {
  renderLLMUsage();
  renderAuthUI();
  renderStats();
  renderTimer();
  renderTodos();
  renderRoutines();
  renderMemos();
  renderChat();
  renderAI();
  renderActivity();
  updateRangeLabels();
  syncFormFromState();
}

function renderStats() {
  const doneCount = appState.todos.filter((item) => item.completed).length;
  const sessionCount = appState.focusSessions.filter((item) => isSameDay(item.startedAt, todayKey())).length;
  const streakBest = appState.routines.reduce((max, routine) => Math.max(max, routine.streak ?? 0), 0);

  elements.todoCount.textContent = String(appState.todos.length);
  elements.doneCount.textContent = String(doneCount);
  elements.sessionCount.textContent = String(sessionCount);
  elements.streakBest.textContent = String(streakBest);
  if (elements.memoCount) {
    elements.memoCount.textContent = String(appState.memos.length);
  }
}

function renderTimer() {
  elements.timerValue.textContent = formatSeconds(appState.timer.remainingSeconds);
  elements.timerState.textContent = appState.timer.running ? "진행 중" : appState.timer.remainingSeconds < appState.timer.durationMinutes * 60 ? "일시정지" : "대기 중";

  elements.timerStart.disabled = appState.timer.running;
  elements.timerPause.disabled = !appState.timer.running;
  elements.timerReset.disabled = !appState.timer.running && appState.timer.remainingSeconds === appState.timer.durationMinutes * 60;
}

function renderTodos() {
  const rankedTodos = scoreTodos();
  if (!rankedTodos.length) {
    elements.todoList.innerHTML = `
      <article class="todo-item">
        <h3>아직 할 일이 없습니다</h3>
        <p class="subtle-line">위 입력창에서 할 일을 추가하면 AI가 우선순위를 정리합니다.</p>
      </article>
    `;
    return;
  }

  elements.todoList.innerHTML = rankedTodos
    .map(({ todo, score, reasons }) => {
      const priorityLabel = todo.priority === "high" ? "높음" : todo.priority === "normal" ? "보통" : "낮음";
      const dueLabel = [todo.dueDate, todo.dueTime].filter(Boolean).join(" ") || "마감 없음";
      const titleMarkup = todo.completed ? `<del>${escapeHtml(todo.title)}</del>` : escapeHtml(todo.title);
      return `
        <article class="todo-item ${todo.completed ? "is-done" : ""}" data-id="${todo.id}">
          <div class="todo-title-row">
            <div class="todo-title">
              <strong>${titleMarkup}</strong>
              <div class="todo-meta">
                <span class="pill pill-${todo.priority}">${priorityLabel}</span>
                <span>마감: ${escapeHtml(dueLabel)}</span>
                <span>예상 ${todo.estimateMinutes}분</span>
              </div>
            </div>
            <strong title="AI 점수">${Math.round(score)}</strong>
          </div>
          ${todo.note ? `<div class="todo-note">${escapeHtml(todo.note)}</div>` : ""}
          <div class="todo-actions">
            <button type="button" data-action="toggle">${todo.completed ? "미완료" : "완료"}</button>
            <button type="button" data-action="delete">삭제</button>
          </div>
          <div class="meta-row">${reasons.slice(0, 3).map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
        </article>
      `;
    })
    .join("");
}

function renderRoutines() {
  elements.routineList.innerHTML = appState.routines
    .map((routine) => {
      const checkedToday = routine.checkedDates.includes(todayKey());
      return `
        <article class="routine-item" data-id="${routine.id}">
          <div class="todo-title-row">
            <div class="todo-title">
              <strong>${escapeHtml(routine.name)}</strong>
              <div class="routine-meta">
                <span>${checkedToday ? "오늘 체크 완료" : "오늘 미체크"}</span>
                <span>연속 ${routine.streak}일</span>
              </div>
            </div>
            <button type="button" data-routine-action="${escapeHtml(routine.name)}">${checkedToday ? "해제" : "체크"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMemos() {
  if (!elements.memoList) return;

  const memos = sortMemos(appState.memos);
  if (!memos.length) {
    elements.memoList.innerHTML = `
      <article class="memo-item">
        <h3>아직 메모가 없습니다</h3>
        <p class="subtle-line">아이디어, 준비물, 짧은 생각을 적어두면 여기에서 빠르게 다시 볼 수 있습니다.</p>
      </article>
    `;
    return;
  }

  elements.memoList.innerHTML = memos
    .map((memo) => {
      return `
        <article class="memo-item ${memo.pinned ? "is-pinned" : ""}" data-id="${memo.id}">
          <div class="memo-header">
            <div>
              <h3>${escapeHtml(memo.title)}</h3>
              <span class="memo-tag">${escapeHtml(tagLabel(memo.tag))}</span>
            </div>
            <strong>${memo.pinned ? "고정" : "메모"}</strong>
          </div>
          ${memo.body ? `<div class="memo-body">${escapeHtml(memo.body)}</div>` : `<div class="memo-body subtle-line">내용 없음</div>`}
          <div class="memo-meta">
            <span>${formatRelativeTime(memo.createdAt)}</span>
            <span>${memo.pinned ? "상단 고정됨" : "일반 메모"}</span>
          </div>
          <div class="todo-actions" style="margin-top: 12px;">
            <button type="button" data-memo-action="toggle-pin">${memo.pinned ? "고정 해제" : "상단 고정"}</button>
            <button type="button" data-memo-action="delete">삭제</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAI() {
  const ranked = scoreTodos();
  const highPriority = ranked[0];
  const fatigue = appState.health.fatigue;
  const sleep = appState.health.sleepHours;
  const confidence = computeConfidence();

  elements.aiConfidence.textContent = `신뢰도: ${confidence.label}`;

  if (!ranked.length) {
    elements.aiSummary.textContent = "할 일을 추가하면 AI가 건강 상태와 마감일을 반영한 추천 순서를 보여줍니다.";
    elements.aiList.innerHTML = "";
    return;
  }

  const summaryLines = [];
  if (fatigue >= 7 || sleep <= 5.5) {
    summaryLines.push("피로도가 높아 고부하 작업은 뒤로 조정했습니다.");
  } else {
    summaryLines.push("컨디션이 안정적이라 높은 우선순위 작업을 앞쪽에 배치했습니다.");
  }

  if (appState.health.exerciseDone) {
    summaryLines.push("운동 완료 상태를 반영해 짧은 집중 블록을 붙였습니다.");
  }

  if (highPriority?.todo?.dueDate) {
    summaryLines.push(`가장 먼저 처리할 작업은 ${highPriority.todo.title} 입니다.`);
  }

  elements.aiSummary.innerHTML = summaryLines.join("<br />");

  elements.aiList.innerHTML = ranked.slice(0, 5).map(({ todo, score, reasons }, index) => {
    const tag = index === 0 ? "지금" : index === 1 ? "다음" : "나중";
    return `
      <article class="recommendation-item">
        <h3>${index + 1}. ${escapeHtml(todo.title)}</h3>
        <div class="meta-row">
          <span class="pill pill-${todo.priority}">${tag}</span>
          <span>점수 ${Math.round(score)}</span>
          <span>${todo.estimateMinutes}분 예상</span>
        </div>
        <div class="subtle-line" style="margin-top:10px;">${escapeHtml(reasons.join(" · ") || "추천 사유 없음")}</div>
      </article>
    `;
  }).join("");
}

function renderActivity() {
  const logs = appState.activityLog.slice(0, 12);
  if (!logs.length) {
    elements.activityList.innerHTML = `
      <article class="activity-item">
        <h3>기록이 아직 없습니다</h3>
        <p class="subtle-line">할 일 추가, 타이머, 루틴 체크, AI 적용 후 최근 기록이 여기에 쌓입니다.</p>
      </article>
    `;
    return;
  }

  elements.activityList.innerHTML = logs
    .map((entry) => {
      return `
        <article class="activity-item">
          <h3>${escapeHtml(entry.title)}</h3>
          <div class="activity-meta">
            <span>${formatRelativeTime(entry.createdAt)}</span>
            <span>${escapeHtml(entry.type)}</span>
          </div>
          <div class="subtle-line" style="margin-top:10px;">${escapeHtml(entry.message)}</div>
        </article>
      `;
    })
    .join("");
}

function syncFormFromState() {
  refreshLLMQuotaForToday();
  elements.sleepHours.value = String(appState.health.sleepHours);
  elements.fatigue.value = String(appState.health.fatigue);
  elements.exerciseDone.checked = Boolean(appState.health.exerciseDone);
  elements.medsTaken.checked = Boolean(appState.health.medsTaken);
  elements.focusWindowStart.value = appState.health.focusWindowStart;
  elements.focusWindowEnd.value = appState.health.focusWindowEnd;
  elements.voiceText.value = appState.voiceDraft || "";
  if (elements.settingsLLMEnabled) {
    elements.settingsLLMEnabled.checked = Boolean(appState.llm?.enabled);
  }
  if (elements.settingsLLMEndpoint) {
    elements.settingsLLMEndpoint.value = appState.llm?.endpoint || "";
  }
  if (elements.settingsLLMProvider) {
    elements.settingsLLMProvider.value = appState.llm?.provider || "azure";
  }
  if (elements.settingsLLMModel) {
    elements.settingsLLMModel.value = appState.llm?.model || "gpt-4o-mini";
  }
  if (elements.settingsLLMApiKey) {
    elements.settingsLLMApiKey.value = appState.llm?.apiKey || "";
  }
  if (elements.settingsLLMDailyLimit) {
    elements.settingsLLMDailyLimit.value = String(appState.llm?.dailyLimit || 20);
  }
  renderAuthUI();
  renderLLMUsage();
  renderProviderUI();
  updateRangeLabels();
}

function renderAuthUI() {
  const currentUser = appState.auth?.currentUser;
  if (elements.authState) {
    elements.authState.textContent = currentUser ? `${currentUser} 로그인` : "로그아웃 상태";
  }

  const isLoggedIn = Boolean(currentUser);
  if (elements.settingsPanel) {
    elements.settingsPanel.classList.toggle("is-locked", !isLoggedIn);
  }
  if (elements.chatInput) {
    elements.chatInput.disabled = !isLoggedIn;
    if (!isLoggedIn) {
      elements.chatInput.placeholder = "로그인 후 챗봇을 사용할 수 있습니다.";
    }
  }
}

function resetMemoForm() {
  if (!elements.memoForm) return;
  elements.memoTitle.value = "";
  elements.memoBody.value = "";
  elements.memoTag.value = "general";
  elements.memoPinned.checked = false;
  elements.memoTitle.focus();
}

function toggleMemoPin(memoId) {
  const memo = appState.memos.find((item) => item.id === memoId);
  if (!memo) return;

  memo.pinned = !memo.pinned;
  memo.updatedAt = new Date().toISOString();
  appState.memos = sortMemos(appState.memos);
  addLog("memo", `${memo.title} ${memo.pinned ? "고정" : "고정 해제"}`);
  persistState();
  renderAll();
  showStatus(memo.pinned ? "메모를 상단에 고정했습니다." : "메모 고정을 해제했습니다.", "info");
}

function deleteMemo(memoId) {
  const index = appState.memos.findIndex((item) => item.id === memoId);
  if (index < 0) return;

  const [removed] = appState.memos.splice(index, 1);
  addLog("memo", `메모 삭제: ${removed.title}`);
  persistState();
  renderAll();
  showStatus("메모를 삭제했습니다.", "warning");
}

function clearAllMemos() {
  if (!appState.memos.length) {
    showStatus("삭제할 메모가 없습니다.", "warning");
    return;
  }

  appState.memos = [];
  addLog("memo", "메모 전체 삭제");
  persistState();
  renderAll();
  showStatus("모든 메모를 삭제했습니다.", "warning");
}

function updateRangeLabels() {
  const sleepLabel = document.querySelector('[data-ref="sleep-hours"]');
  const fatigueLabel = document.querySelector('[data-ref="fatigue"]');
  if (sleepLabel) sleepLabel.textContent = `${Number(elements.sleepHours.value).toFixed(1)}시간`;
  if (fatigueLabel) fatigueLabel.textContent = `${elements.fatigue.value}/10`;
}

function updateVoicePreview() {
  const text = elements.voiceText.value.trim();
  appState.voiceDraft = elements.voiceText.value;
  if (!text) {
    elements.voicePreview.textContent = "아직 초안이 없습니다.";
    return;
  }

  const parsed = parseVoiceText(text);
  const previewParts = [
    `제목: ${parsed.title || "추출 실패"}`,
    `날짜: ${parsed.dueDate || "미지정"}`,
    `시간: ${parsed.dueTime || "미지정"}`,
  ];
  elements.voicePreview.textContent = previewParts.join(" · ");
}

function applyVoiceDraft() {
  const text = elements.voiceText.value.trim();
  if (!text) {
    showStatus("음성 초안이 비어 있습니다.", "warning");
    return;
  }

  const parsed = parseVoiceText(text);
  if (!parsed.title) {
    showStatus("음성 문장에서 제목을 찾지 못했습니다.", "warning");
    return;
  }

  elements.todoTitle.value = parsed.title;
  elements.todoDue.value = parsed.dueDate || "";
  elements.todoTime.value = parsed.dueTime || "";
  if (parsed.note) {
    elements.todoNote.value = parsed.note;
  }

  const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
  elements.todoForm.dispatchEvent(submitEvent);
  showStatus("음성 초안을 할 일로 저장했습니다.", "success");
  addLog("voice", `음성 입력 저장: ${parsed.title}`);
}

function startVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showStatus("이 브라우저는 음성 인식을 지원하지 않습니다. 직접 입력해 주세요.", "warning");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    showStatus("말씀하신 내용을 듣고 있습니다.", "info");
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ");
    elements.voiceText.value = transcript.trim();
    appState.voiceDraft = transcript.trim();
    updateVoicePreview();
    persistState();
    showStatus("음성 초안을 받았습니다.", "success");
    addLog("voice", `음성 인식 결과: ${transcript.trim()}`);
  };

  recognition.onerror = () => {
    showStatus("음성 인식에 실패했습니다. 직접 입력해도 됩니다.", "warning");
  };

  recognition.start();
}

function parseVoiceText(rawText) {
  const text = normalizeText(rawText);
  const result = {
    title: text,
    dueDate: null,
    dueTime: null,
    note: "",
  };

  const dateMatch = text.match(/(오늘|내일|모레|그저께)/);
  if (dateMatch) {
    result.dueDate = relativeDateKey(dateMatch[1]);
  }

  const timeMatch = text.match(/(오전|오후)?\s*(\d{1,2})(?:[:시](\d{1,2}))?\s*(?:분)?/);
  if (timeMatch) {
    result.dueTime = normalizeTimeMatch(timeMatch[1], timeMatch[2], timeMatch[3]);
  }

  const cleaned = normalizeText(
    rawText
      .replace(/(오늘|내일|모레|그저께)/g, "")
      .replace(/(오전|오후|새벽|아침|점심|저녁|밤)/g, "")
      .replace(/\d{1,2}\s*(?:[:시]\s*\d{1,2})?\s*시?\s*(?:분)?\s*에?/g, "")
      .replace(/(에|에는|까지|부터|정도|쯤)/g, "")
      .replace(/\s+/g, " ")
  );

  if (cleaned) {
    result.title = cleaned;
  }

  if (text.includes("예약") || text.includes("미팅") || text.includes("회의")) {
    result.note = "음성 입력에서 자동 추출됨";
  }

  return result;
}

function computeConfidence() {
  const signals = [
    appState.todos.length > 0,
    appState.health.sleepHours !== null,
    appState.health.fatigue !== null,
    Boolean(appState.health.focusWindowStart),
    Boolean(appState.health.focusWindowEnd),
  ].filter(Boolean).length;

  if (signals >= 5) {
    return { label: "높음", value: 0.92 };
  }
  if (signals >= 3) {
    return { label: "보통", value: 0.68 };
  }
  return { label: "낮음", value: 0.38 };
}

function showStatus(message, tone = "default") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.remove("is-warning", "is-danger", "is-info");
  if (tone === "warning") elements.statusMessage.classList.add("is-warning");
  if (tone === "danger") elements.statusMessage.classList.add("is-danger");
  if (tone === "info") elements.statusMessage.classList.add("is-info");
}

function addLog(type, message) {
  appState.activityLog.unshift({
    id: cryptoId(),
    type,
    title: typeToTitle(type),
    message,
    createdAt: new Date().toISOString(),
  });
  appState.activityLog = appState.activityLog.slice(0, 30);
}

function persistState() {
  const serializableState = {
    todos: appState.todos,
    focusSessions: appState.focusSessions,
    memos: appState.memos,
    chatHistory: appState.chatHistory,
    pendingChat: appState.pendingChat,
    routines: appState.routines,
    health: appState.health,
    timer: {
      durationMinutes: appState.timer.durationMinutes,
      remainingSeconds: appState.timer.remainingSeconds,
      running: appState.timer.running,
      startedAt: appState.timer.startedAt,
      activeSessionId: appState.timer.activeSessionId,
    },
    activityLog: appState.activityLog,
    voiceDraft: appState.voiceDraft,
    aiMode: appState.aiMode,
    auth: appState.auth,
    userSettings: appState.userSettings,
    llm: {
      ...appState.llm,
      provider: appState.llm?.provider || "azure",
      apiKey: appState.llm?.apiKey || "",
      usageDate: appState.llm?.usageDate || todayKey(),
      usageCount: appState.llm?.usageCount || 0,
      dailyLimit: appState.llm?.dailyLimit || 20,
    },
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState));
  } catch (error) {
    console.warn("localStorage save failed", error);
    showStatus("저장소에 저장할 수 없습니다. 브라우저 설정을 확인해 주세요.", "warning");
  }
}

function loadState() {
  const merged = structuredCloneSafe(DEFAULT_STATE);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return merged;
    }

    const parsed = JSON.parse(raw);
    return deepMergeState(merged, parsed);
  } catch (error) {
    console.warn("localStorage load failed", error);
    return merged;
  }
}

function deepMergeState(base, stored) {
  if (!stored || typeof stored !== "object") {
    return base;
  }

  return {
    ...base,
    ...stored,
    health: {
      ...base.health,
      ...(stored.health || {}),
    },
    timer: {
      ...base.timer,
      ...(stored.timer || {}),
    },
    routines: Array.isArray(stored.routines) && stored.routines.length ? stored.routines : base.routines,
    todos: Array.isArray(stored.todos) ? stored.todos : base.todos,
    focusSessions: Array.isArray(stored.focusSessions) ? stored.focusSessions : base.focusSessions,
    memos: Array.isArray(stored.memos) ? stored.memos : base.memos,
    chatHistory: Array.isArray(stored.chatHistory) && stored.chatHistory.length ? stored.chatHistory : base.chatHistory,
    pendingChat: stored.pendingChat && typeof stored.pendingChat === "object" ? stored.pendingChat : base.pendingChat,
    activityLog: Array.isArray(stored.activityLog) ? stored.activityLog : base.activityLog,
    voiceDraft: typeof stored.voiceDraft === "string" ? stored.voiceDraft : base.voiceDraft,
    aiMode: typeof stored.aiMode === "boolean" ? stored.aiMode : base.aiMode,
    auth: {
      users: Array.isArray(stored.auth?.users) ? stored.auth.users : base.auth.users,
      currentUser: typeof stored.auth?.currentUser === "string" ? stored.auth.currentUser : base.auth.currentUser,
    },
    userSettings: stored.userSettings && typeof stored.userSettings === "object" ? stored.userSettings : base.userSettings,
    llm: {
      ...base.llm,
      ...(stored.llm && typeof stored.llm === "object" ? stored.llm : {}),
      provider: typeof stored.llm?.provider === "string" ? stored.llm.provider : base.llm.provider,
      apiKey: typeof stored.llm?.apiKey === "string" ? stored.llm.apiKey : base.llm.apiKey,
      dailyLimit: clampNumber(Number(stored.llm?.dailyLimit ?? base.llm.dailyLimit), 1, 500, 20),
      usageDate: typeof stored.llm?.usageDate === "string" ? stored.llm.usageDate : base.llm.usageDate,
      usageCount: clampNumber(Number(stored.llm?.usageCount ?? base.llm.usageCount), 0, 99999, 0),
    },
  };
}

function resetTodoForm() {
  elements.todoTitle.value = "";
  elements.todoPriority.value = "normal";
  elements.todoDue.value = "";
  elements.todoTime.value = "";
  elements.todoEstimate.value = "30";
  elements.todoNote.value = "";
  elements.todoTitle.focus();
}

function cryptoId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `lps-${Math.random().toString(36).slice(2, 11)}-${Date.now().toString(36)}`;
}

function typeToTitle(type) {
  switch (type) {
    case "todo":
      return "할 일 기록";
    case "timer":
      return "타이머 기록";
    case "routine":
      return "루틴 기록";
    case "voice":
      return "음성 기록";
    case "ai":
      return "AI 기록";
    case "memo":
      return "메모 기록";
    case "chat":
      return "챗봇 기록";
    default:
      return "기록";
  }
}

function sortMemos(memos) {
  return [...memos].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
  });
}

function tagLabel(tag) {
  switch (tag) {
    case "work":
      return "업무";
    case "health":
      return "건강";
    case "idea":
      return "아이디어";
    case "study":
      return "공부";
    default:
      return "일반";
  }
}

function topicParticle(text) {
  const lastChar = text.trim().at(-1);
  if (!lastChar) return "을";
  const code = lastChar.codePointAt(0) - 0xac00;
  if (code < 0 || code > 11171) {
    return /[aeiouAEIOU]$/.test(lastChar) ? "를" : "을";
  }
  return code % 28 === 0 ? "를" : "을";
}

function normalizeText(value) {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTimeMatch(period, hourText, minuteText) {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (period === "오후" && hour < 12) hour += 12;
  if (period === "오전" && hour === 12) hour = 0;
  if (!period && hour === 12) hour = 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function relativeDateKey(keyword) {
  const date = new Date();
  if (keyword === "오늘") return todayKey();
  if (keyword === "내일") date.setDate(date.getDate() + 1);
  if (keyword === "모레") date.setDate(date.getDate() + 2);
  if (keyword === "그저께") date.setDate(date.getDate() - 2);
  return toDateKey(date);
}

function toDateKey(date) {
  return new Date(date).toLocaleDateString("en-CA");
}

function todayKey() {
  return toDateKey(new Date());
}

function dayDiff(dateA, dateB) {
  const a = new Date(`${dateA}T00:00:00`);
  const b = new Date(`${dateB}T00:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function calculateStreak(dates) {
  const uniqueDates = dedupeDates(dates).sort((a, b) => (a > b ? 1 : -1));
  if (!uniqueDates.length) return 0;

  let streak = 1;
  for (let i = uniqueDates.length - 1; i > 0; i -= 1) {
    if (dayDiff(uniqueDates[i], uniqueDates[i - 1]) === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function dedupeDates(dates) {
  return Array.from(new Set(dates));
}

function isSameDay(isoDate, dayKey) {
  return toDateKey(new Date(isoDate)) === dayKey;
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const time = formatter.format(date);
  return isSameDay(isoString, todayKey()) ? `오늘 ${time}` : `${date.toLocaleDateString("ko-KR")} ${time}`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function toMinutes(timeValue) {
  if (!timeValue) return 0;
  const [hour, minute] = timeValue.split(":").map(Number);
  return hour * 60 + minute;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
