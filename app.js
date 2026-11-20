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
import { makeTicket, questionCell, EXILE_CHANCE } from "./exile.js";

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
    else if (kind === "error") tg.HapticFeedback.notificationOccurred("error");
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
const slotsHint = $("slotsHint");
const spinBtn = $("spinBtn");
const againBtn = $("againBtn");
const shareBtn = $("shareBtn");
const acceptBtn = $("acceptBtn");
const takeBtn = $("takeBtn");
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

// ---------- Пулы ----------
const slotHeroes = heroes.filter((h) => !h.prophecyOnly);
const slotPool = slotHeroes.length > 0 ? slotHeroes : heroes;

// ---------- Состояние ----------
let mode = "roulette";
let spinning = false;
let lastShare = null;
let oracleTimer = null;
let toastTimer = null;
let exileTimer = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Хранилище ----------
function storeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function storeSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
function storeDel(key) { try { localStorage.removeItem(key); } catch (_) {} }
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
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
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
        <span class="synergy-numbers">
          <span class="mmr-chip">MMR ${e.mmr}</span>
          <span class="synergy-percent">${e.percent}%</span>
        </span>
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

function roastBlocks(e) {
  return `
    <div class="roast-grid">
      <div class="roast-card roast-sentence">
        <div class="roast-label">⚖️ Приговор оракула</div>
        <div class="roast-text">${e.sentence}</div>
      </div>
      <div class="roast-card roast-excuse">
        <div class="roast-label">🗣 Готовая отмазка</div>
        <div class="roast-text">${e.excuse}</div>
      </div>
    </div>
    <div class="block">
      <h3>⏱ Хроника катки</h3>
      <div class="timeline">
        ${e.timeline.map((t) => `
          <div class="tl-row"><span class="tl-min">${t.min}</span><span class="tl-text">${t.text}</span></div>`).join("")}
      </div>
    </div>
    <div class="block">
      <h3>💬 Чат</h3>
      <div class="chat">
        <div class="chat-bubble chat-team"><span class="chat-who">Тиммейт</span>${e.teamQuote}</div>
        <div class="chat-bubble chat-enemy"><span class="chat-who">Враг</span>${e.enemyQuote}</div>
      </div>
    </div>
    <div class="epitaph">🪦 ${e.epitaph}</div>`;
}

function animateMeters() {
  resultCard.querySelectorAll(".meter-fill").forEach((f) => {
    const v = f.dataset.v || "0";
    f.style.setProperty("--v", "0");
    requestAnimationFrame(() => requestAnimationFrame(() => f.style.setProperty("--v", v)));
  });
}

function hideActionButtons() {
  acceptBtn.classList.add("hidden");
  takeBtn.classList.add("hidden");
  rerollBtn.classList.add("hidden");
}

