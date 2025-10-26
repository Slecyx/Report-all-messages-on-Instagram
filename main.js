// ================================
//  🔥 InstaPurge Custom Edition 🔥
//  Author: Yiğit Kurt
//  Modified for Reporting by: Yiğit Kurt
//  Version: 1.5.1 (Viewport Click Close)
//  Date: 26/10/2025
// ================================

console.log(`
██████╗ ██╗      ██████╗ ██╗
██╔══██╗██║     ██╔═══██╗██║
██║  ██║██║     ██║   ██║██║
██║  ██║██║     ██║   ██║██║
██████╔╝███████╗╚██████╔╝██║
╚═════╝ ╚══════╝ ╚═════╝ ╚═╝

⚡ InstaReporter by: Yiğit Kurt ⚡
🚀 Automated Report Script - 2025 (Viewport Close)
`);

// ============ Ayarlar ============
const CONFIG = {
  REPORT_REASON: "Spam",
  AUTO_CLOSE_AFTER_SUBMIT: true,
  maxRetriesPerMessage: 3
};

const TIMINGS = {
  // Yükleme
  scrollProbeDelay: 250,
  samePositionBreakMs: 2500,
  preStartDelay: 140,

  // Etkileşim
  hoverDelay: 80,
  menuOpenDelay: 140,
  afterReportClickDelay: 200,
  afterReasonClickDelay: 220,
  afterSubmitDelay: 360,            // başarı ekranına geçiş için artırıldı

  // Genel yavaşlatma
  perMessageWorkDelay: 260,
  betweenBatchesDelay: 700,
  jitterMs: 220,
  maxPerBatch: 10,

  // Dialog beklemeleri
  dialogWaitTimeoutMs: 5000,

  // Başarı/Close
  successDialogFindTimeoutMs: 7000,
  closeScanTries: 12,
  closeScanIntervalMs: 120,
  closeEnableTimeoutMs: 2500,
  closeTotalHardTimeoutMs: 6000,
  idleAfterSuccessMs: 220
};

// ============ Global ============
let load = true;
let report = true;

loadChat();

// ============ Utils ============
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function waitWithJitter(ms) { return delay(ms + Math.random() * TIMINGS.jitterMs); }
function norm(t){ return (t||"").replace(/\s+/g," ").trim(); }

function queryClickables(root) {
  return Array.from(root.querySelectorAll('button, [role="button"], a, div, span, li'));
}
function findByText(root, text, exact = true) {
  const needle = norm(text).toLowerCase();
  for (const n of queryClickables(root)) {
    const t = norm(n.innerText || n.textContent).toLowerCase();
    if (!t) continue;
    if (exact ? t === needle : t.includes(needle)) return n;
  }
  return null;
}

function getAllDialogs() {
  return Array.from(document.querySelectorAll('[role="dialog"]'));
}
function getActiveDialog() {
  const ds = getAllDialogs();
  return ds.length ? ds[ds.length - 1] : null;
}
async function waitForDialog(timeoutMs = TIMINGS.dialogWaitTimeoutMs) {
  const start = Date.now();
  let dlg = getActiveDialog();
  while (!dlg && Date.now() - start < timeoutMs) {
    await delay(100);
    dlg = getActiveDialog();
  }
  return dlg;
}

function isIncomingMessage(msgEl, containerEl) {
  try {
    const r = msgEl.getBoundingClientRect();
    const cr = containerEl.getBoundingClientRect();
    return (r.left + r.width/2) < (cr.left + cr.width/2);
  } catch { return false; }
}

// ======== Başarı dialogunu hedefleme ========
function findSuccessDialog() {
  const ds = getAllDialogs();
  for (const d of ds.reverse()) {
    const txt = norm(d.innerText || d.textContent).toLowerCase();
    if (
      txt.includes("thanks for letting us know") ||
      txt.includes("report submitted") ||
      txt.includes("bize bildirdiğin için teşekkürler")
    ) return d;
  }
  return getActiveDialog();
}

// ======== Görünür merkezden tıkla (en üst katman) ========
async function clickByViewport(el) {
  try { el.scrollIntoView({ block: "center", inline: "center" }); } catch {}
  // Etkinleşme bekle
  const start = Date.now();
  while (Date.now() - start < TIMINGS.closeEnableTimeoutMs) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const disabled = el.hasAttribute("disabled") || el.getAttribute("aria-disabled")==="true";
    const visible = rect.width>0 && rect.height>0 && style.display!=="none" && style.visibility!=="hidden";
    if (!disabled && visible) break;
    await delay(80);
  }
  const rect = el.getBoundingClientRect();
  const cx = Math.floor(rect.left + rect.width/2);
  const cy = Math.floor(rect.top + rect.height/2);

  // En üstteki elemana tıkla (overlay varsa onu da aşar)
  const topEl = document.elementFromPoint(cx, cy) || el;

  // Pointer + click
  ["mouseover","mouseenter","mousemove"].forEach(type=>{
    topEl.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:cx,clientY:cy,view:window}));
  });
  topEl.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,clientX:cx,clientY:cy,view:window}));
  topEl.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,clientX:cx,clientY:cy,view:window}));
  topEl.click();
}

