/* == POMO GAME v4.7.0 (Final Polish) ==
 * - UX: Duration inputs (Work, Break) now clear on focus for easier editing.
 * - UX: Bet input placeholder now disappears on focus for a cleaner typing experience.
 * - UI: Shortened "Odds Legend" to "Odds" in the roll log modal.
 */
(() => {
  'use strict';

  let lastRollResult = null;
  let settingsModalRef = null;

  const ID = 'rr-pomobar';
  const STYLE_ID = `${ID}-style`;
  const STORE_KEY = `${ID}-state-v380`;

  const RING = { size: 18, stroke: 2.5 };
  const FONT = 18;
  const SPACE = { gap: 4, ml: 2, mr: -2 };

  const COLOR_WORK     = '#5C7080';
  const COLOR_BREAK    = '#6AB890';
  const COLOR_TRACK    = '#EDF0F5';
  const COLOR_BASE_BG  = '#F7F8FA';
  const COLOR_HOVER_BG = '#EEF2F7';
  const COLOR_BORDER   = '#E3E7EE';
  const COLOR_PROGRESS = '#9BB1FF';
  const COLOR_PROGRESS_GRADIENT = 'linear-gradient(90deg, #dbe4ff 0%, #9bb1ff 48%, #6f88ff 100%)';
  const COLOR_PILL_BG  = '#D7DBE3';
  const COLOR_PILL_TXT = '#2F3A46';

  const RANKS = [
    { name: 'Herald',   step: 100 },
    { name: 'Guardian', step: 150 },
    { name: 'Crusader', step: 200 },
    { name: 'Archon',   step: 250 },
    { name: 'Legend',   step: 300 },
    { name: 'Ancient',  step: 350 },
    { name: 'Divine',   step: 400 },
    { name: 'Immortal', step: Infinity }
  ];
  const ROMAN = ['I','II','III','IV','V'];
  const EMO = { Herald:'🗡️', Guardian:'🛡️', Crusader:'⚔️', Archon:'🪬', Legend:'🏆', Ancient:'🌸', Divine:'🌟', Immortal:'👑' };

  const LEVERAGE = { 1: -4, 2: -2, 3: -1, 4: -0.5, 5: 0.5, 6: 1, 7: 2, 8: 4 };

  const LADDER = (() => {
    const list = []; let acc = 0;
    for (let i = 0; i < RANKS.length - 1; i++) {
      const { name, step } = RANKS[i];
      for (let s = 0; s < 5; s++) { acc += step; list.push({ rank: name, star: s + 1, need: acc }); }
    }
    return list;
  })();
  const IMMORTAL_MIN  = LADDER[LADDER.length - 1].need;
  const IMMORTAL_VIRT = 500;

  function computeRank(points) {
    if (points >= IMMORTAL_MIN) {
      const base = IMMORTAL_MIN, virt = IMMORTAL_VIRT;
      const pIn = (points - base) % virt;
      return { name: 'Immortal', star: 0, base, next: base + virt, progress: pIn / virt, toNext: virt - pIn };
    }
    let idx = LADDER.findIndex(x => points < x.need);
    if (idx === -1) idx = LADDER.length - 1;
    const currNeed = LADDER[idx].need;
    const prevNeed = idx > 0 ? LADDER[idx - 1].need : 0;
    const currRank = LADDER[idx].rank;
    const currStar = LADDER[idx].star;
    const progress = (points - prevNeed) / (currNeed - prevNeed);
    return { name: currRank, star: currStar, base: prevNeed, next: currNeed, progress: Math.max(0, Math.min(1, progress)), toNext: currNeed - points };
  }

  const defaults = {
    workMin: 25, breakMin: 5, phase: 'work', running: false, endAt: null, remainingSec: null,
    points: 0, immortalResets: 0, _awardGuardTS: 0,
    rollLog: [],
    overrideDurationMin: null
  };
  let S = { ...defaults };
  try { Object.assign(S, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch(_) {}
  if (typeof S.immortalResets !== 'number') S.immortalResets = (typeof S.crowns === 'number') ? S.crowns : 0;
  if (!Array.isArray(S.rollLog)) S.rollLog = [];

  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(_) {} };

  const now = () => Date.now();
  const secOfPhase = () => (S.phase === 'work' ? S.workMin : S.breakMin) * 60;
  const fmt = (sec) => { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec/60), s = sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const clamp01 = x => Math.max(0, Math.min(1, x));

  function injectStyles(){
    if (document.getElementById(STYLE_ID)) return;
  const css = `
#${ID}{
  position: relative; top: 1px;
  display:inline-flex; align-items:center; gap:${SPACE.gap}px;
  background: transparent; border:none !important; box-shadow:none !important;
  margin-left:${SPACE.ml}px; margin-right:${SPACE.mr}px;
  padding: 4px 4px; border-radius: 8px;
  user-select:none; cursor: default; -webkit-tap-highlight-color: transparent;
  --ring-color: ${COLOR_WORK};
  transition: background-color .15s ease;
}
#${ID}, #${ID} *{ outline:none !important; box-shadow:none !important; }
#${ID} *{ pointer-events:none; }
.rm-topbar .rm-topbar__controls > #${ID},
.rm-topbar > #${ID}{ margin-left:${SPACE.ml}px; margin-right:${SPACE.mr}px; }
#${ID}:hover{ background-color:${COLOR_HOVER_BG}; }

#${ID} .time{
  font-size:${FONT}px; font-weight:900; line-height:1;
  text-align:left; color:${COLOR_WORK} !important;
  font-family: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-variant-numeric: tabular-nums;
}
#${ID} .ring{ width:${RING.size}px; height:${RING.size}px; display:inline-block; position:relative; }
#${ID} .ring svg{ width:100%; height:100%; display:block; overflow:visible; transform: rotate(-90deg); }
#${ID} .track{ fill:none; stroke:${COLOR_TRACK}; stroke-linecap:butt; stroke-width:${RING.stroke}px; }
#${ID} .progress{
  fill:none; stroke: var(--ring-color, ${COLOR_WORK}) !important;
  stroke-linecap:butt; stroke-width:${RING.stroke}px;
  transition: stroke-dashoffset .2s ease, stroke .12s ease;
}

/* modal */
.rr-modal-mask{ position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.18); }
.rr-modal{ width:560px; max-width:95vw; max-height:90vh; background:${COLOR_BASE_BG}; border:1px solid ${COLOR_BORDER}; color:#333; border-radius:14px; padding:0; box-shadow:0 16px 48px rgba(0,0,0,.10); display:flex; flex-direction:column; }
.rr-head{ padding:16px 18px; border-bottom:1px solid ${COLOR_BORDER}; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:700; flex-shrink:0; }
.rr-body{ padding:12px 16px; overflow-y:auto; min-height:0; }

.set-grid{ display:grid; gap:8px; grid-template-columns: 1fr; }
.card{ background:#fff; border:1px solid ${COLOR_BORDER}; border-radius:16px; padding:10px 16px; position: relative; }
.card h4{ margin:0 0 6px; font-size:14px; font-weight:800; display:flex; justify-content:space-between; align-items:center; }

.row{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin:2px 0; }
label{ font-weight:700; color: ${COLOR_WORK}; }
input[type="number"]{
  width:140px; height:34px; line-height:34px;
  padding:0 10px;
  border-radius:10px; border:1px solid ${COLOR_BORDER};
  background:#fff; text-align:center; font-weight:700;
  -moz-appearance:textfield; appearance:textfield;
}
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button{ -webkit-appearance: none; margin: 0; }

.durations-inline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
}
.durations-inline > div {
    display: flex;
    align-items: center;
    gap: 8px;
}
.durations-inline input[type="number"] {
    width: 120px;
}

.rank-pill{
  width:100%;
  border-radius:9999px;
  background:${COLOR_PILL_BG};
  color:${COLOR_PILL_TXT};
  font-weight:800;
  padding:8px 12px;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:10px;
  white-space:nowrap;
}
.rank-pill .star{ color:#F4B400; }
.rank-pill__icon{
  font-size:24px;
  line-height:1;
  display:inline-flex;
}
.rank-pill__text{
  display:inline-flex;
  align-items:center;
  gap:4px;
  color:${COLOR_PILL_TXT};
  font-weight:800;
}
.rank-pill__text b{
  font-weight:900;
}
.rank-pill__stars{
  color:#F4B400;
  font-size:15px;
  margin-left:6px;
}

.kv{ margin-top:10px; }
.kv-line{
  display:flex; align-items:center; justify-content:space-between;
  font-size:14px; line-height:1.35; margin:6px 0;
  color:#536171;
}
.kv-line .kv-val{ color:#4A5868; font-weight:700; }

.prog{ height:12px; border-radius:9999px; background:#E9EDF5; position:relative; overflow:hidden; margin-top:8px; }
.prog>span{
  position:absolute; left:0; top:0; bottom:0; width:0%;
  background:${COLOR_PROGRESS};
  background-image:${COLOR_PROGRESS_GRADIENT};
  background-size:100% 100%; background-repeat:no-repeat;
  transition:width .25s ease;
}

.ladder{ width:100%; border-collapse:collapse; font-size:14px; }
.ladder th, .ladder td{ padding:6px 8px; border-bottom:1px dashed ${COLOR_BORDER}; text-align:center; white-space:nowrap; }
.ladder th{ font-weight:800; }

.text-muted{ opacity:.75; }
.star{ color:#f39c12; }

.rr-btns{ display:flex; gap:10px; justify-content:center; padding:12px 18px; border-top:1px solid ${COLOR_BORDER}; flex-shrink:0; background:#fff; border-bottom-left-radius:14px; border-bottom-right-radius:14px; }
.rr-btn{ appearance:none; border:none; background:${COLOR_HOVER_BG}; color:#334155; padding:8px 12px; line-height:1.3; text-align:center; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer; transition: background-color .15s ease, transform .1s ease; }
.rr-btn:hover{ background:#E5EAF2; }
.rr-btn:active{ transform:scale(.98); }
.rr-btn.primary{ background:${COLOR_WORK}; color:#fff; }
.rr-btn.primary:hover{ background-color:#4a5a69; }

.roll-result{ padding:8px 12px; margin-bottom:10px; border-radius:10px; font-weight:700; text-align:center; }
.roll-result.win{ background-color: #d1f3e0; color: #0f5132; }
.roll-result.loss{ background-color: #f8d7da; color: #842029; }

.view-log-btn {
    position: absolute;
    bottom: 10px;
    right: 16px;
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
    color: ${COLOR_WORK};
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background-color .15s ease;
}
.view-log-btn:hover { text-decoration: none; background-color: ${COLOR_HOVER_BG}; }

.log-table-container { max-height: 280px; overflow-y: auto; border:1px solid ${COLOR_BORDER}; border-radius:12px; }
.log-table { width:100%; border-collapse:collapse; font-size:13px; }
.log-table th, .log-table td { padding: 8px 10px; border-bottom:1px dashed ${COLOR_BORDER}; text-align:center; }
.log-table th { font-weight: 800; position:sticky; top:0; background:${COLOR_BASE_BG}; }
.log-win { color: #146c43; font-weight:700; }
.log-loss { color: #b02a37; font-weight:700; }

.roll-chart-container { margin-bottom: 12px; }
.roll-chart-container h5 { font-size: 13px; text-align: center; margin: 0 0 4px; color: ${COLOR_WORK}; font-weight: 700; }
.roll-chart-svg { width: 100%; height: 120px; background: #FBFCFF; border: 1px solid ${COLOR_BORDER}; border-radius: 8px; }
.roll-chart-svg .grid { stroke: ${COLOR_BORDER}; stroke-dasharray: 2, 2; }
.roll-chart-svg .axis { stroke: ${COLOR_PILL_BG}; stroke-width: 2; }
.roll-chart-svg .line { stroke: ${COLOR_PROGRESS}; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.roll-chart-svg .label { font-size: 10px; fill: ${COLOR_WORK}; opacity: 0.75; }
.roll-chart-svg .zero-line { stroke: ${COLOR_BREAK}; stroke-width: 1.5; }
.roll-chart-svg .empty { fill: ${COLOR_WORK}; opacity: 0.45; font-size: 12px; }

`;
    const s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  function topbarContainer(){
    const sels = ['.rm-topbar .rm-topbar__controls', '.rm-topbar .flex-h-box', '.rm-topbar'];
    for (const sel of sels){ const el = document.querySelector(sel); if (el) return el; }
    return document.body;
  }
  function mount(){
    let host = document.getElementById(ID);
    if (host && document.contains(host)) return host;
    const r = (RING.size - RING.stroke) / 2;
    const c = 2 * Math.PI * r;
    host = document.createElement('div');
    host.id = ID;
    host.setAttribute('tabindex','-1');
    host.addEventListener('mousedown', (e)=>e.preventDefault(), true);
    host.innerHTML = `
      <span class="ring" data-circ="${c}">
        <svg viewBox="0 0 ${RING.size} ${RING.size}" aria-hidden="true" focusable="false">
          <circle class="track" cx="${RING.size/2}" cy="${RING.size/2}" r="${r}"></circle>
          <circle class="progress" cx="${RING.size/2}" cy="${RING.size/2}" r="${r}"
                  stroke-dasharray="${c}" stroke-dashoffset="${c}"></circle>
        </svg>
      </span>
      <span class="time">00:00</span>
    `;
    topbarContainer().appendChild(host);
    host.title = '[PomoGame] Left Click: Start | Right Click: Switch Phase | Shift+Click: Reset | Ctrl/Alt/Cmd+Click: Settings';
    host.addEventListener('click', (e)=>{
      unlockAudio();
      if (e.ctrlKey || e.metaKey || e.altKey){ openSettings(); return; }
      if (e.shiftKey){ reset(); setUI(secOfPhase()); return; }
      if (!S.running) {
        start(false);
        setUI(Math.max(0, Math.ceil((S.endAt - Date.now())/1000)));
      }
    });
    host.addEventListener('contextmenu', (e)=>{ e.preventDefault(); togglePhase(); });
    return host;
  }

  function setUI(sec){
    const host = mount();
    const total = Math.max(1, secOfPhase());
    const p = 1 - (sec / total);
    host.querySelector('.time').textContent = fmt(sec);
    host.style.setProperty('--ring-color', (S.phase === 'break') ? COLOR_BREAK : COLOR_WORK);
    const ring = host.querySelector('.ring');
    const circ = parseFloat(ring.getAttribute('data-circ')) || 0;
    host.querySelector('.progress').setAttribute('stroke-dashoffset', String(circ * (1 - clamp01(p))));
  }

  const start = (reset=false) => {
    const tot = secOfPhase();
    let base = reset ? tot : (S.remainingSec ?? tot);
    if (!isFinite(base) || base <= 0) base = tot;
    S.endAt = Date.now() + base * 1000; S.running = true; save();
  };
  const reset = () => {
    S.running = false;
    S.endAt = null;
    S.remainingSec = secOfPhase();
    S.overrideDurationMin = null;
    save();
  };
  const togglePhase = () => { S.phase = (S.phase==='work') ? 'break' : 'work'; reset(); setUI(secOfPhase()); };

  let audioCtx=null;
  function unlockAudio(){ if(audioCtx) return; try{ audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended'){ const resume=()=>{audioCtx.resume();['click','keydown'].forEach(t=>document.removeEventListener(t,resume,true));}; ['click','keydown'].forEach(t=>document.addEventListener(t,resume,true)); } }catch(_){} }
  function beep3(){ if(!audioCtx) return; try{ const t0=audioCtx.currentTime; [0,.18,.36].forEach(dt=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type='sine'; o.frequency.value=(S.phase==='work')?880:660; o.connect(g); g.connect(audioCtx.destination); g.gain.setValueAtTime(0.0001,t0+dt); g.gain.exponentialRampToValueAtTime(0.22,t0+dt+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t0+dt+0.30); o.start(t0+dt); o.stop(t0+dt+0.32);}); if(navigator.vibrate) navigator.vibrate([80,80,80]); }catch(_){} }
  function levelUpSfx(){ if(!audioCtx) return; try{ const t0=audioCtx.currentTime+0.01; const mk=(f,s,d=0.22,type='triangle',p=0.28)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type=type; o.frequency.value=f; o.connect(g); g.connect(audioCtx.destination); g.gain.setValueAtTime(0.0001,t0+s); g.gain.exponentialRampToValueAtTime(p,t0+s+0.03); g.gain.exponentialRampToValueAtTime(0.0001,t0+s+d); o.start(t0+s); o.stop(t0+s+d+0.02);}; mk(523.25,0.00,0.24,'triangle',0.30); mk(659.25,0.08,0.22,'triangle',0.26); mk(783.99,0.16,0.20,'triangle',0.24); mk(1046.5,0.22,0.18,'sine',0.20);}catch(_){} }
  function didLevelUp(prevPoints, newPoints){
    const pre = computeRank(prevPoints);
    const post = computeRank(newPoints);
    if (pre.name !== post.name || pre.star !== post.star) return true;
    if (post.name === 'Immortal' && prevPoints >= IMMORTAL_MIN){
      const a = Math.floor((prevPoints - IMMORTAL_MIN)/IMMORTAL_VIRT);
      const b = Math.floor((newPoints  - IMMORTAL_MIN)/IMMORTAL_VIRT);
      return b > a;
    }
    return false;
  }

  function rankLabel(info){
    if (!info) return '';
    return `${info.name}${info.star ? ` ${ROMAN[info.star - 1]}` : ''}`;
  }

  function renderRankPill(rankInfo, labelText){
    const label = labelText || 'Current Rank';
    const rankKey = rankInfo ? `${rankInfo.name}:${rankInfo.star || 0}` : 'none';
    return `
      <div class="rank-pill" data-rank-key="${rankKey}" data-role="rank-pill">
        <span class="rank-pill__icon">${(rankInfo && EMO[rankInfo.name]) || '🏆'}</span>
        <span class="rank-pill__text">${label}:&nbsp;<b>${rankLabel(rankInfo)}</b></span>
        <span class="star rank-pill__stars">${(rankInfo && rankInfo.star) ? '★'.repeat(rankInfo.star) : '★'}</span>
      </div>
    `;
  }

  function refreshSettingsModal(){
    if (!settingsModalRef) return;
    const mask = settingsModalRef.el;
    if (!mask || !document.body.contains(mask)) { settingsModalRef = null; return; }
    const modalRoot = mask.querySelector('.rr-modal');
    if (!modalRoot) { settingsModalRef = null; return; }

    const rank = computeRank(S.points);
    const percent = Math.round((rank.progress || 0) * 100);
    const totalCoinsEl = modalRoot.querySelector('[data-role="total-coins"]');
    if (totalCoinsEl) totalCoinsEl.textContent = S.points;
    const progressTextEl = modalRoot.querySelector('[data-role="progress-text"]');
    if (progressTextEl) progressTextEl.innerHTML = rank.next ? `<b>${S.points - rank.base}</b> / ${rank.next - rank.base} 🪙 coins` : '∞';
    const progressBarEl = modalRoot.querySelector('[data-role="progress-bar"]');
    if (progressBarEl) progressBarEl.style.width = `${percent}%`;
    const rankPillSlot = modalRoot.querySelector('[data-role="rank-pill-slot"]');
    if (rankPillSlot) rankPillSlot.innerHTML = renderRankPill(rank, 'Current Rank');
    const prestigeRow = modalRoot.querySelector('[data-role="prestige-row"]');
    if (prestigeRow) prestigeRow.style.display = S.points >= IMMORTAL_MIN ? '' : 'none';
    const immortalCountEl = modalRoot.querySelector('[data-role="immortal-count"]');
    if (immortalCountEl) immortalCountEl.textContent = S.immortalResets || 0;
    const betInput = modalRoot.querySelector('#rr-bet');
    if (betInput) {
      betInput.max = String(S.points);
      const current = parseInt(betInput.value, 10);
      if (isFinite(current) && current > S.points) {
        betInput.value = S.points > 0 ? String(S.points) : '';
      }
      if (!betInput.value && S.points <= 0) {
        const stored = betInput.dataset.originalPlaceholder;
        if (stored && betInput !== document.activeElement) betInput.placeholder = stored;
      }
    }
  }

  function openSettings(){
    const rank = computeRank(S.points);
    const percent = Math.round( (rank.progress || 0) * 100 );
    const canPrestige = S.points >= IMMORTAL_MIN;

    let resultHtml = '';
    if (lastRollResult) {
        const { roll, change } = lastRollResult;
        if (change >= 0) {
            resultHtml = `<div class="roll-result win">🎉 You rolled a ${roll}! You won ${change} coins.</div>`;
        } else {
            resultHtml = `<div class="roll-result loss">You rolled a ${roll}... You lost ${-change} coins.</div>`;
        }
    }

    const m = modal(`
      <div class="rr-head">PomoGame Settings</div>
      <div class="rr-body">
        ${resultHtml}
        <div class="set-grid">
          <div class="card">
            <h4>⌛️ Durations</h4>
            <div class="durations-inline">
                <div>
                    <label for="rr-work">Work</label>
                    <input id="rr-work" type="number" min="1" max="180" step="1" value="${S.workMin}">
                </div>
                <div>
                    <label for="rr-break">Break</label>
                    <input id="rr-break" type="number" min="1" max="180" step="1" value="${S.breakMin}">
                </div>
            </div>
          </div>

          <div class="card" data-role="achievements-card">
            <h4>🏆 Achievements</h4>
            <div data-role="rank-pill-slot">${renderRankPill(rank, 'Current Rank')}</div>
            <div class="kv">
              <div class="kv-line"><span>Total 👑 x<span data-role="immortal-count">${S.immortalResets||0}</span> :</span><span class="kv-val"><b data-role="total-coins">${S.points}</b> 🪙 coins</span></div>
              <div class="kv-line"><span>Progress to next</span><span class="kv-val" data-role="progress-text">${rank.next ? `<b>${S.points - rank.base}</b> / ${rank.next - rank.base} 🪙 coins` : '∞'}</span></div>
            </div>
            <div class="prog"><span data-role="progress-bar" style="width:${percent}%"></span></div>
            <div class="kv-line" data-role="prestige-row" style="${canPrestige?'':'display:none;'}; margin-top:8px;">
              <span class="text-muted" style="font-size:12px;">Become Immortal to unlock Prestige.</span>
              <button class="rr-btn" data-action="prestige" style="background:#F5C76C; color:#3a2a00; font-size:14px; padding:6px 10px; font-weight:700;">Prestige for a Crown 👑</button>
            </div>
          </div>

          <div class="card">
            <h4>🎲 Roll for Coins</h4>
            <div class="text-muted" style="font-size:12px; margin:0 0 12px;">Risk your coins for a chance to win big!</div>
            <div class="row" style="justify-content:center;">
              <input id="rr-bet" type="number" placeholder="Enter your bet" min="1" max="${S.points}" step="1">
              <button class="rr-btn primary" data-action="roll" style="width:140px;">Roll</button>
            </div>
            <a href="#" class="view-log-btn" data-action="view-log">View More</a>
          </div>

          <div class="card">
            <h4>🎖 Rank Ladder</h4>
            <div style="max-height:180px; overflow:auto; border:1px dashed ${COLOR_BORDER}; border-radius:12px; background:#FBFCFF; margin-top:8px;">
              ${renderLadderTable()}
            </div>
          </div>
        </div>
      </div>
      <div class="rr-btns"><button class="rr-btn" data-action="cancel">Close</button><button class="rr-btn primary" data-action="save">Save</button></div>
    `);

    lastRollResult = null;

    const root = m.el;
    const originalClose = m.close;
    m.close = () => {
      if (settingsModalRef && settingsModalRef.el === m.el) settingsModalRef = null;
      originalClose();
    };
    settingsModalRef = m;

    // MOD: Helper function to manage focus/blur for numeric inputs
    const setupNumericInputBehavior = (inputElement) => {
        if (!inputElement) return;
        let originalValue = inputElement.value;
        inputElement.addEventListener('focus', () => {
            originalValue = inputElement.value; // Store the current value on focus
            inputElement.value = '';
        });
        inputElement.addEventListener('blur', () => {
            if (inputElement.value === '') {
                inputElement.value = originalValue;
            }
        });
    };
    
    // MOD: Apply focus/blur behavior to duration inputs
    setupNumericInputBehavior(root.querySelector('#rr-work'));
    setupNumericInputBehavior(root.querySelector('#rr-break'));

    // MOD: Add focus/blur events to the bet input placeholder
    const betInput = root.querySelector('#rr-bet');
    const resetBetInputState = () => {
        if (!betInput) return;
        betInput.value = '';
        betInput.style.borderColor = '';
        const original = betInput.dataset.originalPlaceholder;
        if (original) {
            betInput.placeholder = original;
        }
        betInput.blur();
    };
    if (betInput) {
        const originalPlaceholder = betInput.placeholder;
        betInput.dataset.originalPlaceholder = originalPlaceholder;
        betInput.addEventListener('focus', () => {
            betInput.placeholder = '';
        });
        betInput.addEventListener('blur', () => {
            if (betInput.value === '') {
                betInput.placeholder = originalPlaceholder;
            }
        });
        if (S.points <= 0) {
            betInput.value = '';
        }
    }

    root.addEventListener('click',(e)=>{
      const btn=e.target.closest('[data-action]');
      if(!btn){ if(e.target===root) m.close(); return; }
      unlockAudio();
      const act=btn.getAttribute('data-action');
      if(act==='cancel'){ m.close(); return; }
      if(act==='save'){
        const w=parseInt(root.querySelector('#rr-work').value,10);
        const b=parseInt(root.querySelector('#rr-break').value,10);
        if(isFinite(w)&&w>0&&isFinite(b)&&b>0){ S.workMin=w; S.breakMin=b; reset(); }
        save(); m.close(); setUI(secOfPhase()); return;
      }
      if(act==='prestige' && S.points >= IMMORTAL_MIN){
        S.immortalResets = (S.immortalResets||0) + 1;
        const remainder = Math.max(0, S.points - IMMORTAL_MIN);
        S.points = remainder;
        save();
        m.close(); openSettings();
      }
      if(act==='view-log') {
        e.preventDefault();
        m.close();
        openRollLog();
        return;
      }
      if (act === 'roll') {
        const bet = parseInt(betInput.value, 10);
        if (!isFinite(bet) || bet <= 0) { betInput.style.borderColor = 'red'; return; }
        if (bet > S.points) {
            alert('You cannot bet more coins than you have.');
            resetBetInputState();
            return;
        }
        betInput.style.borderColor = '';

        const prevPoints = S.points;
        const roll = Math.floor(Math.random() * 8) + 1;
        const multiplier = LEVERAGE[roll];
        const change = Math.floor(bet * multiplier);

        S.points = Math.max(0, S.points + change);

        const logEntry = { ts: Date.now(), roll, bet, change };
        S.rollLog.unshift(logEntry);
        S.rollLog = S.rollLog.slice(0, 50);
        save();

        if (didLevelUp(prevPoints, S.points)) {
            levelUpSfx();
        }

        lastRollResult = { roll, change };
        m.close();
        openSettings();
      }
    }, {once:false});
  }

  function renderChart(log) {
    const safeLog = Array.isArray(log) ? log : [];
    const data = safeLog.slice().reverse().map(entry => LEVERAGE[entry.roll]);
    const width = 500;
    const height = 100;
    const padding = { top: 10, right: 30, bottom: 10, left: 30 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const minVal = -4;
    const maxVal = 4;
    const range = maxVal - minVal;
    const hasLine = data.length >= 2;
    const xCount = hasLine ? data.length : Math.max(2, safeLog.length || 8);
    const denom = Math.max(1, xCount - 1);
    const getX = (i) => padding.left + (i / denom) * chartWidth;
    const getY = (val) => padding.top + chartHeight - ((val - minVal) / range) * chartHeight;

    const points = hasLine ? data.map((val, i) => `${getX(i)},${getY(val)}`).join(' ') : '';
    const xGridLines = Array.from({length: xCount}, (_, i) => `<line class="grid" x1="${getX(i)}" y1="${padding.top}" x2="${getX(i)}" y2="${height - padding.bottom}"></line>`).join('');
    const emptyBaseline = getY(0) + 18;
    const emptyY = Math.min(height - padding.bottom - 4, emptyBaseline);
    const emptyText = hasLine ? '' : `<text class="empty" x="50%" y="${emptyY}" text-anchor="middle" dominant-baseline="middle">Roll to start the trend</text>`;

    return `
        <svg class="roll-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            ${xGridLines}
            <line class="zero-line" x1="${padding.left}" y1="${getY(0)}" x2="${width - padding.right}" y2="${getY(0)}"></line>
            <line class="axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
            ${hasLine ? `<polyline class="line" points="${points}"></polyline>` : ''}
            ${emptyText}
            <text class="label" x="${padding.left - 8}" y="${padding.top + 3}" text-anchor="end">+4x</text>
            <text class="label" x="${padding.left - 8}" y="${getY(2) + 3}" text-anchor="end">+2x</text>
            <text class="label" x="${padding.left - 8}" y="${getY(0) + 3}" text-anchor="end">0x</text>
            <text class="label" x="${padding.left - 8}" y="${getY(-2) + 3}" text-anchor="end">-2x</text>
            <text class="label" x="${padding.left - 8}" y="${height - padding.bottom + 3}" text-anchor="end">-4x</text>
        </svg>
    `;
  }

  function openRollLog() {
    const chartHtml = renderChart(S.rollLog);

    const logRows = S.rollLog.length > 0 ? S.rollLog.map(entry => {
        const date = new Date(entry.ts).toLocaleString([], { year:'2-digit', month:'2-digit', day:'2-digit', hour: '2-digit', minute:'2-digit' });
        const outcomeClass = entry.change >= 0 ? 'log-win' : 'log-loss';
        const outcomeSign = entry.change >= 0 ? '+' : '';
        return `<tr>
                    <td><small>${date}</small></td>
                    <td><b>${entry.roll}</b></td>
                    <td>${entry.bet}</td>
                    <td class="${outcomeClass}">${outcomeSign}${entry.change}</td>
                </tr>`;
    }).join('') : `<tr><td colspan="4" class="text-muted" style="padding: 20px 0;">No rolls recorded yet.</td></tr>`;

    const m = modal(`
        <div class="rr-head">🎲 Roll log</div>
        <div class="rr-body">
            <div class="roll-chart-container">
                <h5>Leverage Trend</h5>
                ${chartHtml}
            </div>
            <div class="text-muted" style="font-size:12px; margin:0 0 12px; line-height:1.6; text-align: center;">
              <b>Odds:</b> (1: -4x) (2: -2x) (3: -1x) (4: -0.5x) (5: +0.5x) (6: +1x) (7: +2x) (8: +4x)
            </div>
            <div class="log-table-container">
                <table class="log-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Roll</th>
                            <th>Bet</th>
                            <th>Outcome</th>
                        </tr>
                    </thead>
                    <tbody>${logRows}</tbody>
                </table>
            </div>
        </div>
        <div class="rr-btns">
            <button class="rr-btn" data-action="close-log">Close</button>
            <button class="rr-btn primary" data-action="back-to-settings">Back</button>
        </div>
    `);

    m.el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) { if (e.target === m.el) m.close(); return; }
        const act = btn.getAttribute('data-action');
        if (act === 'close-log') {
            m.close();
            return;
        }
        if (act === 'back-to-settings') {
            m.close();
            openSettings();
        }
    });
  }

  function renderLadderTable(){
    let html = `<table class="ladder"><thead><tr><th>Rank</th><th>Star</th><th>Coins required</th></tr></thead><tbody>`;
    for (const entry of LADDER){
      html += `<tr><td>${EMO[entry.rank]||''} ${entry.rank}</td><td>${ROMAN[entry.star-1]}</td><td>${entry.need} coins</td></tr>`;
    }
    html += `<tr><td>${EMO['Immortal']} Immortal</td><td>—</td><td>${IMMORTAL_MIN}+ coins (open)</td></tr></tbody></table>`;
    return html;
  }

  function showDoneModal(gained){
    const rank = computeRank(S.points);
    const pct = Math.round((rank.progress || 0) * 100);
    const canPrestige = S.points >= IMMORTAL_MIN;
    const primaryButtonHtml = `<button class="rr-btn primary" data-action="switch-to-work">Start Work</button>`;

    const m = modal(`
      <div class="rr-head">🪙 +${gained} coins</div>
      <div class="rr-body">
        <div class="card">
          ${renderRankPill(rank, 'Now')}
          <div class="kv">
            <div class="kv-line"><span>Total 👑 x${S.immortalResets||0} :</span><span class="kv-val"><b>${S.points}</b> 🪙 coins</span></div>
            <div class="kv-line"><span>Progress to next</span><span class="kv-val">${rank.next ? `<b>${S.points - rank.base}</b> / ${rank.next - rank.base} 🪙 coins` : '∞'}</span></div>
          </div>
          <div class="prog"><span style="width:${pct}%"></span></div>
        </div>
      </div>
      <div class="rr-btns" style="justify-content:flex-end;">
        ${canPrestige ? '<button class="rr-btn" data-action="prestige" style="font-weight:700;">Prestige (+1 👑)</button>' : ''}
        <button class="rr-btn" data-action="snooze">Snooze (+5 min)</button>
        ${primaryButtonHtml}
        <button class="rr-btn" data-action="open-settings">Setting</button>
      </div>
    `);

    const root=m.el;
    root.addEventListener('click',(e)=>{
      const btn=e.target.closest('[data-action]');
      if(!btn){ if(e.target===root) m.close(); return; }
      unlockAudio();
      const act=btn.getAttribute('data-action');
      if(act==='open-settings'){ m.close(); openSettings(); return; }

      if(act === 'switch-to-work'){
          S.phase = 'work';
          start(true);
      } else if(act==='snooze'){
        S.overrideDurationMin = 5;
        S.remainingSec = 5 * 60;
        start(false);
      } else if(act==='prestige' && S.points >= IMMORTAL_MIN){
        S.immortalResets = (S.immortalResets||0) + 1;
        const remainder = Math.max(0, S.points - IMMORTAL_MIN);
        S.points = remainder;
        save();
        m.close(); openSettings(); return;
      }
      save(); m.close(); setUI(Math.max(0, Math.ceil((S.endAt ? (S.endAt-Date.now())/1000 : S.remainingSec ?? secOfPhase()))));
    }, {once:false});
  }

  function tick(){
    injectStyles(); mount();
    let sec;
    if (S.running && S.endAt){
      sec = Math.ceil((S.endAt - now())/1000);
      if (sec <= 0){
        const t = now();
        if (t - (S._awardGuardTS || 0) < 1000) { setTimeout(tick, 300); return; }
        S._awardGuardTS = t;

        const prevPoints = S.points || 0;
        const phaseThatJustEnded = S.phase;

        sec=0; S.running=false; S.endAt=null;

        let gained = 0;
        if (phaseThatJustEnded === 'work'){
          gained = S.overrideDurationMin ? S.overrideDurationMin : S.workMin;
        }
        S.points = prevPoints + gained;
        beep3();
        if (didLevelUp(prevPoints, S.points)) {
          levelUpSfx();
        }

        S.overrideDurationMin = null;
        save();
        refreshSettingsModal();

        if (phaseThatJustEnded === 'work') {
            S.phase = 'break';
            start(true);
        } else {
            S.phase = 'work';
            S.remainingSec = secOfPhase();
            save();
        }
        showDoneModal(gained);
      }
    } else { sec = S.remainingSec ?? secOfPhase(); }
    setUI(sec);
  }

  function modal(html){ const mask=document.createElement('div'); mask.className='rr-modal-mask'; mask.innerHTML=`<div class="rr-modal">${html}</div>`; document.body.appendChild(mask); return { el:mask, close:()=>mask.remove() }; }

  let tickInterval;
  function boot(){
    injectStyles();
    if(!document.getElementById(ID)) topbarContainer().appendChild(mount());
    if (S.remainingSec == null){ S.remainingSec = secOfPhase(); save(); }
    const mo=new MutationObserver(()=>{ const parent2=topbarContainer(); const host=document.getElementById(ID); if(host && parent2 && host.parentElement!==parent2) parent2.appendChild(host); });
    mo.observe(document.body, {subtree:true, childList:true, attributes:true});
    if (tickInterval) clearInterval(tickInterval);
    tick();
    tickInterval = setInterval(tick, 1000);
  }
  boot();
})();
