// panel-crud.js - Add / edit / delete for every data section of the admin
// panel. Any element <div class="crud" data-table="KEY"> is rendered as a
// table of real Airtable rows with Editar/Borrar buttons and an Añadir
// button. Optional attributes:
//   data-title   heading text
//   data-filter  JSON {"Field": ["value", ...]} - only rows matching
//   data-preset  JSON {"Field": "value"} - prefilled on new rows
// All writes go through /api/ops-data (session-gated, field whitelist).
(function () {
  const ZONA = { t: 'zona' };
  const DEVICE_TYPES = ['Sensor temperatura/humedad', 'Sensor CO2', 'Sensor CE/pH', 'Sensor PPFD/luz',
    'Climatizacion / HVAC', 'Refrigeracion', 'Calefaccion', 'Ventilacion', 'Iluminacion', 'Riego',
    'Inyeccion CO2', 'Electrico', 'Estacion meteorologica', 'Dron', 'Otro'];
  const PROTOCOLS = ['WiFi', 'Bluetooth / BLE', 'Zigbee', 'LoRa', 'Modbus', 'MQTT', 'BACnet', 'DMX512',
    'MAVLink', 'Otro'];
  const SPECTRA = ['UV', 'Azul', 'Verde', 'Rojo', 'Rojo lejano', 'Infrarrojo', 'Blanco (full spectrum)'];
  const FASES = ['Propagacion', 'Germinacion', 'Vegetativa', 'Preflora', 'Floracion', 'Secado', 'Curado'];
  const PRIO = ['Normal', 'Alta', 'Urgente'];

  const f = (k, l, extra) => Object.assign({ k, l }, extra || {});
  const SCHEMAS = {
    zonas: [f('Nombre', 'Nombre', { req: 1, list: 1 }), f('Tipo', 'Tipo', { t: 'select', o: ['indoor', 'invernadero', 'exterior', 'laboratorio', 'almacen'], list: 1 }),
      f('Fase', 'Fase', { t: 'select', o: FASES, list: 1 }), f('Plantas', 'Plantas', { t: 'number', list: 1 }),
      f('Estado', 'Estado', { t: 'select', o: ['OK', 'Aviso', 'Alerta'], list: 1 })],
    sensores: [f('Zona', 'Zona', Object.assign({ req: 1, list: 1 }, ZONA)), f('Tipo', 'Tipo', { t: 'select', o: ['Temperatura', 'Humedad', 'CE', 'pH', 'CO2'], list: 1 }),
      f('Valor', 'Valor', { t: 'number', list: 1 }), f('Unidad', 'Unidad', { list: 1 }), f('Actualizado', 'Fecha/hora', { t: 'datetime', list: 1 })],
    alertas_ipm: [f('Zona', 'Zona', Object.assign({ req: 1, list: 1 }, ZONA)), f('Plaga', 'Plaga / problema', { req: 1, list: 1 }),
      f('Severidad', 'Severidad', { t: 'select', o: ['Baja', 'Media', 'Alta', 'Urgente'], list: 1 }),
      f('Protocolo', 'Protocolo / acción', { t: 'textarea', list: 1 }), f('Estado', 'Estado', { t: 'select', o: ['Abierta', 'En proceso', 'Resuelta'], list: 1 }),
      f('Creada', 'Fecha/hora', { t: 'datetime' })],
    nutricion: [f('Zona', 'Zona', Object.assign({ req: 1, list: 1 }, ZONA)), f('N', 'N (mg/L)', { t: 'number', list: 1 }), f('P', 'P (mg/L)', { t: 'number', list: 1 }),
      f('K', 'K (mg/L)', { t: 'number', list: 1 }), f('Ca', 'Ca (mg/L)', { t: 'number', list: 1 }), f('Mg', 'Mg (mg/L)', { t: 'number', list: 1 }),
      f('CE', 'CE objetivo (mS/cm)', { t: 'number', list: 1 }), f('pH', 'pH objetivo', { t: 'number', list: 1 }),
      f('Micronutrientes', 'Micronutrientes (Fe, Mn, Zn, Cu, B, Mo…)', { list: 1 })],
    personal: [f('Nombre', 'Nombre', { req: 1, list: 1 }), f('Rol', 'Tipo / rol', { t: 'select', o: ['Jefe de cultivo', 'Tecnico de cultivo', 'Tecnico IPM', 'Responsable de zona', 'Agronomo', 'Operario', 'Laboratorio', 'Administracion'], list: 1 }),
      f('Calificacion', 'Calificación', { list: 1 }), f('Especialidad', 'Especialidad', { list: 1 }),
      f('ZonaActual', 'Zona asignada', Object.assign({ list: 1 }, ZONA)), f('TareaActual', 'Tarea asignada', { list: 1 }),
      f('Prioridad', 'Prioridad', { t: 'select', o: PRIO }), f('DispositivoEmpresa', 'Dispositivo de empresa (ID)', { list: 1 }),
      f('Acceso', 'Acceso al panel', { t: 'select', o: ['Jefe de cultivo', 'Operario'], list: 1 }),
      f('EnTurno', 'En turno', { t: 'bool', list: 1 })],
    ciclos: [f('Nombre', 'Nombre', { req: 1, list: 1 }), f('Variedad', 'Variedad', { list: 1 }), f('Fase', 'Fase', { t: 'select', o: FASES, list: 1 }),
      f('SemanaActual', 'Semana actual', { t: 'number', list: 1 }), f('SemanaTotal', 'Semanas totales', { t: 'number', list: 1 }),
      f('FechaInicio', 'Inicio', { t: 'date', list: 1 }), f('FechaCosechaEstimada', 'Cosecha estimada', { t: 'date', list: 1 }),
      f('Plantas', 'Plantas', { t: 'number', list: 1 }), f('Zona', 'Zona', Object.assign({ list: 1 }, ZONA)), f('Estado', 'Estado', { list: 1 })],
    drones: [f('Nombre', 'Nombre', { req: 1, list: 1 }), f('Sector', 'Sector', { list: 1 }),
      f('Estado', 'Estado', { t: 'select', o: ['Desconectado', 'En base', 'En vuelo', 'Alerta'], list: 1 }),
      f('BateriaPct', 'Batería %', { t: 'number', list: 1 }), f('UltimaDeteccion', 'Última detección', { list: 1 })],
    dispositivos: [f('Nombre', 'Nombre', { req: 1, list: 1 }), f('Tipo', 'Tipo', { t: 'select', o: DEVICE_TYPES, req: 1, list: 1 }),
      f('Espectro', 'Espectro (solo iluminación)', { t: 'select', o: SPECTRA, list: 1 }), f('Zona', 'Zona', Object.assign({ list: 1 }, ZONA)),
      f('Protocolo', 'Canal de conexión', { t: 'select', o: PROTOCOLS, req: 1, list: 1 }),
      f('Direccion', 'Dirección / MAC / serie', { list: 1 }), f('Endpoint', 'Topic MQTT / URL', {}),
      f('Estado', 'Estado', { t: 'select', o: ['Pendiente de conectar', 'Conectado', 'Error', 'Desconectado'], list: 1 }),
      f('UltimaLectura', 'Última lectura', { list: 1, ro: 1 }), f('_id', 'ID para el gateway', { list: 1, ro: 1 }), f('UltimaLecturaEn', 'Leída en', { t: 'datetime', list: 1, ro: 1 }),
      f('Notas', 'Notas', { t: 'textarea' })],
    agua: [f('Etapa', 'Etapa', { req: 1, list: 1 }), f('Orden', 'Orden', { t: 'number', list: 1 }), f('pH', 'pH', { t: 'number', list: 1 }),
      f('EC_TDS', 'EC/TDS', { t: 'number', list: 1 }), f('CaudalLmin', 'Caudal L/min', { t: 'number', list: 1 }),
      f('Estado', 'Estado', { t: 'select', o: ['Sin sensor conectado', 'OK', 'Revisar', 'Saturado'], list: 1 }), f('Notas', 'Notas', { t: 'textarea' })],
    mediciones_agua: [f('Zona', 'Zona', Object.assign({ req: 1, list: 1 }, ZONA)), f('Fecha', 'Fecha', { t: 'date', list: 1 }),
      f('pH_prefiltrado', 'pH prefiltrado', { t: 'number', list: 1 }), f('EC_prefiltrado', 'EC prefiltrado', { t: 'number', list: 1 }),
      f('pH_filtrado', 'pH filtrado', { t: 'number', list: 1 }), f('EC_filtrado', 'EC filtrado', { t: 'number', list: 1 }),
      f('pH_final', 'pH solución final', { t: 'number', list: 1 }), f('EC_final', 'EC solución final', { t: 'number', list: 1 }),
      f('Notas', 'Notas', { t: 'textarea' })],
    tareas: [f('Tarea', 'Tarea', { req: 1, list: 1 }), f('Zona', 'Zona', Object.assign({ list: 1 }, ZONA)), f('Tecnico', 'Técnico', { t: 'empleado', list: 1 }),
      f('Fecha', 'Fecha', { t: 'date', list: 1 }), f('Estado', 'Estado', { t: 'select', o: ['Pendiente', 'En curso', 'Hecho'], list: 1 }),
      f('Prioridad', 'Prioridad', { t: 'select', o: PRIO, list: 1 }), f('Notas', 'Notas', { t: 'textarea' })],
    trampas: [f('Zona', 'Zona', Object.assign({ req: 1, list: 1 }, ZONA)), f('Plaga', 'Plaga', { req: 1, list: 1 }),
      f('Recuento', 'Recuento', { t: 'number', list: 1 }), f('Umbral', 'Umbral', { t: 'number', list: 1 }), f('Fecha', 'Fecha', { t: 'date', list: 1 })],
    liberaciones: [f('Agente', 'Agente biológico', { req: 1, list: 1 }), f('PlagaObjetivo', 'Plaga objetivo', { list: 1 }),
      f('Zona', 'Zona', Object.assign({ list: 1 }, ZONA)), f('Dosis', 'Dosis', { list: 1 }), f('Fecha', 'Fecha', { t: 'date', list: 1 })],
    riegos: [f('Zona', 'Zona', Object.assign({ req: 1, list: 1 }, ZONA)), f('Hora', 'Hora', { list: 1 }), f('VolumenLm2', 'Volumen L/m²', { t: 'number', list: 1 }),
      f('Formula', 'Fórmula', { list: 1 }), f('Estado', 'Estado', { t: 'select', o: ['Programado', 'Ejecutado', 'Cancelado'], list: 1 })],
    mejoras: [f('Titulo', 'Qué quiere mejorar o añadir', { req: 1, list: 1 }), f('Detalle', 'Detalle (cuanto más concreto, mejor)', { t: 'textarea', req: 1, list: 1 }),
      f('Tipo', 'Tipo', { t: 'select', o: ['Función nueva', 'Eficiencia', 'Conector / equipo', 'Error', 'Otro'], list: 1 })],
    conocimiento: [f('Titulo', 'Título', { req: 1, list: 1 }),
      f('Categoria', 'Categoría', { t: 'select', o: ['Plagas', 'Enfermedades', 'Nutricion', 'Riego y agua', 'Clima', 'Variedades', 'Protocolos GACP', 'Otros'], list: 1 }),
      f('Contenido', 'Contenido', { t: 'textarea', req: 1, list: 1 }), f('Fuente', 'Fuente', { list: 1 })],
  };
  window.PANEL_SCHEMAS = SCHEMAS;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rows = key => (window.OPS_DATA && window.OPS_DATA[key]) || [];

  function fmt(field, v) {
    if (v == null || v === '') return '—';
    if (field.t === 'bool') return v ? 'Sí' : 'No';
    if (field.t === 'datetime') { const d = new Date(v); return isNaN(d) ? esc(v) : d.toLocaleString(); }
    const s = String(v);
    return esc(s.length > 80 ? s.slice(0, 80) + '…' : s);
  }

  function matches(row, filter) {
    return Object.keys(filter || {}).every(k => [].concat(filter[k]).includes(row[k]));
  }

  function renderCrud(el) {
    const key = el.dataset.table;
    const schema = SCHEMAS[key];
    if (!schema) return;
    const filter = el.dataset.filter ? JSON.parse(el.dataset.filter) : null;
    const data = rows(key).filter(r => matches(r, filter));
    const cols = schema.filter(x => x.list);
    const title = el.dataset.title || '';
    const preset = el.dataset.preset || '{}';
    el.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div><div class="card-title">${esc(title)}</div><div class="card-subtitle">${data.length} registro(s)</div></div>
          <span class="btn btn-sm btn-green" data-crud-add>+ Añadir</span>
        </div>
        <div style="overflow-x:auto">${data.length ? `<table>
          <thead><tr>${cols.map(c => `<th>${esc(c.l)}</th>`).join('')}<th></th></tr></thead>
          <tbody>${data.map(r => `<tr>${cols.map(c => `<td>${fmt(c, r[c.k])}</td>`).join('')}
            <td style="white-space:nowrap"><span class="btn btn-sm" data-crud-edit="${esc(r._id)}">Editar</span>
            <span class="btn btn-sm" data-crud-del="${esc(r._id)}">Borrar</span></td></tr>`).join('')}</tbody>
        </table>` : '<div style="font-size:12px;color:var(--fg3)">Sin registros todavía. Use "+ Añadir".</div>'}</div>
      </div>`;
    el.querySelector('[data-crud-add]').onclick = () => openForm(key, null, JSON.parse(preset));
    el.querySelectorAll('[data-crud-edit]').forEach(b => { b.onclick = () => openForm(key, b.dataset.crudEdit); });
    el.querySelectorAll('[data-crud-del]').forEach(b => { b.onclick = () => del(key, b.dataset.crudDel); });
  }

  window.renderAllCrud = function () {
    document.querySelectorAll('.crud[data-table]').forEach(renderCrud);
  };

  function modal() {
    let m = document.getElementById('crud-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'crud-modal';
      m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:300;align-items:center;justify-content:center;padding:16px';
      document.body.appendChild(m);
    }
    return m;
  }

  function inputFor(field, value) {
    const v = value == null ? '' : value;
    const id = 'crud-f-' + field.k;
    const ro = field.ro ? ' disabled' : '';
    if (field.t === 'select') {
      return `<select id="${id}"${ro}><option value="">—</option>${field.o.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    }
    if (field.t === 'zona' || field.t === 'empleado') {
      const list = field.t === 'zona' ? rows('zonas').map(z => z.Nombre) : rows('personal').map(p => p.Nombre);
      return `<input type="text" id="${id}" list="${id}-dl" value="${esc(v)}"${ro}><datalist id="${id}-dl">${list.filter(Boolean).map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
    }
    if (field.t === 'textarea') return `<textarea id="${id}" rows="4"${ro}>${esc(v)}</textarea>`;
    if (field.t === 'bool') return `<input type="checkbox" id="${id}"${v ? ' checked' : ''}${ro} style="width:auto">`;
    if (field.t === 'number') return `<input type="number" step="any" id="${id}" value="${esc(v)}"${ro}>`;
    if (field.t === 'date') return `<input type="date" id="${id}" value="${esc(String(v).slice(0, 10))}"${ro}>`;
    if (field.t === 'datetime') {
      const d = v ? new Date(v) : null;
      const local = d && !isNaN(d) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      return `<input type="datetime-local" id="${id}" value="${local}"${ro}>`;
    }
    return `<input type="text" id="${id}" value="${esc(v)}"${ro}>`;
  }

  function openForm(key, id, preset) {
    const schema = SCHEMAS[key];
    const row = id ? rows(key).find(r => r._id === id) || {} : Object.assign({}, preset || {});
    const m = modal();
    m.innerHTML = `<div class="card" style="width:520px;max-width:95vw;max-height:90vh;overflow-y:auto">
      <div class="card-header"><div class="card-title">${id ? 'Editar' : 'Añadir'}</div><span class="btn btn-sm" data-close>✕</span></div>
      ${schema.map(fl => `<div class="form-row"><label>${esc(fl.l)}${fl.req ? ' *' : ''}</label>${inputFor(fl, row[fl.k])}</div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:10px"><span class="btn btn-green" data-save>Guardar</span><span class="btn" data-close>Cancelar</span></div>
      <div data-err style="color:var(--red);font-size:12px;margin-top:8px"></div></div>`;
    m.style.display = 'flex';
    m.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => { m.style.display = 'none'; }; });
    m.querySelector('[data-save]').onclick = () => save(key, id, m);
  }

  async function save(key, id, m) {
    const err = m.querySelector('[data-err]');
    const fields = {};
    for (const fl of SCHEMAS[key]) {
      if (fl.ro) continue;
      const input = document.getElementById('crud-f-' + fl.k);
      let v;
      if (fl.t === 'bool') v = input.checked;
      else if (fl.t === 'number') v = input.value === '' ? null : Number(input.value);
      else if (fl.t === 'datetime') v = input.value ? new Date(input.value).toISOString() : null;
      else v = input.value.trim() || null;
      if (fl.req && (v == null || v === '')) { err.textContent = 'Falta: ' + fl.l; return; }
      fields[fl.k] = v;
    }
    err.textContent = 'Guardando…';
    const ok = await call(id ? 'PATCH' : 'POST', { table: key, id, fields }, err);
    if (ok) { m.style.display = 'none'; await window.loadOpsData(); }
  }

  async function del(key, id) {
    const m = modal();
    m.innerHTML = `<div class="card" style="width:380px;max-width:95vw">
      <div class="card-title" style="margin-bottom:12px">¿Borrar este registro? No se puede deshacer.</div>
      <div style="display:flex;gap:8px"><span class="btn" style="background:var(--red);color:#fff" data-yes>Borrar</span><span class="btn" data-close>Cancelar</span></div>
      <div data-err style="color:var(--red);font-size:12px;margin-top:8px"></div></div>`;
    m.style.display = 'flex';
    m.querySelector('[data-close]').onclick = () => { m.style.display = 'none'; };
    m.querySelector('[data-yes]').onclick = async () => {
      const ok = await call('DELETE', { table: key, id }, m.querySelector('[data-err]'));
      if (ok) { m.style.display = 'none'; await window.loadOpsData(); }
    };
  }

  async function call(method, body, errEl) {
    try {
      const r = await fetch('/api/ops-data', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { errEl.textContent = 'Error: ' + (data.detail || data.error || r.status); return false; }
      return true;
    } catch (e) {
      errEl.textContent = 'Error de red.';
      return false;
    }
  }

  // ---- Extra live views built from the same real data ----
  const SYS = [
    ['Sensores', ['Sensor temperatura/humedad', 'Sensor CO2', 'Sensor CE/pH', 'Sensor PPFD/luz']],
    ['Drones', ['Dron']], ['Ventilación', ['Ventilacion']], ['Iluminación (espectro)', ['Iluminacion']],
    ['Climatización y refrigeración', ['Climatizacion / HVAC', 'Refrigeracion']], ['Calefacción', ['Calefaccion']],
    ['Riego', ['Riego']], ['CO₂', ['Inyeccion CO2']], ['Eléctrico', ['Electrico']],
    ['Estación meteorológica', ['Estacion meteorologica']], ['Otros', ['Otro']],
  ];

  function buildSistemas() {
    const tabs = document.getElementById('sys-tabs');
    const body = document.getElementById('sys-body');
    if (!tabs || !body || body.dataset.built) return;
    body.dataset.built = '1';
    tabs.innerHTML = SYS.map((s, i) => `<div class="zone-tab${i ? '' : ' active'}" data-sys="${i}">${esc(s[0])}</div>`).join('');
    body.innerHTML = SYS.map((s, i) => `<div data-sys-pane="${i}"${i ? ' hidden' : ''}>
      <div class="crud" data-table="dispositivos" data-title="${esc(s[0])} — equipos dados de alta"
        data-filter='${esc(JSON.stringify({ Tipo: s[1] }))}' data-preset='${esc(JSON.stringify({ Tipo: s[1][0], Estado: 'Pendiente de conectar' }))}'></div></div>`).join('');
    tabs.querySelectorAll('[data-sys]').forEach(t => {
      t.onclick = () => {
        tabs.querySelectorAll('.zone-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        body.querySelectorAll('[data-sys-pane]').forEach(p => { p.hidden = p.dataset.sysPane !== t.dataset.sys; });
      };
    });
  }

  function num(v) { return typeof v === 'number' ? v : (v == null || v === '' ? null : Number(v)); }

  function renderAguaEval() {
    const box = document.getElementById('agua-eval');
    if (!box) return;
    const med = rows('mediciones_agua').slice().sort((a, b) => String(b.Fecha || '').localeCompare(String(a.Fecha || '')));
    const nut = rows('nutricion');
    const zonas = [...new Set(med.map(m => m.Zona).filter(Boolean))];
    if (!zonas.length) { box.innerHTML = '<div style="font-size:12px;color:var(--fg3)">Sin mediciones todavía. Registre una medición por zona en la tabla de abajo.</div>'; return; }
    box.innerHTML = `<table><thead><tr><th>Zona</th><th>Fecha</th><th>pH pre → filtrado → final</th><th>EC final</th><th>Objetivo (Nutrición)</th><th>Resultado</th></tr></thead><tbody>${zonas.map(z => {
      const m = med.find(x => x.Zona === z);
      const n = nut.find(x => x.Zona === z) || {};
      const ph = num(m.pH_final), ec = num(m.EC_final), tph = num(n.pH), tec = num(n.CE);
      let res = 'Sin objetivo en Nutrición', cls = 'badge-gray';
      if (ph == null && ec == null) { res = 'Falta medir la solución final'; }
      else if (tph != null || tec != null) {
        const okPh = tph == null || ph == null || Math.abs(ph - tph) <= 0.3;
        const okEc = tec == null || ec == null || Math.abs(ec - tec) <= 0.2;
        if (okPh && okEc) { res = 'Balanceada ✓'; cls = 'badge-green'; }
        else { res = (okPh ? '' : 'pH fuera de rango ') + (okEc ? '' : 'EC fuera de rango'); cls = 'badge-amber'; }
      }
      const v = x => x == null || x === '' ? '—' : esc(x);
      return `<tr><td>${esc(z)}</td><td>${v(m.Fecha)}</td><td>${v(m.pH_prefiltrado)} → ${v(m.pH_filtrado)} → ${v(m.pH_final)}</td><td>${v(m.EC_final)}</td>
        <td>pH ${v(n.pH)} · CE ${v(n.CE)}</td><td><span class="badge ${cls}">${esc(res)}</span></td></tr>`;
    }).join('')}</tbody></table>
    <div style="font-size:11px;color:var(--fg3);margin-top:6px">Tolerancia: pH ±0,3 · EC ±0,2 mS/cm respecto a la fórmula de la zona.</div>`;
  }

  function isSuper() { return window.PG_ME && window.PG_ME.role === 'super'; }

  function openPinModal(id) {
    const p = rows('personal').find(x => x._id === id) || {};
    const m = modal();
    m.innerHTML = `<div class="card" style="width:440px;max-width:95vw">
      <div class="card-header"><div class="card-title">🔑 Acceso de ${esc(p.Nombre || 'empleado')}</div><span class="btn btn-sm" data-close>✕</span></div>
      <div class="form-row"><label>Nivel de acceso</label><select id="pin-acceso"><option${p.Acceso !== 'Operario' ? ' selected' : ''}>Jefe de cultivo</option><option${p.Acceso === 'Operario' || !p.Acceso ? ' selected' : ''}>Operario</option></select></div>
      <div style="font-size:11px;color:var(--fg3);margin-bottom:8px">Jefe de cultivo: ve y gestiona todo el cultivo. Operario: solo sus tareas, incidencias, fotos y el Grow Agent. Se genera un PIN personal nuevo (el anterior deja de valer).</div>
      <div id="pin-out" style="display:none;margin:10px 0;padding:12px;border:1px solid var(--green);border-radius:8px;text-align:center">
        <div style="font-size:11px;color:var(--fg2)">PIN de acceso — se muestra UNA sola vez</div>
        <div id="pin-val" style="font-family:monospace;font-size:26px;font-weight:700;letter-spacing:3px;margin:6px 0"></div>
        <div style="font-size:11px;color:var(--fg3)">Entrégueselo en persona. No se guarda: si se pierde, genere otro.</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="btn btn-green" data-gen>Generar PIN</span>${p.TienePin ? '<span class="btn" data-rev>Revocar acceso</span>' : ''}<span class="btn" data-close>Cerrar</span></div>
      <div data-err style="color:var(--red);font-size:12px;margin-top:8px"></div></div>`;
    m.style.display = 'flex';
    m.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => { m.style.display = 'none'; window.loadOpsData && window.loadOpsData(); }; });
    const err = m.querySelector('[data-err]');
    m.querySelector('[data-gen]').onclick = async () => {
      err.textContent = 'Generando…';
      const r = await fetch('/api/ops-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_pin', id, acceso: document.getElementById('pin-acceso').value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = 'Error: ' + (d.error || r.status); return; }
      err.textContent = '';
      document.getElementById('pin-val').textContent = d.pin;
      document.getElementById('pin-out').style.display = 'block';
    };
    const rev = m.querySelector('[data-rev]');
    if (rev) rev.onclick = async () => {
      const r = await fetch('/api/ops-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke_pin', id }) });
      if (r.ok) { m.style.display = 'none'; window.loadOpsData && window.loadOpsData(); } else err.textContent = 'No se pudo revocar.';
    };
  }

  function renderPersonalExtras() {
    const pers = rows('personal');
    const zonas = rows('zonas');
    const map = document.getElementById('personal-map');
    if (map) {
      map.innerHTML = zonas.length ? zonas.map(z => {
        const here = pers.filter(p => p.ZonaActual === z.Nombre && p.EnTurno);
        const cls = z.Estado === 'Alerta' ? ' alert' : (z.Estado === 'Aviso' ? ' warn' : (here.length ? ' occupied' : ''));
        return `<div class="zone-cell${cls}" title="${esc(z.Nombre + (here.length ? ' — ' + here.map(p => p.Nombre).join(', ') : ''))}">${esc(z.Nombre)}${here.length ? '<div class="staff-dot" style="background:var(--blue)"></div>' : ''}</div>`;
      }).join('') : '<div style="font-size:12px;color:var(--fg3)">Dé de alta zonas en "Zonas" para ver el mapa.</div>';
    }
    const upd = document.getElementById('personal-updated');
    if (upd) upd.textContent = 'Datos reales · cargados ' + new Date().toLocaleTimeString();
    const cards = document.getElementById('personal-cards');
    if (!cards) return;
    cards.innerHTML = pers.length ? pers.map(p => `<div class="staff-card${p.EnTurno ? ' active' : ''}"${p.EnTurno ? '' : ' style="opacity:.6"'}>
        <div style="display:flex;gap:10px;align-items:center"><div class="staff-avatar-lg">👤</div>
          <div><div class="staff-name">${esc(p.Nombre)}</div><span class="badge ${p.EnTurno ? 'badge-green' : 'badge-gray'}">${p.EnTurno ? 'En turno' : 'Fuera de turno'}</span></div></div>
        <div class="staff-zone"><div class="dot dot-blue"></div> ${p.ZonaActual ? 'Zona ' + esc(p.ZonaActual) : 'Sin zona asignada'}</div>
        <div class="staff-task">${p.TareaActual ? '🔧 ' + esc(p.TareaActual) : 'Sin tarea asignada'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${p.Rol ? `<span class="badge badge-blue">${esc(p.Rol)}</span>` : ''}${p.Calificacion ? `<span class="badge badge-gray">${esc(p.Calificacion)}</span>` : ''}${p.Especialidad ? `<span class="badge badge-gray">${esc(p.Especialidad)}</span>` : ''}</div>
        <div class="staff-time">📱 ${p.DispositivoEmpresa ? 'Dispositivo ' + esc(p.DispositivoEmpresa) : 'Sin dispositivo de empresa'}</div>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap"><span class="btn btn-sm" data-pers-edit="${esc(p._id)}">Asignar / editar ficha</span>${isSuper() ? `<span class="btn btn-sm" data-pers-pin="${esc(p._id)}">🔑 ${p.TienePin ? 'Renovar / revocar PIN' : 'Dar acceso (PIN)'}</span>` : ''}</div>
      </div>`).join('') : '<div style="font-size:12px;color:var(--fg3)">Sin personal dado de alta. Use "+ Añadir" en la ficha de personal.</div>';
    cards.querySelectorAll('[data-pers-edit]').forEach(b => { b.onclick = () => openForm('personal', b.dataset.persEdit); });
    cards.querySelectorAll('[data-pers-pin]').forEach(b => { b.onclick = () => openPinModal(b.dataset.persPin); });
  }

  function renderZoneActions(zone) {
    const box = document.getElementById('zone-actions');
    if (!box) return;
    const items = rows('alertas_ipm').filter(a => a.Zona === zone && a.Estado !== 'Resuelta').map(a => ({ c: 'amber', t: '⚠️ ' + (a.Plaga || 'Alerta'), d: a.Protocolo || a.Severidad || '' }))
      .concat(rows('tareas').filter(t => t.Zona === zone && t.Estado !== 'Hecho').map(t => ({ c: 'blue', t: '🔧 ' + t.Tarea, d: [t.Tecnico, t.Fecha, t.Estado].filter(Boolean).join(' · ') })));
    box.innerHTML = items.length ? items.map(i => `<div class="tl-item"><div class="tl-dot-col"><div class="dot dot-${i.c}"></div></div><div><div style="font-size:12px;font-weight:600">${esc(i.t)}</div><div style="font-size:11px;color:var(--fg2)">${esc(i.d)}</div></div></div>`).join('')
      : '<div style="font-size:12px;color:var(--fg3)">Sin alertas ni tareas abiertas en esta zona.</div>';
    const sub = document.getElementById('zone-subtitle');
    const z = rows('zonas').find(x => x.Nombre === zone);
    if (sub) sub.textContent = z ? [z.Tipo, z.Fase, z.Plantas != null ? z.Plantas + ' plantas' : ''].filter(Boolean).join(' · ') : '';
  }
  window.renderZoneActions = renderZoneActions;

  // ---- Solicitudes de mejora: anyone asks, only the super administrator decides ----
  const MEJ_COLOR = { Pendiente: 'badge-amber', Aprobada: 'badge-green', Rechazada: 'badge-red', 'En desarrollo': 'badge-blue', Publicada: 'badge-green' };
  function renderMejoras() {
    const box = document.getElementById('mejoras-list');
    if (!box) return;
    const list = rows('mejoras').slice().sort((a, b) => String(b.Fecha || '').localeCompare(String(a.Fecha || '')));
    const sup = isSuper();
    const pend = list.filter(m => m.Estado === 'Pendiente').length;
    const badge = document.getElementById('mejoras-badge');
    if (badge) { badge.textContent = sup && pend ? pend : ''; badge.style.display = sup && pend ? 'inline-block' : 'none'; }
    box.innerHTML = list.length ? list.map(m => `<div class="card" style="margin-bottom:10px">
      <div class="card-header"><div><div class="card-title">${esc(m.Titulo)}</div>
        <div class="card-subtitle">${esc([m.Tipo, m.SolicitadaPor && ('por ' + m.SolicitadaPor), m.Rol, m.Fecha && new Date(m.Fecha).toLocaleDateString()].filter(Boolean).join(' · '))}</div></div>
        <span class="badge ${MEJ_COLOR[m.Estado] || 'badge-gray'}">${esc(m.Estado || '—')}</span></div>
      <div style="font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--fg2)">${esc(m.Detalle || '')}</div>
      ${m.NotaRodrigo ? `<div style="font-size:12px;margin-top:8px;padding:8px;border-left:3px solid var(--green);background:var(--bg3)"><strong>Rodrigo:</strong> ${esc(m.NotaRodrigo)}</div>` : ''}
      ${sup ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
        ${m.Estado !== 'Aprobada' ? `<span class="btn btn-sm btn-green" data-mej="${esc(m._id)}" data-st="Aprobada">✓ Aprobar</span>` : ''}
        ${m.Estado !== 'Rechazada' ? `<span class="btn btn-sm" data-mej="${esc(m._id)}" data-st="Rechazada">✗ Rechazar</span>` : ''}
        ${m.Estado === 'Aprobada' ? `<span class="btn btn-sm" data-mej="${esc(m._id)}" data-st="En desarrollo">En desarrollo</span>` : ''}
        ${m.Estado === 'En desarrollo' || m.Estado === 'Aprobada' ? `<span class="btn btn-sm" data-mej="${esc(m._id)}" data-st="Publicada">Publicada</span>` : ''}
        <span class="btn btn-sm" data-mej-del="${esc(m._id)}">Borrar</span></div>` : ''}</div>`).join('')
      : '<div style="font-size:12px;color:var(--fg3)">Todavía no hay solicitudes. Pulse "+ Solicitar mejora" o pídaselo al Grow Agent por voz.</div>';
    box.querySelectorAll('[data-mej]').forEach(b => { b.onclick = () => decideMejora(b.dataset.mej, b.dataset.st); });
    box.querySelectorAll('[data-mej-del]').forEach(b => { b.onclick = () => del('mejoras', b.dataset.mejDel); });
  }

  function decideMejora(id, estado) {
    const m = modal(), cur = rows('mejoras').find(x => x._id === id) || {};
    m.innerHTML = `<div class="card" style="width:460px;max-width:95vw">
      <div class="card-header"><div class="card-title">${esc(estado)}: ${esc(cur.Titulo || '')}</div><span class="btn btn-sm" data-close>✕</span></div>
      <div class="form-row"><label>Nota para quien lo pidió y para el desarrollo (opcional)</label><textarea id="mej-nota" rows="4">${esc(cur.NotaRodrigo || '')}</textarea></div>
      <div style="display:flex;gap:8px"><span class="btn btn-green" data-ok>Confirmar</span><span class="btn" data-close>Cancelar</span></div>
      <div data-err style="color:var(--red);font-size:12px;margin-top:8px"></div></div>`;
    m.style.display = 'flex';
    m.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => { m.style.display = 'none'; }; });
    m.querySelector('[data-ok]').onclick = async () => {
      const r = await fetch('/api/ops-data', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Panel-Approval': '1' },
        body: JSON.stringify({ table: 'mejoras', id, fields: { Estado: estado, NotaRodrigo: document.getElementById('mej-nota').value.trim() || null } }) });
      if (r.ok) { m.style.display = 'none'; window.loadOpsData && window.loadOpsData(); } else m.querySelector('[data-err]').textContent = 'No se pudo guardar.';
    };
  }
  window.openMejoraForm = () => openForm('mejoras', null, {});

  window.renderPanelExtras = function () {
    renderMejoras();
    buildSistemas();
    renderAguaEval();
    renderPersonalExtras();
    const t = document.querySelector('#zone-tabs .zone-tab.active');
    if (t && t.dataset.zone) renderZoneActions(t.dataset.zone);
  };

  window.openCrudForm = openForm;
  if (window.OPS_DATA) { window.renderPanelExtras(); window.renderAllCrud(); }
})();
