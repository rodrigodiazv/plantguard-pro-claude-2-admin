// grow-agent.js - Grow Agent panel: chat by text or voice with the Master Grower.
// Voice uses the browser's own speech recognition and speech synthesis (no extra
// service). The agent answers from real Airtable data and can create/update
// records through /api/gm-chat; the panel reloads its data after any action.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STORE = 'pg-grow-agent-history';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(STORE) || '[]').slice(-20); } catch (e) { history = []; }
  let voiceOn = true, convo = false, busy = false, rec = null, listening = false;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canTalk = 'speechSynthesis' in window;

  const css = `
  #ga-panel{position:fixed;top:0;left:0;bottom:0;width:min(440px,100vw);background:var(--bg2,#fff);border-right:1px solid var(--border,#ddd);
    z-index:400;display:none;flex-direction:column;box-shadow:4px 0 24px rgba(0,0,0,.25)}
  #ga-panel.open{display:flex}
  #ga-head{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--border,#ddd)}
  #ga-head .ga-title{font-weight:700;font-size:14px;flex:1}
  #ga-head .ga-dot{width:8px;height:8px;border-radius:50%;background:var(--green,#2ea043);display:inline-block;margin-right:6px}
  #ga-msgs{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
  .ga-m{max-width:88%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
  .ga-u{align-self:flex-end;background:var(--green,#2ea043);color:#fff}
  .ga-a{align-self:flex-start;background:var(--bg3,#f3f3f3);color:var(--fg,#111)}
  .ga-act{align-self:flex-start;font-size:11px;color:var(--fg2,#555);background:var(--bg3,#f3f3f3);border:1px dashed var(--border,#ccc);border-radius:8px;padding:4px 8px}
  #ga-orb{margin:28px auto 0;width:150px;height:150px;font-size:54px !important;border-radius:50%;border:none;cursor:pointer;font-size:30px;color:#fff;
    background:radial-gradient(circle at 35% 35%,#5be08a,#1f7a3d);box-shadow:0 0 0 0 rgba(46,160,67,.6)}
  #ga-orb.live{animation:gaPulse 1.4s infinite}
  @keyframes gaPulse{0%{box-shadow:0 0 0 0 rgba(46,160,67,.6)}70%{box-shadow:0 0 0 18px rgba(46,160,67,0)}100%{box-shadow:0 0 0 0 rgba(46,160,67,0)}}
  #ga-state{text-align:center;font-size:11px;color:var(--fg2,#555);margin:6px 0 2px;min-height:15px}
  #ga-hint{text-align:center;font-size:12px;color:var(--fg3,#777);margin-bottom:6px}`;

  function build() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const p = document.createElement('div');
    p.id = 'ga-panel';
    p.innerHTML = `
      <div id="ga-head"><span class="ga-title"><span class="ga-dot"></span>Grow Agent · Master Grower</span>
        <span class="btn btn-sm" id="ga-voice" title="Leer respuestas en voz alta">🔊</span>
        <span class="btn btn-sm" id="ga-clear" title="Nueva conversación">↺</span>
        <span class="btn btn-sm" id="ga-close">✕</span></div>
      <button id="ga-orb" title="Conversación por voz">🎙️</button>
      <div id="ga-state"></div>
      <div id="ga-hint">Pulse la esfera para hablar o para pausar</div>
      <div id="ga-msgs"></div>`;
    document.body.appendChild(p);
    p.querySelector('#ga-close').onclick = close;
    p.querySelector('#ga-clear').onclick = () => { history = []; save(); renderHistory(); };
    p.querySelector('#ga-voice').onclick = e => { voiceOn = !voiceOn; e.target.textContent = voiceOn ? '🔊' : '🔇'; if (!voiceOn) hush(); };
    p.querySelector('#ga-orb').onclick = toggleConvo;
    if (!SR) p.querySelector('#ga-orb').title = 'Este navegador no reconoce voz: use Chrome, Edge o Safari.';
    renderHistory();
  }

  function save() { try { localStorage.setItem(STORE, JSON.stringify(history.slice(-20))); } catch (e) { /* optional */ } }
  function state(t) { const el = document.getElementById('ga-state'); if (el) el.textContent = t; }

  function add(cls, text) {
    const box = document.getElementById('ga-msgs');
    const d = document.createElement('div'); d.className = 'ga-m ' + cls; d.textContent = text;
    box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
  }

  function renderHistory() {
    const box = document.getElementById('ga-msgs'); box.innerHTML = '';
    if (!history.length) add('ga-a', 'Grow Agent en línea. Hable cuando quiera: estado del cultivo, órdenes, misiones o incidencias en su turno (goteras, plantas dañadas, averías). Le doy el protocolo paso a paso y lo registro en el panel.');
    history.forEach(m => add(m.role === 'user' ? 'ga-u' : 'ga-a', m.content));
  }


  async function send(text) {
    if (busy) return;
    busy = true; stopListening();
    history.push({ role: 'user', content: text }); save(); add('ga-u', text);
    const wait = add('ga-a', 'Pensando…'); state('Analizando datos del cultivo…');
    let reply;
    try {
      const r = await fetch('/api/gm-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        reply = d.reply || '(sin respuesta)';
        (d.actions || []).forEach(a => {
          const box = document.getElementById('ga-msgs');
          const el = document.createElement('div'); el.className = 'ga-act';
          el.innerHTML = (a.ok ? '✓ ' : '✗ ') + esc((a.herramienta === 'crear_registro' ? 'Creado en ' : 'Actualizado en ') + (a.tabla || '')) + (a.ok ? '' : ' — ' + esc(a.error || ''));
          box.insertBefore(el, wait);
        });
        if ((d.actions || []).some(a => a.ok) && window.loadOpsData) window.loadOpsData();
      } else {
        reply = d.error === 'chat_not_configured' ? 'Falta configurar la clave de Anthropic en el servidor.' : 'No he podido responder (' + (d.detail || d.error || r.status) + ').';
      }
    } catch (e) { reply = 'Error de red. Inténtelo de nuevo.'; }
    wait.textContent = reply;
    history.push({ role: 'assistant', content: reply }); save();
    busy = false; state('');
    speak(reply);
  }

  let audio = null, elevenOk = true;
  function after() { state(''); if (convo) listen(); }
  async function speak(text) {
    if (!voiceOn) { if (convo) listen(); return; }
    const clean = text.replace(/[*#_`]/g, '');
    if (elevenOk) {
      try {
        state('Preparando voz…');
        const r = await fetch('/api/gm-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tts: clean }) });
        if (r.ok) {
          const url = URL.createObjectURL(await r.blob());
          if (audio) audio.pause();
          audio = new Audio(url);
          audio.onplay = () => state('Hablando… (pulse el micrófono para interrumpir)');
          audio.onended = () => { URL.revokeObjectURL(url); after(); };
          await audio.play();
          return;
        }
        if (r.status === 503) elevenOk = false; // no ElevenLabs key yet: use browser voice
      } catch (e) { /* fall back to browser voice */ }
    }
    if (!canTalk) { after(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'es-ES';
    const v = speechSynthesis.getVoices().find(x => x.lang === 'es-ES') || speechSynthesis.getVoices().find(x => x.lang && x.lang.startsWith('es'));
    if (v) u.voice = v;
    u.onstart = () => state('Hablando… (pulse el micrófono para interrumpir)');
    u.onend = after;
    speechSynthesis.speak(u);
  }
  function hush() { if (audio) audio.pause(); if (canTalk) speechSynthesis.cancel(); }

  function listen() {
    if (!SR || listening || busy) return;
    rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = e => { const t = e.results[0][0].transcript.trim(); if (t) send(t); };
    rec.onerror = e => { if (e.error === 'not-allowed') { convo = false; setOrb(); state('Permita el micrófono en el navegador para hablar.'); } };
    rec.onend = () => { listening = false; if (!busy && convo && !(canTalk && speechSynthesis.speaking) && !(audio && !audio.paused)) state('Conversación activa — hable cuando quiera'); };
    try { rec.start(); listening = true; state('Escuchando…'); } catch (e) { listening = false; }
  }
  function stopListening() { if (rec && listening) { try { rec.stop(); } catch (e) { /* ignore */ } } listening = false; }

  function setOrb() { const o = document.getElementById('ga-orb'); if (o) o.classList.toggle('live', convo); }
  function toggleConvo() {
    if (!SR) { state('Este navegador no reconoce voz: use Chrome, Edge o Safari.'); return; }
    hush();
    convo = !convo; setOrb();
    if (convo) listen(); else { stopListening(); state(''); }
  }

  function open() { document.getElementById('ga-panel').classList.add('open'); if (!convo) toggleConvo(); }
  function close() { convo = false; setOrb(); stopListening(); hush(); document.getElementById('ga-panel').classList.remove('open'); }

  build();
  window.openGrowAgent = open;
  if (canTalk) speechSynthesis.getVoices();
})();