function revealResult() {
  resultEl.classList.remove("hidden", "pop");
  void resultEl.offsetWidth;
  resultEl.classList.add("pop");
  animateMeters();
  resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Рулетка ----------
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
    <div>
      <span class="build-title">🏷 «${extras.buildTitle}»</span>
      <span class="player-title">🎖 ${extras.playerTitle}</span>
    </div>
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
    ${roastBlocks(extras)}
    <div class="block tips">
      <h3>🔮 ${tips.length > 1 ? "Советы" : "Совет"} оракула</h3>
      <ul>${tips.map((t) => `<li>${t}</li>`).join("")}</ul>
    </div>`;
  hideActionButtons();
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
  setOracle("Оракул передумал. Стало хуже. 🎲");
}

// ---------- Слоты ----------
function fillSlotsIdle() {
  const pools = [
    slotPool.map(heroSlotCell),
    funnyItems.map(textSlotCell),
    playStyles.map((s) => textSlotCell(s.name)),
  ];
  reelTracks.forEach((track, i) => {
    track.parentElement.classList.remove("exile-hit");
    track.style.transition = "none";
    track.style.transform = "translateY(0)";
    track.innerHTML = pools[i].join("");
  });
}

// Вопросы мелькают в ленте, но остановиться могут только все три сразу.
function teasePool(pool) {
  const p = [...pool];
  p.splice(4, 0, questionCell());
  p.splice(13, 0, questionCell());
  p.splice(21, 0, questionCell());
  return p;
}

async function spinSlots() {
  const exile = Math.random() < EXILE_CHANCE;
  const hero = randomItem(slotPool);
  const item = randomItem(funnyItems);
  const style = randomItem(playStyles);

  reelTracks.forEach((t) => t.parentElement.classList.remove("exile-hit"));

  const setups = [
    {
      track: reelTracks[0],
      pool: teasePool(slotPool.map(heroSlotCell)),
      winner: exile ? questionCell() : heroSlotCell(hero),
    },
    {
      track: reelTracks[1],
      pool: teasePool(funnyItems.map(textSlotCell)),
      winner: exile ? questionCell() : textSlotCell(item),
    },
    {
      track: reelTracks[2],
      pool: teasePool(playStyles.map((s) => textSlotCell(s.name))),
      winner: exile ? questionCell() : textSlotCell(style.name),
    },
  ];

  const durations = exile ? [1800, 2900, 4100] : [1600, 2400, 3200];
  const dread = ["Оракул нахмурился…", "Оракул отложил печать…", "Оракул достаёт билет…"];

  const jobs = setups.map((s, i) => {
    const cells = [];
    for (let k = 0; k < 26; k++) cells.push(randomItem(s.pool));
    const winnerIndex = cells.length;
    cells.push(s.winner, randomItem(s.pool), randomItem(s.pool));
    s.track.innerHTML = cells.join("");
    const cellH = s.track.children[0].offsetHeight;

    return glide(s.track, "y", winnerIndex * cellH, durations[i] + Math.random() * 250).then(() => {
      s.track.children[winnerIndex].classList.add("winner");
      if (exile) {
        stopOracleChatter();
        setOracle(dread[i]);
        s.track.parentElement.classList.add("exile-hit");
        haptic(i === 2 ? "error" : "warning");
      } else {
        haptic("selection");
      }
    });
  });

  await Promise.all(jobs);
  return { exile, hero, item, style };
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
      ${roastBlocks(c.extras)}
      <div class="contract-ps">🔮 P.S. ${c.tip}</div>
      <div class="stamp">Принято</div>
    </div>`;
  hideActionButtons();
  acceptBtn.classList.remove("hidden");
  acceptBtn.disabled = false;
  acceptBtn.textContent = "🤝 Принять контракт";
  lastShare = { kind: "contract", data: c };
  revealResult();
}

// ---------- Билет в одну сторону ----------
function renderTicket(t) {
  resultCard.innerHTML = `
    <div class="ticket" id="ticketCard">
      <div class="ticket-head">
        <span class="ticket-title">🎫 Билет в одну сторону</span>
        <span class="ticket-serial">№${t.serial} · рейс ${t.flight}</span>
      </div>

      <div class="ticket-body">
        <div class="ticket-route">
          <div class="route-side">
            <div class="route-code">${t.from}</div>
            <div class="route-full">${t.fromFull}</div>
          </div>
          <div class="route-plane">✈️</div>
          <div class="route-side to">
            <div class="route-code">${t.to}</div>
            <div class="route-full">${t.toFull}</div>
          </div>
        </div>

        <div class="ticket-line"></div>

        <div class="ticket-fields">
          <div class="tf"><div class="tf-label">Пассажир</div><div class="tf-value">${t.passenger}</div></div>
          <div class="tf"><div class="tf-label">Место (K/D/A)</div><div class="tf-value warn">${t.seat}</div></div>
          <div class="tf"><div class="tf-label">Выход</div><div class="tf-value">${t.gate}</div></div>
          <div class="tf"><div class="tf-label">Посадка</div><div class="tf-value good">${t.boarding}</div></div>
          <div class="tf"><div class="tf-label">Часов в доте</div><div class="tf-value">${t.hours}</div></div>
          <div class="tf"><div class="tf-label">Прогресс</div><div class="tf-value warn">${t.progress}</div></div>
        </div>

        <div class="ticket-sad">${t.description}</div>

        <div class="ticket-section-label">🧳 Багаж · разрешено к провозу</div>
        <ul class="ticket-baggage">${t.baggage.map((b) => `<li>${b}</li>`).join("")}</ul>

        <div class="ticket-swap">
          <div class="swap-card leave">
            <div class="swap-label">Что оставляешь</div>
            <div class="swap-text">${t.leave}</div>
          </div>
          <div class="swap-card find">
            <div class="swap-label">Что найдёшь там</div>
            <div class="swap-text">${t.find}</div>
          </div>
        </div>

        <div class="ticket-farewell">🕯 ${t.farewell}</div>
      </div>

      <div class="ticket-stub">
        <div class="barcode"></div>
        <div class="barcode-text">DTA · LOL · ${t.serial} · ONE WAY</div>
      </div>

      <div class="ticket-stamp">Выдан</div>
    </div>`;
  hideActionButtons();
  takeBtn.classList.remove("hidden");
  takeBtn.disabled = false;
  takeBtn.textContent = "🎫 Забрать билет";
  lastShare = { kind: "ticket", data: t };
  revealResult();
}

