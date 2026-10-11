/* THINKLOPEDIA Topic Swipe: static, no secrets. Decisions live in localStorage and go to Rika by iMessage. */
(() => {
"use strict";
const RIKA = "+16282988776";
const KEY = "tk.decisions.v1", HKEY = "tk.history.v1";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = () => { localStorage.setItem(KEY, JSON.stringify(local)); localStorage.setItem(HKEY, JSON.stringify(history.slice(-50))); };

let topics = [], byId = new Map();
let local = load(KEY, {});          // id -> {status, at, base, sent}
let history = load(HKEY, []);       // [{id, prev}]
let tab = "pending", fmt = "all", busy = false;

/* ---------- status model ---------- */
const repoStatus = t => (t.status || "pending").toLowerCase();
function effective(t) {
  const repo = repoStatus(t), L = local[t.id];
  if (!L) return repo;
  if (L.base !== repo) { delete local[t.id]; return repo; }   // Rika synced something newer: repo wins
  return L.status;
}
function reconcile() { topics.forEach(effective); save(); }
const isPendingLike = s => s === "pending" || s === "later";
function deckIds() {
  const p = [], l = [];
  for (const t of topics) {
    const s = effective(t);
    if (!isPendingLike(s)) continue;
    if (fmt !== "all" && t.format !== fmt) continue;
    (s === "later" ? l : p).push(t);
  }
  l.sort((a, b) => local[a.id].at - local[b.id].at);
  return [...p, ...l].map(t => t.id);
}
function counts() {
  let c = { pending: 0, approved: 0, rejected: 0, later: 0 };
  for (const t of topics) { const s = effective(t); if (s === "later") { c.later++; c.pending++; } else if (s === "done") c.approved++; else if (c[s] !== undefined) c[s]++; }
  return c;
}
const unsent = () => Object.entries(local).filter(([id, L]) => !L.sent && byId.has(+id)).map(([id]) => +id);
const sentUnsynced = () => Object.entries(local).filter(([id, L]) => L.sent && byId.has(+id)).map(([id]) => +id);

function decide(id, status, { record = true } = {}) {
  const t = byId.get(id); if (!t) return;
  const prev = local[id] ? { ...local[id] } : null;
  const repo = repoStatus(t);
  if (status === repo) delete local[id];
  else local[id] = { status, at: Date.now(), base: repo, sent: false };
  if (record) history.push({ id, prev });
  save();
}
function undo() {
  const h = history.pop(); if (!h) return null;
  if (h.prev) local[h.id] = h.prev; else delete local[h.id];
  save(); return h.id;
}

/* ---------- haptics ---------- */
const hapticLabel = $(".haptic");
function haptic(ms = 10) {
  try { if (navigator.vibrate && navigator.vibrate(ms)) return; } catch {}
  try { hapticLabel.click(); } catch {}            // iOS 18+ Safari: switch toggle gives a light tap
}

/* ---------- rendering ---------- */
function cardHTML(t, i) {
  const facts = (t.facts || []).map(f => `<li>${esc(f)}</li>`).join("");
  const srcs = (t.sources || []).slice(0, 3).map(s => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(shortLabel(s.label))}</a>`).join("");
  const s = effective(t);
  return `<article class="card${i ? " back" : ""}" data-id="${t.id}">
    <div class="glow"></div>
    <div class="topline"><span class="pill${t.format === "Long" ? " long" : ""}">${t.format === "Long" ? "Long video" : "Short"}</span><span class="pill cat">${esc(t.category)}</span>${s === "later" ? '<span class="status-tag st-later">Later</span>' : ""}<span class="num">#${t.id}</span></div>
    <h2>${esc(t.title)}</h2>
    <p class="hook">“${esc(String(t.hook).replace(/^["“']|["”']$/g, ""))}”</p>
    <ul class="facts">${facts}</ul>
    <div class="meta">
      <div class="row"><span class="k">Why now</span><span class="v">${esc(t.why_now)}</span></div>
      <div class="row risk"><span class="k">Risk</span><span class="v">${esc(t.risk)}</span></div>
      <div class="srcs">${srcs}</div>
    </div>
    <div class="stamp yes">APPROVE</div><div class="stamp no">NOPE</div><div class="stamp later">LATER</div>
  </article>`;
}
const shortLabel = l => String(l || "Source").replace(/^Wikipedia: /, "Wikipedia · ").slice(0, 34);

function renderDeck(enterFrom) {
  const deck = $("#deck"), ids = deckIds();
  const c = counts();
  $("#laterNote").hidden = !c.later; $("#laterNote").textContent = `${c.later} for later`;
  if (!ids.length) {
    const n = unsent().length;
    deck.innerHTML = `<div class="empty"><img src="icons/mark.svg" alt=""><div class="big">All caught up</div><div>${topics.length ? (n ? `${n} pick${n > 1 ? "s" : ""} ready to send.` : "Rika will add new topics here.") : "Loading topics…"}</div>${n ? '<button class="btn primary" id="emptySend" style="margin-top:8px;padding:13px 20px">Send to Rika</button>' : ""}</div>`;
    const b = $("#emptySend"); if (b) b.onclick = openSend;
  } else {
    const top3 = ids.slice(0, 3).map(id => byId.get(id));
    deck.innerHTML = top3.map((t, i) => cardHTML(t, i)).reverse().join("");
    layoutBack(0);
    const top = topCard();
    if (enterFrom) {
      const x = { yes: 1, no: -1, later: 0 }[enterFrom] * (innerWidth + 100), y = enterFrom === "later" ? -innerHeight : 0;
      top.style.transition = "none"; top.style.transform = `translate(${x}px,${y}px) rotate(${x * 0.03}deg)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { top.style.transition = "transform .55s cubic-bezier(.2,1.25,.4,1)"; top.style.transform = ""; }));
    }
    bindDrag(top);
  }
  $("#undoBtn").disabled = !history.length;
  ["noBtn", "yesBtn", "laterBtn", "infoBtn"].forEach(b => $("#" + b).disabled = !ids.length);
}
const topCard = () => { const cs = $("#deck").querySelectorAll(".card"); return cs[cs.length - 1]; };
function layoutBack(p) {        // p: 0..1 drag progress pulls the next card forward
  const cs = [...$("#deck").querySelectorAll(".card")].reverse();
  cs.forEach((c, i) => {
    if (!i) return;
    const d = Math.max(0, i - p);
    c.style.transform = `translateY(${d * 12}px) scale(${1 - d * 0.045})`;
    c.style.opacity = d > 1.6 ? 0.5 : 1;
  });
}

function renderLists() {
  const mk = (arr, empty) => {
    if (!arr.length) return `<div class="list-empty"><b>${empty[0]}</b>${empty[1]}</div>`;
    return arr.map((t, i) => {
      const L = local[t.id], s = effective(t);
      const synced = !L;
      const flag = L ? (L.sent ? '<span class="flag sent">sent · awaiting sync</span>' : '<span class="flag unsent">not sent yet</span>') : (s === "done" ? '<span class="flag synced">made ✓</span>' : '<span class="flag synced">synced</span>');
      return `<button class="item" data-id="${t.id}" style="animation-delay:${Math.min(i, 10) * 30}ms"><span class="ix">${t.id}</span><span class="body"><span class="t">${esc(t.title)}</span><span class="s">${t.format === "Long" ? "Long video" : "Short"}<i class="dot"></i>${esc(t.category)}<i class="dot"></i>${flag}${t.note ? `<span class="flag note">${esc(t.note)}</span>` : ""}</span></span>${synced ? "" : '<span class="mini">Undo</span>'}</button>`;
    }).join("");
  };
  const sortFn = (a, b) => ((local[b.id]?.at || 0) - (local[a.id]?.at || 0)) || (a.id - b.id);
  const ap = topics.filter(t => ["approved", "done"].includes(effective(t))).sort(sortFn);
  const rj = topics.filter(t => effective(t) === "rejected").sort(sortFn);
  $("#listApproved").innerHTML = mk(ap, ["Nothing approved yet", "Swipe right on a topic you want made."]);
  $("#listRejected").innerHTML = mk(rj, ["Nothing rejected", "Swipe left to toss a topic."]);
  document.querySelectorAll(".item").forEach(el => el.onclick = e => {
    const id = +el.dataset.id;
    if (e.target.closest(".mini")) { decide(id, "pending"); haptic(); toast(`#${id} back to Pending`, () => { undo(); renderAll(); }); renderAll(); }
    else openDetail(id);
  });
}
function renderCounts() {
  const c = counts();
  $("#cPending").textContent = c.pending; $("#cApproved").textContent = c.approved; $("#cRejected").textContent = c.rejected;
  const n = unsent().length, b = $("#sendBadge");
  b.hidden = !n; b.textContent = n;
  $("#sendBtn").classList.toggle("idle", !n);
}
function renderAll(enterFrom) { renderCounts(); renderDeck(enterFrom); renderLists(); }

/* ---------- drag physics ---------- */
function bindDrag(card) {
  if (!card) return;
  let sx, sy, dx = 0, dy = 0, t0, pts = [], dragging = false, armed = null, pid = null;
  const stamps = { yes: $(".stamp.yes", card), no: $(".stamp.no", card), later: $(".stamp.later", card) }, glow = $(".glow", card);
  card.addEventListener("pointerdown", e => {
    if (busy || e.target.closest("a,button") || (e.button && e.button !== 0)) return;
    pid = e.pointerId; card.setPointerCapture(pid);
    sx = e.clientX; sy = e.clientY; dx = dy = 0; t0 = performance.now(); pts = [{ x: sx, y: sy, t: t0 }]; dragging = true;
    card.style.transition = "none";
  });
  card.addEventListener("pointermove", e => {
    if (!dragging || e.pointerId !== pid) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    const now = performance.now(); pts.push({ x: e.clientX, y: e.clientY, t: now }); if (pts.length > 6) pts.shift();
    const rot = dx * 0.055, lift = Math.min(Math.hypot(dx, dy) / 600, 0.04);
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(${1 + lift})`;
    const pYes = clamp(dx / 110), pNo = clamp(-dx / 110), pUp = Math.abs(dy) > Math.abs(dx) ? clamp(-dy / 120) : 0;
    stamps.yes.style.opacity = pYes; stamps.no.style.opacity = pNo; stamps.later.style.opacity = pUp;
    const dom = Math.max(pYes, pNo, pUp);
    glow.style.opacity = dom * 0.9;
    glow.style.boxShadow = `inset 0 0 0 3px ${pYes === dom ? "#3DDC97" : pNo === dom ? "#FF5C6C" : "#FFB23F"}, inset 0 0 60px -10px ${pYes === dom ? "rgba(61,220,151,.35)" : pNo === dom ? "rgba(255,92,108,.35)" : "rgba(255,178,63,.35)"}`;
    const now_armed = pYes >= 1 ? "yes" : pNo >= 1 ? "no" : pUp >= 1 ? "later" : null;
    if (now_armed && now_armed !== armed) haptic(8);
    armed = now_armed;
    layoutBack(Math.min(1, Math.hypot(dx, dy) / 140));
  });
  const end = e => {
    if (!dragging || (e && e.pointerId !== pid)) return;
    dragging = false;
    // release velocity over the last ~100 ms, counting any hold before letting go
    const tEnd = performance.now(), recent = pts.filter(q => tEnd - q.t < 120);
    const a = recent[0] || pts[pts.length - 1], b = pts[pts.length - 1], dt = Math.max(16, tEnd - a.t);
    const vx = recent.length > 1 ? (b.x - a.x) / dt : 0, vy = recent.length > 1 ? (b.y - a.y) / dt : 0;
    const moved = Math.hypot(dx, dy), quick = performance.now() - t0 < 250;
    let act = null;
    if (dx > 110 || (vx > 0.4 && dx > 30)) act = "yes";
    else if (dx < -110 || (vx < -0.4 && dx < -30)) act = "no";
    else if ((dy < -120 || (vy < -0.4 && dy < -30)) && -dy > Math.abs(dx)) act = "later";
    if (act) fling(card, act, dx, dy, vx, vy);
    else {
      card.style.transition = "transform .55s cubic-bezier(.2,1.6,.4,1)";
      card.style.transform = "";
      Object.values(stamps).forEach(s => s.style.opacity = 0); glow.style.opacity = 0;
      [...$("#deck").querySelectorAll(".card")].forEach(c => c.style.transition = "transform .45s cubic-bezier(.2,1.4,.4,1)");
      layoutBack(0);
      if (moved < 6 && quick) openDetail(+card.dataset.id);
    }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}
const clamp = v => Math.max(0, Math.min(1, v));
function fling(card, act, dx = 0, dy = 0, vx = 0, vy = 0) {
  if (busy || !card) return; busy = true;
  const id = +card.dataset.id;
  const W = innerWidth + card.offsetWidth;
  let x, y, r;
  if (act === "later") { x = dx + vx * 120; y = -(innerHeight + 200); r = dx * 0.05; }
  else { const s = act === "yes" ? 1 : -1; x = s * W; y = dy + vy * 260; r = s * 28 + vy * 10; }
  const speed = Math.min(0.42, Math.max(0.24, 0.42 - Math.hypot(vx, vy) * 0.1));
  card.style.transition = `transform ${speed}s cubic-bezier(.3,.6,.4,1), opacity ${speed}s`;
  card.style.transform = `translate(${x}px,${y}px) rotate(${r}deg)`;
  $(`.stamp.${act}`, card).style.opacity = 1;
  [...$("#deck").querySelectorAll(".card")].forEach(c => { if (c !== card) c.style.transition = "transform .4s cubic-bezier(.2,1.4,.4,1)"; });
  layoutBack(1);
  haptic(act === "later" ? 6 : 14);
  decide(id, { yes: "approved", no: "rejected", later: "later" }[act]);
  setTimeout(() => { busy = false; renderAll(); bump(act); }, speed * 1000);
}
function bump(act) {
  const map = { yes: "#yesBtn", no: "#noBtn", later: "#laterBtn" }, el = $(map[act]);
  el.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(.3,1.6,.5,1)" });
  if (act !== "later") { const s = $("#sendBtn"); s.classList.remove("pulse"); void s.offsetWidth; s.classList.add("pulse"); }
}

/* ---------- sheets ---------- */
function openSheet(html, after) {
  const w = $("#sheetWrap"), s = $("#sheet");
  s.innerHTML = `<div class="grab"></div>` + html; w.hidden = false; w.classList.remove("closing"); s.classList.remove("closing");
  s.scrollTop = 0; after && after(s);
}
function closeSheet() {
  const w = $("#sheetWrap"), s = $("#sheet"); if (w.hidden) return;
  w.classList.add("closing"); s.classList.add("closing");
  setTimeout(() => { w.hidden = true; }, 240);
}
$("#sheetWrap").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
(() => { // swipe the sheet down to close
  const s = $("#sheet"); let y0 = null, dy = 0;
  s.addEventListener("touchstart", e => { y0 = s.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  s.addEventListener("touchmove", e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) { s.style.transition = "none"; s.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  s.addEventListener("touchend", () => { if (y0 == null) return; s.style.transition = "transform .3s cubic-bezier(.2,1,.3,1)"; if (dy > 110) { s.style.transform = ""; closeSheet(); } else s.style.transform = ""; y0 = null; });
})();

function openDetail(id) {
  const t = byId.get(id); if (!t) return;
  const s = effective(t);
  const facts = (t.facts || []).map(f => `<li>${esc(f)}</li>`).join("");
  const srcs = (t.sources || []).map(x => `<a class="src" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join("");
  const tag = s === "pending" ? "" : `<span class="status-tag st-${s === "done" ? "approved" : s}">${s === "done" ? "Made" : s}</span>`;
  openSheet(`<div class="topline" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="pill${t.format === "Long" ? " long" : ""}">${t.format === "Long" ? "Long video" : "Short"}</span><span class="pill cat">${esc(t.category)}</span>${tag}<span class="num" style="margin-left:auto">#${t.id} · added ${esc(t.added || "")}</span></div>
    <h3>${esc(t.title)}</h3><p class="hook">“${esc(String(t.hook).replace(/^["“']|["”']$/g, ""))}”</p>
    ${t.note ? `<p class="flag note" style="display:inline-block">${esc(t.note)}</p>` : ""}
    <div class="sec">Key facts</div><ul class="facts">${facts}</ul>
    <div class="sec">Why now</div><p>${esc(t.why_now)}</p>
    <div class="sec">Risk note</div><p style="color:#FFCB80">${esc(t.risk)}</p>
    <div class="sec">Sources</div><div class="srcs">${srcs}</div>
    <div class="btns"><div class="row3"><button class="btn r" data-a="rejected">✕ Reject</button><button class="btn" data-a="later" style="color:var(--amber)">↑ Later</button><button class="btn g" data-a="approved">✓ Approve</button></div>
    ${s !== "pending" ? '<button class="btn" data-a="pending">↺ Back to Pending</button>' : ""}<button class="btn" data-close>Close</button></div>`, sh => {
    sh.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      const isTop = tab === "pending" && topCard() && +topCard().dataset.id === id && a !== "pending";
      closeSheet();
      if (isTop) setTimeout(() => fling(topCard(), { approved: "yes", rejected: "no", later: "later" }[a]), 200);
      else { decide(id, a); haptic(); renderAll(); toast(`#${id} → ${a}`, () => { undo(); renderAll(); }); }
    });
  });
}

function shortTitle(t, n = 38) { let s = t.title; if (s.length <= n) return s; s = s.slice(0, n); return s.slice(0, s.lastIndexOf(" ")) + "…"; }
function buildMessage(ids) {
  const g = { approved: [], rejected: [], later: [] };
  ids.forEach(id => { const L = local[id]; if (L && g[L.status]) g[L.status].push(id); });
  Object.values(g).forEach(a => a.sort((x, y) => x - y));
  const parts = [];
  if (g.approved.length) parts.push("✅ " + g.approved.join(","));
  if (g.rejected.length) parts.push("❌ " + g.rejected.join(","));
  if (g.later.length) parts.push("⏭ " + g.later.join(","));
  let msg = "THINKLOPEDIA picks — " + parts.join(" ");
  const legend = [...g.approved.map(i => "✅ " + i + " " + shortTitle(byId.get(i))), ...g.rejected.map(i => "❌ " + i + " " + shortTitle(byId.get(i))), ...g.later.map(i => "⏭ " + i + " " + shortTitle(byId.get(i)))].join("\n");
  if ((msg + legend).length < 1200) msg += "\n\n" + legend;
  return msg;
}
const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const smsLink = (body, form) => `sms:${RIKA}${form === "q" ? "?" : "&"}body=${encodeURIComponent(body)}`;

function openSend() {
  let ids = unsent(), resend = false;
  if (!ids.length) { ids = sentUnsynced(); resend = true; }
  if (!ids.length) {
    openSheet(`<h3>Nothing to send yet</h3><p style="color:var(--mist)">Swipe some topics first. Picks Rika already has show as “synced”.</p><div class="btns"><button class="btn" data-close>OK</button></div>`);
    return;
  }
  const body = buildMessage(ids), primary = isApple() ? "amp" : "q", other = primary === "amp" ? "q" : "amp";
  openSheet(`<h3>${resend ? "Send again?" : "Send to Rika"}</h3>
    <p style="color:var(--mist)">${resend ? "These picks were sent but Rika hasn't synced them yet." : `${ids.length} new pick${ids.length > 1 ? "s" : ""}. This opens Messages with the text ready; just hit send.`}</p>
    <div class="preview">${esc(body)}</div>
    <div class="btns"><a class="btn primary" id="smsGo" href="${esc(smsLink(body, primary))}">Open Messages</a>
    <button class="btn" id="copyGo">Copy text</button></div>
    <p class="small">Messages didn't open? <a href="${esc(smsLink(body, other))}" id="smsAlt">Try the other link format</a></p>`, sh => {
    const mark = () => setTimeout(() => {
      ids.forEach(id => { if (local[id]) local[id].sent = true; }); save(); renderAll(); closeSheet();
      toast(`Marked ${ids.length} as sent`, () => { ids.forEach(id => { if (local[id]) local[id].sent = false; }); save(); renderAll(); });
    }, 700);
    $("#smsGo", sh).addEventListener("click", mark);
    $("#smsAlt", sh).addEventListener("click", mark);
    $("#copyGo", sh).onclick = async () => {
      try { await navigator.clipboard.writeText(body); }
      catch { const ta = document.createElement("textarea"); ta.value = body; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      haptic(); $("#copyGo", sh).textContent = "Copied ✓ (paste it to Rika)"; mark();
    };
  });
}

/* ---------- toast ---------- */
let toastTimer;
function toast(text, onUndo) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(text)}</span>${onUndo ? '<button type="button">Undo</button>' : ""}`;
  if (onUndo) el.querySelector("button").onclick = () => { onUndo(); el.classList.remove("show"); haptic(); };
  el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ---------- controls ---------- */
function setTab(t) {
  tab = t;
  document.querySelectorAll(".tab").forEach((b, i) => { const on = b.dataset.tab === t; b.classList.toggle("on", on); if (on) $("#tabInk").style.transform = `translateX(${i * 100}%)`; });
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.id === "view-" + t));
  haptic(5);
}
document.querySelectorAll(".tab").forEach(b => b.onclick = () => setTab(b.dataset.tab));
document.querySelectorAll(".chip").forEach(b => b.onclick = () => { fmt = b.dataset.f; document.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === b)); renderDeck(); haptic(5); });
$("#yesBtn").onclick = () => fling(topCard(), "yes");
$("#noBtn").onclick = () => fling(topCard(), "no");
$("#laterBtn").onclick = () => fling(topCard(), "later");
$("#infoBtn").onclick = () => topCard() && openDetail(+topCard().dataset.id);
$("#undoBtn").onclick = () => {
  const h = history[history.length - 1]; if (!h || busy) return;
  const from = local[h.id] ? { approved: "yes", rejected: "no", later: "later" }[local[h.id].status] : null;
  undo(); haptic(); renderCounts(); renderLists();
  if (tab !== "pending") setTab("pending");
  renderDeckWithTop(h.id, from);   // the undone card comes back on top of the deck
};
function renderDeckWithTop(id, from) {
  const t = byId.get(id); if (!t || !isPendingLike(effective(t))) return renderDeck();
  const deck = $("#deck"), rest = deckIds().filter(x => x !== id).slice(0, 2).map(x => byId.get(x));
  deck.innerHTML = [t, ...rest].map((c, i) => cardHTML(c, i)).reverse().join("");
  layoutBack(0);
  const top = topCard();
  if (from) {
    const x = { yes: 1, no: -1, later: 0 }[from] * (innerWidth + 100), y = from === "later" ? -innerHeight : 0;
    top.style.transition = "none"; top.style.transform = `translate(${x}px,${y}px) rotate(${x * 0.03}deg)`;
    requestAnimationFrame(() => requestAnimationFrame(() => { top.style.transition = "transform .55s cubic-bezier(.2,1.25,.4,1)"; top.style.transform = ""; }));
  }
  bindDrag(top);
  $("#undoBtn").disabled = !history.length;
}
$("#sendBtn").onclick = openSend;
document.addEventListener("keydown", e => {
  if (!$("#sheetWrap").hidden) { if (e.key === "Escape") closeSheet(); return; }
  if (tab !== "pending") return;
  if (e.key === "ArrowRight") fling(topCard(), "yes");
  else if (e.key === "ArrowLeft") fling(topCard(), "no");
  else if (e.key === "ArrowUp") { e.preventDefault(); fling(topCard(), "later"); }
  else if ((e.metaKey || e.ctrlKey) && e.key === "z") $("#undoBtn").click();
});

/* ---------- data ---------- */
let lastJSON = "";
async function fetchTopics() {
  try {
    const r = await fetch("topics.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const txt = await r.text();
    if (txt === lastJSON) return false;
    lastJSON = txt;
    const data = JSON.parse(txt);
    topics = (Array.isArray(data) ? data : data.topics || []).filter(t => t && t.id != null && t.title);
    topics.forEach(t => { t.id = +t.id; t.format = /long/i.test(t.format) ? "Long" : "Short"; });
    byId = new Map(topics.map(t => [t.id, t]));
    reconcile();
    return true;
  } catch (e) { if (!topics.length) toast("Couldn't load topics, check connection"); return false; }
}
fetchTopics().then(() => renderAll());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") fetchTopics().then(ch => ch && renderAll()); });
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
window.__tk = { local: () => local, buildMessage, smsLink, unsent };
})();
