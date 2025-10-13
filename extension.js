/* == POMO GAME v3.9.2 == */

// These variables are defined outside so they can be accessed by both onload and onunload
const ID = 'rr-pomobar';
const STYLE_ID = `${ID}-style`;
let tickInterval = null;
let observer = null;

const onunload = () => {
  // 1. Clear the main timer loop to prevent it from running in the background
  if (tickInterval) {
    clearInterval(tickInterval);
  }

  // 2. Disconnect the MutationObserver to stop it from watching for DOM changes
  if (observer) {
    observer.disconnect();
  }

  // 3. Remove the main UI element from the top bar
  const host = document.getElementById(ID);
  if (host) {
    host.remove();
  }

  // 4. Remove the injected CSS styles
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
  
  // 5. Clean up any open modals just in case
  const modals = document.querySelectorAll('.rr-modal-mask');
  modals.forEach(modal => modal.remove());
};

const onload = () => {
  'use strict';

  const STORE_KEY = `${ID}-state-v380`;

  // sizes & spacing
  const RING = { size: 18, stroke: 2.5 };
  const FONT = 18;
  const SPACE = { gap: 4, ml: 4, mr: -2 };

  // colors (lightened)
  const COLOR_WORK   = '#5C7080';
  const COLOR_BREAK  = '#6AB890';
  const COLOR_TRACK  = '#EDF0F5';
  const COLOR_BASE_BG= '#F7F8FA';
  const COLOR_HOVER_BG = '#EEF2F7';
  const COLOR_BORDER = '#E3E7EE';
  const COLOR_PROGRESS = '#9BB1FF';
  const COLOR_PILL_BG  = '#D7DBE3';
  const COLOR_PILL_TXT = '#2F3A46';

  // Ladder
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

  const LADDER = (() => {
    const list = []; let acc = 0;
    for (let i = 0; i < RANKS.length - 1; i++) {
      const { name, step } = RANKS[i];
      for (let s = 0; s < 5; s++) { acc += step; list.push({ rank: name, star: s + 1, need: acc }); }
    }
    return list;
  })();
  const IMMORTAL_MIN  = LADDER[LADDER.length - 1].need; // 8750
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

  // state
  const defaults = {
    workMin: 25, breakMin: 5, phase: 'work', running: false, endAt: null, remainingSec: null,
    points: 0, immortalResets: 0, _awardGuardTS: 0
  };
  let S = { ...defaults };
  try { Object.assign(S, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch(_) {}
  if (typeof S.immortalResets !== 'number') S.immortalResets = (typeof S.crowns === 'number') ? S.crowns : 0;
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(_) {} };

  // utils
  const now = () => Date.now();
  const secOfPhase = () => (S.phase === 'work' ? S.workMin : S.breakMin) * 60;
  const fmt = (sec) => { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec/60), s = sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const clamp01 = x => Math.max(0, Math.min(1, x));

  // styles
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
.rr-modal{ width:560px; max-width:95vw; max-height:85vh; background:${COLOR_BASE_BG}; border:1px solid ${COLOR_BORDER}; color:#333; border-radius:14px; padding:0; box-shadow:0 16px 48px rgba(0,0,0,.10); display:flex; flex-direction:column; }
.rr-head{ padding:16px 18px; border-bottom:1px solid ${COLOR_BORDER}; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:700; flex-shrink:0; }
.rr-body{ padding:12px 16px; overflow-y:auto; min-height:0; }

.set-grid{ display:grid; gap:12px; grid-template-columns: 1fr; }
.card{ background:#fff; border:1px solid ${COLOR_BORDER}; border-radius:16px; padding:12px 16px; }
.card h4{ margin:0 0 8px; font-size:14px; font-weight:800; }

.row{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin:4px 0; }
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

/* Achievements：标题胶囊 + 左右分栏行 */
.rank-pill{
  width:100%; border-radius:9999px; background:${COLOR_PILL_BG};
  color:${COLOR_PILL_TXT}; font-weight:800; padding:8px 12px;
  display:flex; align-items:center; gap:8px;
}
.rank-pill .star{ color:#F4B400; }

.kv{ margin-top:10px; }
.kv-line{
  display:flex; align-items:center; justify-content:space-between;
  font-size:14px; line-height:1.35; margin:6px 0;
  color:#536171;
}
.kv-line .kv-val{ color:#4A5868; font-weight:700; }

/* 进度条（浅） */
.prog{ height:12px; border-radius:9999px; background:#E9EDF5; position:relative; overflow:hidden; margin-top:8px; }
.prog>span{ position:absolute; left:0; top:0; bottom:0; width:0%; background:${COLOR_PROGRESS}; transition:width .25s ease; }

/* 梯度表 */
.ladder{ width:100%; border-collapse:collapse; font-size:14px; }
.ladder th, .ladder td{ padding:6px 8px; border-bottom:1px dashed ${COLOR_BORDER}; text-align:left; white-space:nowrap; }
.ladder th{ font-weight:800; }

.text-muted{ opacity:.75; }
.star{ color:#f39c12; }

.rr-btns{ display:flex; gap:10px; justify-content:center; padding:12px 18px; border-top:1px solid ${COLOR_BORDER}; flex-shrink:0; background:#fff; border-bottom-left-radius:14px; border-bottom-right-radius:14px; }
.rr-btn{ appearance:none; border:none; background:${COLOR_HOVER_BG}; color:#334155; padding:8px 12px; line-height:1.3; text-align:center; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer; transition: background-color .15s ease, transform .1s ease; }
.rr-btn:hover{ background:#E5EAF2; }
.rr-btn:active{ transform:scale(.98); }
.rr-btn.primary{ background:${COLOR_WORK}; color:#fff; }
.rr-btn.primary:hover{ background-color:#4a5a69; }
`;
    const s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  // mount
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

  // UI
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

  // timer (no pause)
  const start = (reset=false) => {
    const tot = secOfPhase();
    let base = reset ? tot : (S.remainingSec ?? tot);
    if (!isFinite(base) || base <= 0) base = tot;
    S.endAt = Date.now() + base * 1000; S.running = true; save();
  };
  const reset = () => { S.running = false; S.endAt = null; S.remainingSec = secOfPhase(); save(); };
  const togglePhase = () => { S.phase = (S.phase==='work') ? 'break' : 'work'; reset(); setUI(secOfPhase()); };

  // sound
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

  // settings UI
  function openSettings(){
    const rank = computeRank(S.points);
    const percent = Math.round( (rank.progress || 0) * 100 );
    const canPrestige = S.points >= IMMORTAL_MIN;

    const m = modal(`
      <div class="rr-head">PomoGame Settings</div>
      <div class="rr-body">
        <div class="set-grid">
          <div class="card">
            <h4>⌛️ Durations</h4>
            <div class="row"><label for="rr-work">Work Duration</label><input id="rr-work" type="number" min="1" max="180" step="1" value="${S.workMin}"></div>
            <div class="row"><label for="rr-break">Break Duration</label><input id="rr-break" type="number" min="1" max="180" step="1" value="${S.breakMin}"></div>
            <div class="text-muted" style="font-size:12px; margin-top:8px;">Complete a work session to earn EXP. (1 min = 1 EXP)</div>
          </div>

          <div class="card">
            <h4>🏆 Achievements (EXP)</h4>
            <div class="rank-pill">
              <span>${EMO[rank.name]||'🏆'}</span>
              <span>Current Rank:&nbsp;<b>${rank.name}${rank.star?(' '+ROMAN[rank.star-1]):''}</b></span>
              <span class="star" style="margin-left:6px;">${rank.star?('★'.repeat(rank.star)):'★'}</span>
            </div>
            <div class="kv">
              <div class="kv-line"><span>Total (👑 x${S.immortalResets||0}):</span><span class="kv-val"><b>${S.points}</b> EXP</span></div>
              <div class="kv-line"><span>Progress to next</span><span class="kv-val">${rank.next ? `<b>${S.points - rank.base}</b> / ${rank.next - rank.base} EXP` : '∞'}</span></div>
            </div>
            <div class="prog"><span style="width:${percent}%"></span></div>
            <div class="kv-line" style="${canPrestige?'':'display:none;'}; margin-top:8px;">
              <span class="text-muted" style="font-size:12px;">Become Immortal to unlock Prestige.</span>
              <button class="rr-btn" data-action="prestige" style="background:#F5C76C; color:#3a2a00; font-size:14px; padding:6px 10px;">Prestige for a Crown 👑</button>
            </div>
          </div>

          <div class="card">
            <h4>🎖 Rank Ladder</h4>
            <div class="text-muted" style="font-size:12px;">Scroll to view all ranks.</div>
            <div style="max-height:200px; overflow:auto; border:1px dashed ${COLOR_BORDER}; border-radius:12px; background:#FBFCFF; margin-top:8px;">
              ${renderLadderTable()}
            </div>
          </div>
        </div>
      </div>
      <div class="rr-btns"><button class="rr-btn" data-action="cancel">Close</button><button class="rr-btn primary" data-action="save">Save</button></div>
    `);

    const root = m.el;
    root.addEventListener('click',(e)=>{
      unlockAudio();
      const btn=e.target.closest('button[data-action]');
      if(!btn){ if(e.target===root) m.close(); return; }
      const act=btn.getAttribute('data-action');
      if(act==='cancel'){ m.close(); return; }
      if(act==='save'){
        const w=parseInt(root.querySelector('#rr-work').value,10);
        const b=parseInt(root.querySelector('#rr-break').value,10);
        if(isFinite(w)&&w>0&&isFinite(b)&&b>0){ S.workMin=w; S.breakMin=b; reset(); }
        save(); m.close(); setUI(secOfPhase()); return;
      }
      if(act==='prestige' && S.points >= IMMORTAL_MIN){
        const prev = S.points;
        S.immortalResets = (S.immortalResets||0) + 1;
        S.points = 0; save();
        if (didLevelUp(prev, S.points)) levelUpSfx();
        m.close(); openSettings();
      }
    }, {once:false});
  }

  function renderLadderTable(){
    let html = `<table class="ladder"><thead><tr><th>Rank</th><th>Star</th><th>EXP required</th></tr></thead><tbody>`;
    for (const entry of LADDER){
      html += `<tr><td>${EMO[entry.rank]||''} ${entry.rank}</td><td>${ROMAN[entry.star-1]}</td><td>${entry.need} EXP</td></tr>`;
    }
    html += `<tr><td>${EMO['Immortal']} Immortal</td><td>—</td><td>${IMMORTAL_MIN}+ (open)</td></tr></tbody></table>`;
    return html;
  }

  // done modal
  function showDoneModal(gainedExp){
    const rank = computeRank(S.points);
    const pct = Math.round((rank.progress || 0) * 100);
    const nextPhaseName = (S.phase === 'work') ? 'Break' : 'Work';
    const canPrestige = S.points >= IMMORTAL_MIN;

    const m = modal(`
      <div class="rr-head">✨ +${gainedExp} EXP</div>
      <div class="rr-body">
        <div class="card">
          <div class="rank-pill">
            <span>${EMO[rank.name]||'🏆'}</span>
            <span>Now:&nbsp;<b>${rank.name}${rank.star?(' '+ROMAN[rank.star-1]):''}</b></span>
            <span class="star" style="margin-left:6px;">${rank.star?('★'.repeat(rank.star)):'★'}</span>
          </div>
          <div class="kv">
            <div class="kv-line"><span>Total (👑 x${S.immortalResets||0}):</span><span class="kv-val"><b>${S.points}</b> EXP</span></div>
            <div class="kv-line"><span>Progress to next</span><span class="kv-val">${rank.next ? `<b>${S.points - rank.base}</b> / ${rank.next - rank.base} EXP` : '∞'}</span></div>
          </div>
          <div class="prog"><span style="width:${pct}%"></span></div>
        </div>
      </div>
      <div class="rr-btns" style="justify-content:flex-end;">
        ${canPrestige ? '<button class="rr-btn" data-action="prestige">Prestige (+1 👑)</button>' : ''}
        <button class="rr-btn" data-action="snooze">Snooze (+5 min)</button>
        <button class="rr-btn primary" data-action="switch">Start ${nextPhaseName}</button>
        <button class="rr-btn" data-action="open-settings">Setting</button>
      </div>
    `);

    const root=m.el;
    root.addEventListener('click',(e)=>{
      unlockAudio();
      const btn=e.target.closest('[data-action]');
      if(!btn){ if(e.target===root) m.close(); return; }
      const act=btn.getAttribute('data-action');
      if(act==='open-settings'){ m.close(); openSettings(); return; }
      if(act==='snooze'){ S.remainingSec = 5 * 60; start(false); }
      if(act==='switch'){ S.phase=(S.phase==='work')?'break':'work'; start(true); }
      if(act==='prestige' && S.points >= IMMORTAL_MIN){
        const prev = S.points;
        S.immortalResets = (S.immortalResets||0) + 1;
        S.points = 0; save();
        if (didLevelUp(prev, S.points)) levelUpSfx();
        m.close(); openSettings(); return;
      }
      save(); m.close(); setUI(Math.max(0, Math.ceil((S.endAt ? (S.endAt-Date.now())/1000 : S.remainingSec ?? secOfPhase()))));
    }, {once:false});
  }

  // loop
  function tick(){
    injectStyles();
    mount();
    let sec;
    if (S.running && S.endAt){
      sec = Math.ceil((S.endAt - now())/1000);
      if (sec <= 0){
        const t = now();
        if (t - (S._awardGuardTS || 0) < 1000) { return; } // Removed setTimeout here
        S._awardGuardTS = t;

        const prevPoints = S.points || 0;
        sec=0; S.running=false; S.endAt=null;

        let gained = 0;
        if (S.phase === 'work'){ gained = S.workMin; S.points = prevPoints + gained; }
        beep3();
        if (didLevelUp(prevPoints, S.points)) levelUpSfx();

        S.remainingSec = secOfPhase();
        save(); showDoneModal(gained);
      }
    } else { sec = S.remainingSec ?? secOfPhase(); }
    setUI(sec);
  }

  // modal helper
  function modal(html){ const mask=document.createElement('div'); mask.className='rr-modal-mask'; mask.innerHTML=`<div class="rr-modal">${html}</div>`; document.body.appendChild(mask); return { el:mask, close:()=>mask.remove() }; }

  // Initial setup logic moved from boot()
  injectStyles();
  if(!document.getElementById(ID)) topbarContainer().appendChild(mount());
  if (S.remainingSec == null){ S.remainingSec = secOfPhase(); save(); }
  observer = new MutationObserver(()=>{ const parent2=topbarContainer(); const host=document.getElementById(ID); if(host && parent2 && host.parentElement!==parent2) parent2.appendChild(host); });
  observer.observe(document.body, {subtree:true, childList:true, attributes:true});
  
  // Start the main loop using setInterval for easy cleanup
  tickInterval = setInterval(tick, 1000);
};

export default {
  onload,
  onunload,
};
