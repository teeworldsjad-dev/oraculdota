import heroes from "./heroes/index.js";
import {
  advices,
  oraclePhrases,
  funnyItems,
  playStyles,
  oaths,
  bans,
  winConditions,
  rewards,
  titles,
  comboLines,
  randomItem,
  randomItems,
  randomInt,
} from "./random.js";
import { generateExtras } from "./generator.js";

// ---------- Telegram ----------
const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg && tg.platform && tg.platform !== "unknown");

tg?.ready();
tg?.expand();
if (inTelegram && tg.isVersionAtLeast("6.1")) {
  tg.setHeaderColor("#070a14");
  tg.setBackgroundColor("#070a14");
}
if (inTelegram && tg.isVersionAtLeast("7.7")) {
  tg.disableVerticalSwipes();
}

function haptic(kind) {
  if (!inTelegram || !tg.HapticFeedback || !tg.isVersionAtLeast("6.1")) return;
  try {
    if (kind === "success") tg.HapticFeedback.notificationOccurred("success");
    else if (kind === "warning") tg.HapticFeedback.notificationOccurred("warning");
    else if (kind === "selection") tg.HapticFeedback.selectionChanged();
    else tg.HapticFeedback.impactOccurred("light");
  } catch (_) {}
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
const acceptBtn = $("acceptBtn");
const rerollBtn = $("rerollBtn");
const resultEl = $("result");
const resultCard = $("resultCard");
const toastEl = $("toast");
const emptyEl = $("empty");
const bannerEl = $("contractBanner");
const bannerText = $("bannerText");
const bannerDone = $("bannerDone");
const modeButtons = document.querySelectorAll(".mode-btn");
const reelTracks = [$("reelHeroes"), $("reelItems"), $("reelStyles")];

// ---------- Пулы героев ----------
const slotHeroes = heroes.filter((h) => !h.prophecyOnly);
const slotPool = slotHeroes.length > 0 ? slotHeroes : heroes;

// ---------- Состояние ----------
let mode = "roulette";
let spinning = false;
let lastShare = null; // { kind: "prophecy" | "contract", data }
let oracleTimer = null;
let toastTimer = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Хранилище ----------
function storeGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}
function storeDel(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}
function nextSerial() {
  const n = (parseInt(storeGet("oracle_serial") || "0", 10) || 0) + 1;
  storeSet("oracle_serial", String(n));
  return String(n).padStart(4, "0");
}

// ---------- Мелочи ----------
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