// ======== Close bulma ========
function findCloseButton(dlg) {
  // 1) Metin
  let btn =
    findByText(dlg, "Close", true) || findByText(dlg, "Close", false) ||
    findByText(dlg, "Kapat", true) || findByText(dlg, "Kapat", false);
  if (btn) return btn;

  // 2) aria-label
  btn = dlg.querySelector('[aria-label="Close"]');
  if (btn) return btn;

  // 3) En alttaki geniş buton heuristiği
  const buttons = Array.from(dlg.querySelectorAll('button, [role="button"]'));
  const bottomMost = buttons.sort((a,b)=>a.getBoundingClientRect().top - b.getBoundingClientRect().top).pop();
  return bottomMost || null;
}

// ======== Close aşaması: hızlı, hedefli, fallback'li ========
async function fastCloseSuccessDialog() {
  const tStart = Date.now();
  let dlg = null;

  while (!dlg && Date.now() - tStart < TIMINGS.successDialogFindTimeoutMs) {
    dlg = findSuccessDialog();
    if (!dlg) await delay(120);
  }
  if (!dlg) return false;

  // En alta kaydır, Close genelde altta
  dlg.scrollTop = dlg.scrollHeight;
  await delay(120);

  // Hızlı tarama + viewport click
  for (let i=0; i<TIMINGS.closeScanTries; i++) {
    const btn = findCloseButton(dlg);
    if (btn) {
      await clickByViewport(btn);
      if (await waitForDialogClosedQuick()) return true;
    }
    // Alternatif: Tab ile odak + Enter/Space
    if (i === Math.floor(TIMINGS.closeScanTries/2)) {
      try { dlg.focus(); } catch {}
      dlg.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",code:"Tab",bubbles:true}));
      await delay(80);
      dlg.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true}));
      await delay(180);
      if (await waitForDialogClosedQuick()) return true;
      dlg.dispatchEvent(new KeyboardEvent("keydown",{key:" ",code:"Space",bubbles:true}));
      await delay(180);
      if (await waitForDialogClosedQuick()) return true;
    }
    // Biraz yukarı-aşağı gezin ve tekrar dene
    dlg.scrollBy(0, i%2===0 ? -200 : 260);
    await delay(TIMINGS.closeScanIntervalMs);
  }

  // Yedek: Escape ile kapatma denemesi
  dlg.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",code:"Escape",bubbles:true}));
  await delay(200);
  if (await waitForDialogClosedQuick()) return true;

  // Yedek: backdrop tıklaması (dialog dışı)
  const rect = dlg.getBoundingClientRect();
  const bx = Math.max(5, rect.left - 15), by = Math.max(5, rect.top - 15);
  const back = document.elementFromPoint(bx, by);
  back?.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,clientX:bx,clientY:by,view:window}));
  await delay(220);
  if (await waitForDialogClosedQuick()) return true;

  // Sert zaman sınırı
  return (Date.now() - tStart) < TIMINGS.closeTotalHardTimeoutMs ? await waitForDialogClosedQuick() : false;
}

async function waitForDialogClosedQuick() {
  const start = Date.now();
  while (Date.now() - start < 1200) {
    if (!getActiveDialog()) return true;
    await delay(100);
  }
  return false;
}

// ======== Rapor akışı ========
async function completeReportFlow(reasonText = CONFIG.REPORT_REASON) {
  const dlg = await waitForDialog();
  if (!dlg) return false;

  // Kategori
  let reasonBtn = findByText(dlg, reasonText, true) || findByText(dlg, reasonText, false);
  if (!reasonBtn) {
    dlg.scrollTop = 0;
    for (let i=0;i<5 && !reasonBtn;i++){
      dlg.scrollBy(0,220); await delay(80);
      reasonBtn = findByText(dlg, reasonText, true) || findByText(dlg, reasonText, false);
    }
  }
  if (!reasonBtn) return false;
  await clickByViewport(reasonBtn);
  await waitWithJitter(TIMINGS.afterReasonClickDelay);

  // Submit
  const dlg2 = await waitForDialog();
  if (!dlg2) return false;
  const submitBtn =
    findByText(dlg2,"Submit report",true) || findByText(dlg2,"Submit report",false) || findByText(dlg2,"Gönder",false);
  if (!submitBtn) return false;
  await clickByViewport(submitBtn);
  await waitWithJitter(TIMINGS.afterSubmitDelay);

  // Close (zorunlu)
  if (CONFIG.AUTO_CLOSE_AFTER_SUBMIT) {
    const closed = await fastCloseSuccessDialog();
    if (!closed) return false;
  }

  await delay(TIMINGS.idleAfterSuccessMs);
  return true;
}

