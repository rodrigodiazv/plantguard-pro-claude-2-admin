// grow-agent.js - Grow Agent: voice-only assistant of the panel.
// The green button opens the panel and starts a live voice conversation with the
// ElevenLabs agent "PlantGuard Grow Agent" (voice "Master Grower — estilo Jarvis 3"
// plus its own LLM, billed to ElevenLabs). /api/gm-chat gives a signed URL and the
// current operation data; the agent can create/update panel records through two
// client tools that run here, in the logged-in browser, via /api/ops-data.
(function () {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.35.0/+esm';
  let conv = null, starting = false;

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
  #ga-orb{margin:28px auto 0;width:150px;height:150px;border-radius:50%;border:none;cursor:pointer;font-size:54px;color:#fff;
    background:radial-gradient(circle at 35% 35%,#5be08a,#1f7a3d);box-shadow:0 0 0 0 rgba(46,160,67,.6)}
  #ga-orb.live{animation:gaPulse 1.4s infinite}
  #ga-orb.speaking{animation:gaPulse .7s infinite}
  @keyframes gaPulse{0%{box-shadow:0 0 0 0 rgba(46,160,67,.6)}70%{box-shadow:0 0 0 22px rgba(46,160,67,0)}100%{box-shadow:0 0 0 0 rgba(46,160,67,0)}}
  #ga-state{text-align:center;font-size:12px;color:var(--fg2,#555);margin:8px 0 2px;min-height:16px}
  #ga-hint{text-align:center;font-size:12px;color:var(--fg3,#777);margin-bottom:6px}`;

  function build() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const p = document.createElement('div');
    p.id = 'ga-panel';
    p.innerHTML = `
      <div id="ga-head"><span class="ga-title"><span class="ga-dot"></span>Grow Agent · Master Grower</span>
        <span class="btn btn-sm" id="ga-close">✕</span></div>
      <button id="ga-orb" title="Hablar con el Grow Agent">🎙️</button>
      <div id="ga-state"></div>
      <div id="ga-hint">Pulse la esfera para empezar o terminar la conversación</div>
      <div id="ga-msgs"></div>`;
    document.body.appendChild(p);
    p.querySelector('#ga-close').onclick = close;
    p.querySelector('#ga-orb').onclick = () => (conv ? stop() : start());
  }

  function state(t) { const el = document.getElementById('ga-state'); if (el) el.textContent = t; }
  function orb(cls) { const o = document.getElementById('ga-orb'); if (o) o.className = cls || ''; }
  function add(cls, text) {
    const box = document.getElementById('ga-msgs');
    const d = document.createElement('div'); d.className = cls; d.textContent = text;
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }

  async function writeRecord(method, params) {
    let fields;
    try { fields = typeof params.fields_json === 'string' ? JSON.parse(params.fields_json) : (params.fields_json || {}); }
    catch (e) { return JSON.stringify({ ok: false, error: 'fields_json no es JSON válido' }); }
    const body = { table: params.table, fields };
    if (method === 'PATCH') body.id = params.id;
    try {
      const r = await fetch('/api/ops-data', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      const ok = r.ok;
      add('ga-act', (ok ? '✓ ' : '✗ ') + (method === 'POST' ? 'Creado en ' : 'Actualizado en ') + (params.table || '') + (ok ? '' : ' — ' + (d.error || r.status)));
      if (ok && window.loadOpsData) window.loadOpsData();
      return JSON.stringify(ok ? { ok: true, id: d.record && d.record.id } : { ok: false, error: d.detail || d.error || r.status });
    } catch (e) {
      return JSON.stringify({ ok: false, error: 'error de red' });
    }
  }

  async function start() {
    if (conv || starting) return;
    starting = true; orb('live'); state('Conectando con el Grow Agent…');
    try {
      const [{ Conversation }, sess] = await Promise.all([
        import(SDK_URL),
        fetch('/api/gm-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice_session: true }) })
          .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.detail || d.error || r.status); return d; }),
      ]);
      conv = await Conversation.startSession({
        signedUrl: sess.signed_url,
        connectionType: 'websocket',
        dynamicVariables: { ops_context: sess.ops_context || '(sin datos)', user_name: sess.user_name || 'usuario', user_role: sess.user_role || 'usuario' },
        clientTools: {
          crear_registro: params => writeRecord('POST', params),
          actualizar_registro: params => writeRecord('PATCH', params),
        },
        onConnect: () => { state('Escuchando… hable cuando quiera'); orb('live'); },
        onDisconnect: () => { conv = null; orb(''); state('Conversación terminada. Pulse la esfera para hablar.'); },
        onError: msg => { state('Error: ' + msg); },
        onModeChange: ({ mode }) => {
          if (mode === 'speaking') { orb('speaking'); state('Hablando… (puede interrumpirle)'); }
          else { orb('live'); state('Escuchando…'); }
        },
        onMessage: m => {
          const role = m.role || m.source;
          if (m.message) add('ga-m ' + (role === 'user' ? 'ga-u' : 'ga-a'), m.message);
        },
      });
    } catch (e) {
      conv = null; orb('');
      state(String(e && e.name === 'NotAllowedError' ? 'Permita el micrófono en el navegador para hablar.' : 'No se pudo iniciar: ' + (e && e.message || e)));
    } finally {
      starting = false;
    }
  }

  async function stop() {
    const c = conv; conv = null;
    if (c) { try { await c.endSession(); } catch (e) { /* ignore */ } }
    orb(''); state('Conversación terminada. Pulse la esfera para hablar.');
  }

  function open() { document.getElementById('ga-panel').classList.add('open'); if (!conv) start(); }
  function close() { stop(); document.getElementById('ga-panel').classList.remove('open'); }

  build();
  window.openGrowAgent = open;
})();