function glide(track, axis, distance, duration) {
  return new Promise((resolve) => {
    const move = (px) => (axis === "x" ? `translateX(${px}px)` : `translateY(${px}px)`);
    track.style.transition = "none";
    track.style.transform = move(0);
    void track.offsetWidth;
    track.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.75, 0.12, 1)`;
    track.style.transform = move(-distance);
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    track.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, duration + 150);
  });
}

function heroHead(hero) {
  return `
    <div class="hero-head">
      <div class="hero-emoji">${hero.emoji}</div>
      <div class="hero-titles">
        <div class="hero-name">${hero.name}</div>
        <div class="hero-fun">«${hero.funName}»</div>
      </div>
      <div class="hero-role">${hero.role}</div>
    </div>`;
}

function synergyBlock(e) {
  return `
    <div class="synergy tier-${e.tier}">
      <div class="synergy-head">
        <span class="synergy-label">⚗️ Синергия сборки</span>
        <span class="synergy-percent">${e.percent}%</span>
      </div>
      <div class="meter"><div class="meter-fill" data-v="${(e.percent / 100).toFixed(2)}"></div></div>
      <div class="verdict">${e.verdict}</div>
      <div class="oracle-lines">
        <p>${e.triple}</p>
        <p>${e.styleLine}</p>
        <p>${e.heroLine}</p>
      </div>
    </div>`;
}

function animateMeters() {
  resultCard.querySelectorAll(".meter-fill").forEach((f) => {
    const v = f.dataset.v || "0";
    f.style.setProperty("--v", "0");
    requestAnimationFrame(() => requestAnimationFrame(() => f.style.setProperty("--v", v)));
  });
}

function revealResult() {
  resultEl.classList.remove("hidden", "pop");
  void resultEl.offsetWidth;
  resultEl.classList.add("pop");
  animateMeters();
  resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Рулетка: пророчество ----------
function fillRouletteIdle() {
  rouletteTrack.style.transition = "none";
  rouletteTrack.style.transform = "translateX(0)";
  rouletteTrack.innerHTML = [...heroes, ...heroes].map(rouletteCell).join("");
}

async function spinRoulette() {
  const hero = randomItem(heroes);
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
  return hero;
}

function makeProphecy(hero) {
  const guide = randomItem(hero.guides);
  const item = randomItem(funnyItems);
  const style = randomItem(playStyles);
  const salt = 0;
  return {
    hero, guide, item, style, salt,
    tips: randomItems(advices, randomInt(1, 2)),
    extras: generateExtras({ hero, item, style, items: guide.items, salt }),
  };
}

function renderProphecy(res) {
  const { hero, guide, tips, item, style, extras } = res;
  resultCard.innerHTML = `
    ${heroHead(hero)}
    <div class="guide-title">📜 ${guide.title}</div>
    <p class="mission">${guide.mission}</p>
    <div class="build-title">🏷 «${extras.buildTitle}»</div>
    <div class="block">
      <h3>🎒 Сборка · вердикт на каждый предмет</h3>
      <div class="item-list">
        ${extras.itemNotes.map((n) => `
          <div class="item-row">
            <div class="item-name">${n.name}</div>
            <div class="item-note">${n.note}</div>
            <div class="item-stat">${n.stat}</div>
          </div>`).join("")}
      </div>
    </div>
    <div class="block">
      <h3>🗺️ План игры</h3>
      <ol class="plan">${guide.plan.map((s) => `<li>${s}</li>`).join("")}</ol>
    </div>
    <blockquote class="phrase">💬 ${guide.phrase}</blockquote>
    <div class="block">
      <h3>🎰 Скрытые модификаторы пророчества</h3>
      <div class="contract-reels">
        <span class="chip chip-item">🎁 ${item}</span>
        <span class="chip chip-style">🎭 ${style.name}</span>
      </div>
    </div>
    ${synergyBlock(extras)}
    <div class="block tips">
      <h3>🔮 ${tips.length > 1 ? "Советы" : "Совет"} оракула</h3>
      <ul>${tips.map((t) => `<li>${t}</li>`).join("")}</ul>
    </div>`;
  acceptBtn.classList.add("hidden");
  rerollBtn.classList.remove("hidden");
  rerollBtn.disabled = false;
  lastShare = { kind: "prophecy", data: res };
  revealResult();
}

function rerollVerdict() {
  if (spinning || !lastShare || lastShare.kind !== "prophecy") return;
  const res = lastShare.data;
  res.salt += 1;
  res.extras = generateExtras({
    hero: res.hero, item: res.item, style: res.style, items: res.guide.items, salt: res.salt,
  });
  haptic("selection");
  renderProphecy(res);
  setOracle("Оракул передумал. Бывает. 🎲");
}

// ---------- Слоты: контракт ----------
function fillSlotsIdle() {
  const pools = [
    slotPool.map(heroSlotCell),
    funnyItems.map(textSlotCell),
    playStyles.map((s) => textSlotCell(s.name)),
  ];
  reelTracks.forEach((track, i) => {
    track.style.transition = "none";
    track.style.transform = "translateY(0)";
    track.innerHTML = pools[i].join("");
  });
}

async function spinSlots() {
  const hero = randomItem(slotPool);
  const item = randomItem(funnyItems);
  const style = randomItem(playStyles);

  const setups = [
    { track: reelTracks[0], pool: slotPool.map(heroSlotCell), winner: heroSlotCell(hero) },
    { track: reelTracks[1], pool: funnyItems.map(textSlotCell), winner: textSlotCell(item) },
    { track: reelTracks[2], pool: playStyles.map((s) => textSlotCell(s.name)), winner: textSlotCell(style.name) },
  ];
  const durations = [1600, 2400, 3200];

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
  return { hero, item, style };
}

function findCombo(hero, item, style) {
  for (const c of comboLines) {
    if (c.heroId && c.heroId !== hero.id) continue;
    if (c.item && c.item !== item) continue;
    if (c.style && c.style !== style.name) continue;
    return c.text;
  }
  return null;
}

function makeContract(hero, item, style) {
  return {
    serial: nextSerial(),
    hero, item, style,
    title: randomItem(titles),
    oath: randomItem(oaths),
    ban: randomItem(bans),
    win: randomItem(winConditions),
    reward: randomItem(rewards),
    tip: randomItem(advices),
    combo: findCombo(hero, item, style),
    extras: generateExtras({ hero, item, style, items: [item], salt: 0 }),
  };
}

function renderContract(c) {
  const note = c.extras.itemNotes[0];
  resultCard.innerHTML = `
    <div class="contract" id="contractCard">
      <div class="contract-top">
        <span class="contract-serial">Контракт №${c.serial}</span>
        <span class="contract-seal">заверено оракулом</span>
      </div>
      ${heroHead(c.hero)}
      <div class="contract-reels">
        <span class="chip chip-style">🎭 ${c.style.name}</span>
        <span class="chip chip-item">🎁 ${c.item}</span>
        <span class="chip chip-title">🏷 ${c.title}</span>
      </div>
      <div class="build-title">⚗️ «${c.extras.buildTitle}»</div>
      <div class="style-desc">${c.style.desc}</div>
      ${note ? `
        <div class="item-row" style="margin-top:12px">
          <div class="item-name">${note.name}</div>
          <div class="item-note">${note.note}</div>
          <div class="item-stat">${note.stat}</div>
        </div>` : ""}
      ${c.combo ? `<div class="combo">⚡ Комбо: ${c.combo}</div>` : ""}
      ${synergyBlock(c.extras)}
      <div class="contract-grid">
        <div class="clause"><h4>📜 Обет</h4><p>${c.oath}</p></div>
        <div class="clause"><h4>🚫 Запрет</h4><p>${c.ban}</p></div>
        <div class="clause"><h4>🏆 Победа засчитывается, если</h4><p>${c.win}</p></div>
        <div class="clause"><h4>🎁 Награда</h4><p>${c.reward}</p></div>
      </div>
      <div class="contract-ps">🔮 P.S. ${c.tip}</div>
      <div class="stamp">Принято</div>
    </div>`;
  acceptBtn.classList.remove("hidden");
  acceptBtn.disabled = false;
  acceptBtn.textContent = "🤝 Принять контракт";
  rerollBtn.classList.add("hidden");
  lastShare = { kind: "contract", data: c };
  revealResult();
}

// ---------- Контракт: принятие / завершение ----------
function refreshBanner() {
  const raw = storeGet("oracle_contract");
  if (!raw) { bannerEl.classList.add("hidden"); return; }
  try {
    const c = JSON.parse(raw);
    bannerText.textContent = `${c.hero.emoji} ${c.hero.name} · ${c.style.name} · №${c.serial}`;
    bannerEl.classList.remove("hidden");
  } catch (_) {
    bannerEl.classList.add("hidden");
  }
}

function acceptContract() {
  if (!lastShare || lastShare.kind !== "contract") return;
  storeSet("oracle_contract", JSON.stringify(lastShare.data));
  const card = $("contractCard");
  if (card) card.classList.add("accepted");
  acceptBtn.disabled = true;
  acceptBtn.textContent = "✓ Принято";
  refreshBanner();
  haptic("success");
  showToast("🤝 Контракт принят. Оракул следит. Он всегда следит.");
}

function finishContract() {
  storeDel("oracle_contract");
  refreshBanner();
  const card = $("contractCard");
  if (card) card.classList.remove("accepted");
  if (lastShare && lastShare.kind === "contract") {
    acceptBtn.disabled = false;
    acceptBtn.textContent = "🤝 Принять контракт";
  }
  haptic("selection");
  showToast("📜 Контракт закрыт. Оракул делает вид, что гордится.");
}

// ---------- Главный спин ----------
async function spin() {
  if (spinning || heroes.length === 0) return;
  spinning = true;
  spinBtn.disabled = true;
  againBtn.disabled = true;
  acceptBtn.disabled = true;
  rerollBtn.disabled = true;
  spinBtn.textContent = "🔮 Оракул думает…";
  resultEl.classList.add("hidden");
  haptic("tap");
  startOracleChatter();

  try {
    if (mode === "roulette") {
      const hero = await spinRoulette();
      haptic("success");
      const res = makeProphecy(hero);
      await wait(450);
      renderProphecy(res);
      setOracle("Судьба сказала своё слово. Синергия посчитана. 📜");
    } else {
      const { hero, item, style } = await spinSlots();
      haptic("warning");
      const contract = makeContract(hero, item, style);
      await wait(450);
      renderContract(contract);
      setOracle("Контракт составлен. Подписывай кровью. Или кнопкой. 🎰");
    }
  } finally {
    stopOracleChatter();
    spinning = false;
    spinBtn.disabled = false;
    againBtn.disabled = false;
    rerollBtn.disabled = false;
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
  acceptBtn.classList.add("hidden");
  rerollBtn.classList.add("hidden");
  setOracle(mode === "roulette"
    ? "Лента судьбы заряжена. Жми «Крутить»."
    : "Барабаны заряжены абсурдом. Жми «Крутить».");
  haptic("selection");
}

// ---------- Поделиться ----------
function buildShareText(share) {
  if (share.kind === "prophecy") {
    const { hero, guide, tips, item, style, extras } = share.data;
    return [
      "🔮 Дота-Оракул выдал мне пророчество:",
      `${hero.emoji} ${hero.name} — «${hero.funName}» (${hero.role})`,
      `📜 Гайд: ${guide.title}`,
      `🏷 Сборка: «${extras.buildTitle}»`,
      `🎁 Модификатор: ${item}`,
      `🎭 Стиль: ${style.name}`,
      `⚗️ Синергия: ${extras.percent}% — ${extras.verdict}`,
      `💬 ${guide.phrase}`,
      `✨ Совет: ${tips[0]}`,
    ].join("\n");
  }
  const c = share.data;
  return [
    `🎰 Контракт №${c.serial} · Дота-Оракул`,
    `${c.hero.emoji} ${c.hero.name} — «${c.hero.funName}»`,
    `🎭 Стиль: ${c.style.name}`,
    `🏷 Титул: ${c.title}`,
    `⚗️ Сборка «${c.extras.buildTitle}» — синергия ${c.extras.percent}%`,
    `📜 Обет: ${c.oath}`,
    `🚫 Запрет: ${c.ban}`,
    `🏆 Победа засчитывается, если ${c.win}`,
    `🎁 Награда: ${c.reward}`,
    "Сможешь хуже?",
  ].join("\n");
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
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
  if (!lastShare) {
    showToast("Сначала крути — потом делись судьбой 🔮");
    return;
  }
  haptic("tap");
  const text = buildShareText(lastShare);
  const pageUrl = location.protocol.startsWith("http") ? location.href.split("#")[0] : "";

  if (inTelegram && tg.openTelegramLink) {
    const shareUrl = "https://t.me/share/url?"
      + (pageUrl ? "url=" + encodeURIComponent(pageUrl) + "&" : "")
      + "text=" + encodeURIComponent(text);
    try {
      tg.openTelegramLink(shareUrl);
      return;
    } catch (_) {}
  }

  const copied = await copyText(pageUrl ? text + "\n\n" + pageUrl : text);
  showToast(copied
    ? "📋 Скопировано! Кидай друзьям в чат."
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
  refreshBanner();
  spinBtn.addEventListener("click", spin);
  againBtn.addEventListener("click", spin);
  shareBtn.addEventListener("click", shareResult);
  acceptBtn.addEventListener("click", acceptContract);
  rerollBtn.addEventListener("click", rerollVerdict);
  bannerDone.addEventListener("click", finishContract);
  modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
}

init();