// ======== Ana döngüler ========
async function loadChat() {
  const cw = document.getElementsByClassName(
    "x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1xzczws x6ikm8r x1odjw0f x1n2onr6 xh8yej3 x16o0dkt"
  )[1];
  let last = cw.scrollTop, same=0;
  while (load) {
    cw.scrollTo(0,0);
    await delay(TIMINGS.scrollProbeDelay);
    same = (cw.scrollTop===last) ? same + TIMINGS.scrollProbeDelay : 0;
    if (same >= TIMINGS.samePositionBreakMs) break;
    last = cw.scrollTop;
  }
  cw.scrollTo(0, cw.scrollHeight);
  await delay(TIMINGS.preStartDelay);
  startReporting();
}

async function reportMessages(conversation, messages) {
  const cw = document.getElementsByClassName(
    "x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1xzczws x6ikm8r x1odjw0f x1n2onr6 xh8yej3 x16o0dkt"
  )[1];

  let doneThisBatch = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    if (doneThisBatch >= TIMINGS.maxPerBatch) break;
    const msg = messages[i];

    if (!isIncomingMessage(msg, conversation)) continue;
    if (msg.getBoundingClientRect().top > window.innerHeight - 77) continue;

    let scrolled = false;
    const pos = msg.getBoundingClientRect();
    if (pos.top - 70 < 0) {
      msg.scrollIntoView();
      scrolled = true;
      await waitWithJitter(90);
    }

    // Retry: mesaj bitmeden geçme
    let attempt = 0, ok = false;
    while (attempt < CONFIG.maxRetriesPerMessage && !ok) {
      attempt++;

      msg.dispatchEvent(new MouseEvent("mouseover", {view:window,bubbles:true,cancelable:true}));
      await waitWithJitter(TIMINGS.hoverDelay);

      const options = msg.getElementsByClassName("x6s0dn4 x78zum5 xdt5ytf xl56j7k");
      if (!options.length) { await waitWithJitter(150); continue; }
      const dots = options[options.length-1];
      if (!dots.querySelector("title")?.textContent?.toLowerCase()?.includes("more")) { await waitWithJitter(150); continue; }

      dots.click();
      await waitWithJitter(TIMINGS.menuOpenDelay);

      const menus = document.getElementsByClassName(
        "html-div xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x9f619 xjbqb8w x78zum5 x15mokao x1ga7v0g x16uus16 xbiv7yw x1uhb9sk x1plvlek xryxfnj x1iyjqo2 x2lwn1j xeuugli xdt5ytf xqjyukv x1cy8zhl x1oa3qoh x1nhvcw1"
      );
      const menuRoot = menus[menus.length-1] || document;
      const reportEntry = findByText(menuRoot,"Report",true) || findByText(menuRoot,"Report",false);
      if (!reportEntry) { await waitWithJitter(160); continue; }

      await clickByViewport(reportEntry);
      await waitWithJitter(TIMINGS.afterReportClickDelay);

      ok = await completeReportFlow(CONFIG.REPORT_REASON);
      if (!ok) await waitWithJitter(400);
    }

    if (ok) doneThisBatch += 1;

    await waitWithJitter(TIMINGS.perMessageWorkDelay);
    if (!scrolled) cw.scrollBy(0, -28);
  }

  return doneThisBatch;
}

async function startReporting() {
  try {
    while (report) {
      const conv = document.getElementsByClassName(
        "x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1xzczws x6ikm8r x1odjw0f x1n2onr6 xh8yej3 x16o0dkt"
      )[1];
      const msgs = conv.querySelectorAll('[data-release-focus-from="CLICK"]');

      const done = await reportMessages(conv, msgs);

      const cw = document.getElementsByClassName(
        "x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1xzczws x6ikm8r x1odjw0f x1n2onr6 xh8yej3 x16o0dkt"
      )[1];

      await waitWithJitter(TIMINGS.betweenBatchesDelay);

      if (cw.scrollTop <= 1) break;
      if (done === 0) { cw.scrollBy(0, -140); await waitWithJitter(220); }
    }

    console.log("✅ Raporlama tamamlandı.");
    alert("🔥 Raporlama tamamlandı - Powered by Yiğit Kurt 🔥");
  } catch (e) {
    console.error("Hata oluştu, yavaşlatılmış tekrar deneme başlıyor...", e);
    await waitWithJitter(1400);
    startReporting();
  }
}
