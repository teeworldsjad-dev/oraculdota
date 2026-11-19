import heroes from "./heroes/index.js";
import {
  advices,
  oraclePhrases,
  funnyItems,
  playStyles,
  randomItem,
  randomItems,
  randomInt,
} from "./random.js";

// ---------- Telegram (не обязателен: вне Telegram это обычный сайт) ----------
const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg && tg.platform && tg.platform !== "unknown");

tg?.ready();
tg?.expand();
if (inTelegram && tg.isVersionAtLeast("6.1")) {
  tg.setHeaderColor("#0d0716");
  tg.setBackgroundColor("#0d0716");
}
if (inTelegram && tg.isVersionAtLeast("7.7")) {
  tg.disableVerticalSwipes(); // чтобы апп не закрывался случайным свайпом
}

function haptic(kind) {
  if (!inTelegram || !tg.HapticFeedback || !tg.isVersionAtLeast("6.1")) return;
  try {
    if (kind === "success") tg.HapticFeedback.notificationOccurred("success");
    else if (kind === "selection") tg.HapticFeedback.selectionChanged();
    else tg.HapticFeedback.impactOccurred("light");
  } catch (_) { /* хаптик не критичен */ }
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const oracleEl = $("oracle");
const stageEl = $("stage");
const rouletteEl = $("roulette");
const rouletteTrack = $("rouletteTrack");
const slotsEl = $("slots");
const spinBtn = $("spinBtn");
const againBtn = $("againBtn");
const shareBtn = $("shareBtn");
const resultEl = $("result");
const resultCard = $("resultCard");
const toastEl = $("toast");
const emptyEl = $("empty");
const modeButtons = document.querySelectorAll(".mode-btn");
const reelTracks = [$("reelHeroes"), $("reelItems"), $("reelStyles")];

// ---------- Состояние ----------
let mode = "roulette";
let spinning = false;
let lastResult = null;
let oracleTimer = null;
let toastTimer = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Мелкие помощники ----------
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

function setOracle(text) { oracleEl.textContent = text; }

function startOracleChatter() {
  clearInterval(oracleTimer);
  oracleEl.classList.add("thinking");
  setOracle(randomItem(oraclePhrases));
  oracleTimer = setInterval(() => setOracle(randomItem(oraclePhrases)), 650);
}

function stopOracleChatter() {
  clearInterval(oracleTimer);
  oracleEl.classList.remove("thinking");
}

const rouletteCell = (h) =>
  `<div class="r-cell"><span class="r-emoji">${h.emoji}</span><span class="r-name">${h.name}</span></div>`;
const heroSlotCell = (h) =>
  `<div class="s-cell"><span class="s-emoji">${h.emoji}</span><span>${h.name}</span></div>`;
const textSlotCell = (t) => `<div class="s-cell"><span>${t}</span></div>`;

// Плавный разгон и остановка ленты через transform.
// Резолвится по transitionend, страховочный таймер — на случай reduced motion.
function glide(track, axis, distance, duration) {
  return new Promise((resolve) => {
    const move = (px) => (axis === "x" ? `translateX(${px}px)` : `translateY(${px}px)`);
    track.style.transition = "none";
    track.style.transform = move(0);
    void track.offsetWidth; // форсируем reflow, чтобы старт был с нуля
    track.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.75, 0.12, 1)`;
    track.style.transform = move(-distance);
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    track.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, duration + 150);
  });
}

// ---------- Рулетка ----------
function fillRouletteIdle() {
  rouletteTrack.style.transition = "none";
  rouletteTrack.style.transform = "translateX(0)";
  rouletteTrack.innerHTML = [...heroes, ...heroes].map(rouletteCell).join("");
}

async function spinRoulette() {
  const hero = randomItem(heroes);

  // Длинная случайная лента, победитель — ближе к концу.
  const cells = [];
  for (let i = 0; i < heroes.length * 3 + 8; i++) cells.push(randomItem(heroes));
  const winnerIndex = cells.length;
  cells.push(hero, randomItem(heroes), randomItem(heroes), randomItem(heroes));
  rouletteTrack.innerHTML = cells.map(rouletteCell).join("");

  const first = rouletteTrack.children[0];
  const step = rouletteTrack.children[1].offsetLeft - first.offsetLeft;
  const jitter = (Math.random() - 0.5) * first.offsetWidth * 0.4;
  const distance =
    first.offsetLeft + winnerIndex * step + first.offsetWidth / 2 - rouletteEl.clientWidth / 2 + jitter;

  await glide(rouletteTrack, "x", distance, 4200 + Math.random() * 600);
  rouletteTrack.children[winnerIndex].classList.add("winner");
  return { hero, bonus: null };
}

// ---------- Слоты ----------
function fillSlotsIdle() {
  const pools = [heroes.map(heroSlotCell), funnyItems.map(textSlotCell), playStyles.map(textSlotCell)];
  reelTracks.forEach((track, i) => {
    track.style.transition = "none";
    track.style.transform = "translateY(0)";
    track.innerHTML = pools[i].join("");
  });
}

async function spinSlots() {
  const hero = randomItem(heroes);
  const item = randomItem(funnyItems);
  const style = randomItem(playStyles);

  const setups = [
    { track: reelTracks[0], pool: heroes.map(heroSlotCell), winner: heroSlotCell(hero) },
    { track: reelTracks[1], pool: funnyItems.map(textSlotCell), winner: textSlotCell(item) },
    { track: reelTracks[2], pool: playStyles.map(textSlotCell), winner: textSlotCell(style) },
  ];
  const durations = [1600, 2400, 3200]; // барабаны останавливаются по очереди

  const jobs = setups.map((s, i) => {
    const cells = [];
    for (let k = 0; k < 26; k++) cells.push(randomItem(s.pool));
    const winnerIndex = cells.length;
    cells.push(s.winner, randomItem(s.pool), randomItem(s.pool));
    s.track.innerHTML = cells.join("");

    const cellH = s.track.children[0].offsetHeight;
    return glide(s.track, "y", winnerIndex * cellH, durations[i] + Math.random() * 250).then(() => {
      s.track.children[winnerIndex].classList.add("winner");
      haptic("selection");
    });
  });

  await Promise.all(jobs);
  return { hero, bonus: { item, style } };
}

// ---------- Результат ----------
function makeResult(hero, bonus) {
  return {
    hero,
    guide: randomItem(hero.guides),
    tips: randomItems(advices, randomInt(1, 2)),
    bonus,
  };
}

function renderResult(res) {
  const { hero, guide, tips, bonus } = res;
  resultCard.innerHTML = `
    <div class="hero-head">
      <div class="hero-emoji">${hero.emoji}</div>
      <div class="hero-titles">
        <div class="hero-name">${hero.name}</div>
        <div class="hero-fun">«${hero.funName}»</div>
      </div>
      <div class="hero-role">${hero.role}</div>
    </div>
    <div class="guide-title">📜 ${guide.title}</div>
    <p class="mission">${guide.mission}</p>
    ${bonus ? `<div class="bonus">🎰 Бонус барабанов: предмет <b>«${bonus.item}»</b> и стиль игры <b>«${bonus.style}»</b>. Совмести несовместимое.</div>` : ""}
    <div class="block">
      <h3>🎒 Сборка</h3>
      <ul class="items">${guide.items.map((i) => `<li>${i}</li>`).join("")}</ul>
    </div>
    <div class="block">
      <h3>🗺️ План игры</h3>
      <ol class="plan">${guide.plan.map((s) => `<li>${s}</li>`).join("")}</ol>
    </div>
    <blockquote class="phrase">💬 ${guide.phrase}</blockquote>
    <div class="block tips">
      <h3>🔮 ${tips.length > 1 ? "Советы" : "Совет"} оракула</h3>
      <ul>${tips.map((t) => `<li>${t}</li>`).join("")}</ul>
    </div>`;

  resultEl.classList.remove("hidden", "pop");
  void resultEl.offsetWidth;
  resultEl.classList.add("pop");
  resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Главный спин ----------
async function spin() {
  if (spinning || heroes.length === 0) return;
  spinning = true;
  spinBtn.disabled = true;
  againBtn.disabled = true;
  spinBtn.textContent = "🔮 Оракул думает…";
  resultEl.classList.add("hidden");
  haptic("tap");
  startOracleChatter();

  try {
    const outcome = mode === "roulette" ? await spinRoulette() : await spinSlots();
    haptic("success");
    lastResult = makeResult(outcome.hero, outcome.bonus);
    await wait(450); // пауза, чтобы полюбить победителя
    renderResult(lastResult);
    setOracle("Судьба сказала своё слово. Читай и удивляйся. 📜");
  } finally {
    stopOracleChatter();
    spinning = false;
    spinBtn.disabled = false;
    againBtn.disabled = false;
    spinBtn.textContent = "🎲 Крутить";
  }
}

// ---------- Режимы ----------
function setMode(next) {
  if (spinning || mode === next) return;
  mode = next;
  modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  rouletteEl.classList.toggle("hidden", mode !== "roulette");
  slotsEl.classList.toggle("hidden", mode !== "slots");
  resultEl.classList.add("hidden");
  setOracle(mode === "roulette"
    ? "Лента судьбы заряжена. Жми «Крутить»."
    : "Барабаны заряжены абсурдом. Жми «Крутить».");
  haptic("selection");
}

// ---------- Поделиться ----------
function buildShareText(res) {
  const { hero, guide, tips, bonus } = res;
  return [
    "🔮 Дота-Оракул выдал мне героя:",
    `${hero.emoji} ${hero.name} — «${hero.funName}» (${hero.role})`,
    `📜 Гайд: ${guide.title}`,
    `🎒 Сборка: ${guide.items.join(", ")}`,
    bonus ? `🎰 Бонус: «${bonus.item}» + стиль «${bonus.style}»` : null,
    `💬 ${guide.phrase}`,
    `✨ Совет: ${tips[0]}`,
  ].filter(Boolean).join("\n");
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* пробуем запасной способ */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

async function shareResult() {
  if (!lastResult) {
    showToast("Сначала крути — потом делись судьбой 🔮");
    return;
  }
  haptic("tap");
  const text = buildShareText(lastResult);
  const pageUrl = location.protocol.startsWith("http") ? location.href.split("#")[0] : "";

  if (inTelegram && tg.openTelegramLink) {
    const shareUrl = "https://t.me/share/url?"
      + (pageUrl ? "url=" + encodeURIComponent(pageUrl) + "&" : "")
      + "text=" + encodeURIComponent(text);
    try {
      tg.openTelegramLink(shareUrl);
      return;
    } catch (_) { /* не вышло — копируем текст */ }
  }

  const copied = await copyText(pageUrl ? text + "\n\n" + pageUrl : text);
  showToast(copied
    ? "📋 Гайд скопирован! Кидай друзьям в чат."
    : "😅 Не получилось скопировать. Попробуй ещё раз.");
}

// ---------- Старт ----------
function init() {
  if (heroes.length === 0) {
    stageEl.classList.add("hidden");
    spinBtn.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    setOracle("Оракул ушёл в отпуск.");
    return;
  }
  fillRouletteIdle();
  fillSlotsIdle();
  spinBtn.addEventListener("click", spin);
  againBtn.addEventListener("click", spin);
  shareBtn.addEventListener("click", shareResult);
  modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
}

init();