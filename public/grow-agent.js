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
  #ga-orb{margin:6px auto 0;width:84px;height:84px;border-radius:50%;border:none;cursor:pointer;font-size:30px;color:#fff;
    background:radial-gradient(circle at 35% 35%,#5be08a,#1f7a3d);box-shadow:0 0 0 0 rgba(46,160,67,.6)}
  #ga-orb.live{animation:gaPulse 1.4s infinite}
  @keyframes gaPulse{0%{box-shadow:0 0 0 0 rgba(46,160,67,.6)}70%{box-shadow:0 0 0 18px rgba(46,160,67,0)}100%{box-shadow:0 0 0 0 rgba(46,160,67,0)}}
  #ga-state{text-align:center;font-size:11px;color:var(--fg2,#555);margin:6px 0 2px;min-height:15px}
  #ga-foot{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--border,#ddd)}
  #ga-foot textarea{flex:1;resize:none;height:42px;font:inherit;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--border,#ccc);background:var(--bg,#fff);color:var(--fg,#111)}
  .ga-chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 8px}
  .ga-chip{font-size:11px;border:1px solid var(--border,#ccc);border-radius:999px;padding:3px 9px;cursor:pointer;color:var(--fg2,#555)}`;

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
      <div class="ga-chips">
        <span class="ga-chip">Póngame al día</span><span class="ga-chip">¿Qué alertas hay abiertas?</span>
        <span class="ga-chip">Plan de hoy para el equipo</span><span class="ga-chip">Estado del agua por zona</span></div>
      <div id="ga-msgs"></div>
      <div id="ga-foot"><textarea id="ga-input" placeholder="Escriba una pregunta, orden o misión…"></textarea>
        <span class="btn btn-green" id="ga-send">Enviar</span></div>`;
    document.body.appendChild(p);
    p.querySelector('#ga-close').onclick = close;
    p.querySelector('#ga-clear').onclick = () => { history = []; save(); renderHistory(); };
    p.querySelector('#ga-voice').onclick = e => { voiceOn = !voiceOn; e.target.textContent = voiceOn ? '🔊' : '🔇'; if (!voiceOn && canTalk) speechSynthesis.cancel(); };
    p.querySelector('#ga-send').onclick = () => sendText();
    p.querySelector('#ga-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } };
    p.querySelector('#ga-orb').onclick = toggleConvo;
    p.querySelectorAll('.ga-chip').forEach(c => { c.onclick = () => send(c.textContent); });
    if (!SR) p.querySelector('#ga-orb').title = 'Este navegador no reconoce voz: use Chrome, Edge o Safari, o escriba.';
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
    if (!history.length) add('ga-a', 'Hola. Soy el Grow Agent. Pregúnteme por el cultivo, pídame un informe o deme una orden: puedo crear tareas, alertas, mediciones y entradas de conocimiento en el panel.');
    history.forEach(m => add(m.role === 'user' ? 'ga-u' : 'ga-a', m.content));
  }

  function sendText() {
    const i = document.getElementById('ga-input'); const t = i.value.trim(); if (!t) return; i.value = ''; send(t);
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

  function speak(text) {
    if (!voiceOn || !canTalk) { if (convo) listen(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, ''));
    u.lang = 'es-ES';
    const v = speechSynthesis.getVoices().find(x => x.lang === 'es-ES') || speechSynthesis.getVoices().find(x => x.lang && x.lang.startsWith('es'));
    if (v) u.voice = v;
    u.onstart = () => state('Hablando… (pulse el micrófono para interrumpir)');
    u.onend = () => { state(''); if (convo) listen(); };
    speechSynthesis.speak(u);
  }

  function listen() {
    if (!SR || listening || busy) return;
    rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = e => { const t = e.results[0][0].transcript.trim(); if (t) send(t); };
    rec.onerror = e => { if (e.error === 'not-allowed') { convo = false; setOrb(); state('Permita el micrófono en el navegador para hablar.'); } };
    rec.onend = () => { listening = false; if (!busy && convo && !(canTalk && speechSynthesis.speaking)) state('Conversación activa — hable cuando quiera'); };
    try { rec.start(); listening = true; state('Escuchando…'); } catch (e) { listening = false; }
  }
  function stopListening() { if (rec && listening) { try { rec.stop(); } catch (e) { /* ignore */ } } listening = false; }

  function setOrb() { const o = document.getElementById('ga-orb'); if (o) o.classList.toggle('live', convo); }
  function toggleConvo() {
    if (!SR) { state('Este navegador no reconoce voz: use Chrome, Edge o Safari, o escriba.'); return; }
    if (canTalk) speechSynthesis.cancel();
    convo = !convo; setOrb();
    if (convo) listen(); else { stopListening(); state(''); }
  }

  function open() { document.getElementById('ga-panel').classList.add('open'); document.getElementById('ga-input').focus(); }
  function close() { convo = false; setOrb(); stopListening(); if (canTalk) speechSynthesis.cancel(); document.getElementById('ga-panel').classList.remove('open'); }

  build();
  window.openGrowAgent = open;
  if (canTalk) speechSynthesis.getVoices();
})();