function takeTicket() {
  if (!lastShare || lastShare.kind !== "ticket") return;
  const card = $("ticketCard");
  if (card) card.classList.add("taken");
  takeBtn.disabled = true;
  takeBtn.textContent = "✓ Билет забран";
  haptic("success");
  showToast("🎫 Билет забран. Оракул не провожает. Он выдохнул.");
}

// ---------- Контракт: принятие ----------
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

// ---------- Спин ----------
async function spin() {
  if (spinning || heroes.length === 0) return;
  spinning = true;
  spinBtn.disabled = true;
  againBtn.disabled = true;
  acceptBtn.disabled = true;
  takeBtn.disabled = true;
  rerollBtn.disabled = true;
  spinBtn.textContent = "🔮 Оракул думает…";
  resultEl.classList.add("hidden");
  document.body.classList.remove("exiled");
  haptic("tap");
  startOracleChatter();

  try {
    if (mode === "roulette") {
      const hero = await spinRoulette();
      haptic("success");
      const res = makeProphecy(hero);
      await wait(450);
      renderProphecy(res);
      setOracle("Судьба сказала своё слово. Приговор оглашён. 📜");
    } else {
      const outcome = await spinSlots();
      if (outcome.exile) {
        stopOracleChatter();
        setOracle("Оракул молчит. Он выписал билет. 🎫");
        document.body.classList.add("exiled");
        clearTimeout(exileTimer);
        exileTimer = setTimeout(() => document.body.classList.remove("exiled"), 2600);
        const ticket = makeTicket(nextSerial());
        await wait(900);
        renderTicket(ticket);
      } else {
        haptic("warning");
        const contract = makeContract(outcome.hero, outcome.item, outcome.style);
        await wait(450);
        renderContract(contract);
        setOracle("Контракт составлен. Смягчающих обстоятельств нет. 🎰");
      }
    }
  } finally {
    stopOracleChatter();
    spinning = false;
    spinBtn.disabled = false;
    againBtn.disabled = false;
    takeBtn.disabled = false;
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
  slotsHint.classList.toggle("hidden", mode !== "slots");
  resultEl.classList.add("hidden");
  hideActionButtons();
  document.body.classList.remove("exiled");
  reelTracks.forEach((t) => t.parentElement.classList.remove("exile-hit"));
  setOracle(mode === "roulette"
    ? "Лента судьбы заряжена. Жми «Крутить»."
    : "Барабаны заряжены злостью. Жми «Крутить». ❓❓❓ — билет.");
  haptic("selection");
}

// ---------- Поделиться ----------
function buildShareText(share) {
  if (share.kind === "ticket") {
    const t = share.data;
    return [
      `🎫 БИЛЕТ В ОДНУ СТОРОНУ №${t.serial} · рейс ${t.flight}`,
      `${t.from} → ${t.to}`,
      `Пассажир: ${t.passenger}`,
      `Место (K/D/A): ${t.seat} · Выход: ${t.gate} · Посадка: ${t.boarding}`,
      `Часов в доте: ${t.hours} · Прогресс: ${t.progress}`,
      "",
      t.description,
      "",
      `🧳 Багаж: ${t.baggage.join(", ")}`,
      `🕯 ${t.farewell}`,
      "❓❓❓ — оракул решил за меня.",
    ].join("\n");
  }
  if (share.kind === "prophecy") {
    const { hero, guide, tips, item, style, extras } = share.data;
    return [
      "🔮 Дота-Оракул выдал мне пророчество:",
      `${hero.emoji} ${hero.name} — «${hero.funName}» (${hero.role})`,
      `📜 Гайд: ${guide.title}`,
      `🏷 Сборка: «${extras.buildTitle}»`,
      `🎖 Титул: ${extras.playerTitle}`,
      `🎁 Модификатор: ${item}`,
      `🎭 Стиль: ${style.name}`,
      `⚗️ Синергия: ${extras.percent}% (MMR ${extras.mmr}) — ${extras.verdict}`,
      `⚖️ Приговор: ${extras.sentence}`,
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
    `⚗️ Сборка «${c.extras.buildTitle}» — синергия ${c.extras.percent}% (MMR ${c.extras.mmr})`,
    `⚖️ Приговор: ${c.extras.sentence}`,
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
    showToast("Сначала крути — потом делись позором 🔮");
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
    ? "📋 Скопировано. Кидай в чат, пусть тоже страдают."
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
  takeBtn.addEventListener("click", takeTicket);
  rerollBtn.addEventListener("click", rerollVerdict);
  bannerDone.addEventListener("click", finishContract);
  modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
}

init();