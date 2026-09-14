'use strict';

// El panel es solo la interfaz: toda la lógica y los datos viven en la Edge
// Function de Supabase. Acá no hay ningún secreto — la admin key la escribe el
// admin al entrar y queda únicamente en sessionStorage de su propio navegador.
const API_BASE = 'https://qujsyjrpnmmahwfiuhcb.supabase.co/functions/v1/anticheat/api';

const $ = (sel) => document.querySelector(sel);

const NIVELES = ['crítico', 'alto', 'medio', 'bajo', 'sin hallazgos'];

// Etiquetas legibles para los tipos que devuelve el backend.
const TIPO_HALLAZGO = {
  known_mod_menu_package: 'Mod menu instalado',
  known_esp_package: 'App de ESP / wallhack instalada',
  known_aimlock_package: 'App de aimlock instalada',
  known_cheat_process: 'Proceso de cheat corriendo',
  known_injector_process: 'Inyector corriendo',
  device_rooted: 'Celular rooteado',
  xposed_or_lsposed_detected: 'Xposed / LSPosed activo',
  suspicious_overlay_active: 'Cheat dibujando sobre el juego',
  injected_dll_detected: 'DLL inyectada en el juego',
  suspicious_external_process: 'Programa externo sospechoso (posible cheat)',
  keyword_match: 'Palabra clave de cheat encontrada',
};

const TIPO_FIRMA = {
  keyword: 'Palabra clave',
  known_mod_menu_package: 'Android · mod menu',
  known_esp_package: 'Android · ESP / wallhack',
  known_aimlock_package: 'Android · aimlock',
  known_cheat_process: 'PC · proceso de cheat',
  known_injector_process: 'PC · inyector',
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// "sin hallazgos" es correcto pero muy largo para una etiqueta al lado del
// puntaje: en el celular empujaba la fecha fuera de la fila.
function levelLabel(level) {
  return level === 'sin hallazgos' ? 'limpio' : String(level || '');
}

function levelClass(level) {
  // "crítico" -> "critico", "sin hallazgos" -> "sin-hallazgos"
  return String(level || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().replace(/\s+/g, '-').toLowerCase();
}

function formatDate(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function getAdminKey() {
  try {
    return sessionStorage.getItem('adminKey') || '';
  } catch {
    return window.__adminKey || '';
  }
}

function setAdminKey(key) {
  window.__adminKey = key; // respaldo si el navegador bloquea sessionStorage
  try {
    if (key) sessionStorage.setItem('adminKey', key);
    else sessionStorage.removeItem('adminKey');
  } catch {
    /* modo privado o cookies bloqueadas: seguimos con la copia en memoria */
  }
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAdminKey()}`,
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisá tu internet.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || `Error ${res.status}`);
  return body;
}

function showError(message) {
  $('#globalError').textContent = message || '';
}

/** Corre una acción mostrando el error donde corresponda; si la clave dejó de
 *  servir, vuelve al login en vez de dejar la pantalla a medio cargar. */
async function guard(fn) {
  try {
    showError('');
    await fn();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setAdminKey('');
      showLogin('La admin key no es válida.');
      return;
    }
    showError(err.message || 'Algo salió mal.');
  }
}

// ---------------------------------------------------------------------------
// Login / navegación
// ---------------------------------------------------------------------------

function showLogin(message) {
  $('#appSection').hidden = true;
  $('#loginCard').hidden = false;
  $('#loginError').textContent = message || '';
  $('#adminKeyInput').value = '';
}

function showApp() {
  $('#loginCard').hidden = true;
  $('#appSection').hidden = false;
  $('#loginError').textContent = '';
  selectTab('players'); // al entrar siempre arranca en el listado
}

function selectTab(name) {
  for (const tab of document.querySelectorAll('.tab[data-tab]')) {
    tab.classList.toggle('is-active', tab.dataset.tab === name);
  }
  $('#playersTab').hidden = name !== 'players';
  $('#signaturesTab').hidden = name !== 'signatures';
  showError('');
  if (name === 'players') showPlayersList();
  else loadSignatures();
}

// ---------------------------------------------------------------------------
// Jugadores
// ---------------------------------------------------------------------------

function showPlayersList() {
  $('#detailView').hidden = true;
  $('#playersView').hidden = false;
  loadPlayers();
}

function loadPlayers() {
  return guard(async () => {
    const { players } = await api('/admin/players');
    const list = $('#playersList');
    list.innerHTML = '';

    if (!players.length) {
      list.innerHTML = '<p class="empty">Todavía no hay jugadores. Agregá uno acá abajo.</p>';
      return;
    }

    for (const p of players) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'item';
      const nombre = p.display_name ? ` · ${escapeHtml(p.display_name)}` : '';
      // suspicion_score es el máximo histórico; last_score el del último reporte.
      const bajo = p.last_score < p.suspicion_score
        ? `<div class="item-sub">ahora ${p.last_score}</div>` : '';
      item.innerHTML = `
        <div class="item-main">
          <div class="item-title">${escapeHtml(p.free_fire_id)}${nombre}</div>
          <div class="item-sub">
            ${p.report_count} reporte${p.report_count === 1 ? '' : 's'} ·
            último: ${escapeHtml(formatDate(p.last_report_at))}
          </div>
        </div>
        <div class="item-score">
          <div class="score-num">${p.suspicion_score}</div>
          <span class="badge ${levelClass(p.level)}">${escapeHtml(levelLabel(p.level))}</span>
          ${bajo}
        </div>
      `;
      item.addEventListener('click', () => loadDetail(p.id));
      list.appendChild(item);
    }
  });
}

let currentPlayerId = null;

function loadDetail(id) {
  return guard(async () => {
    const { player, reports } = await api(`/admin/players/${id}`);
    currentPlayerId = player.id;

    $('#playersView').hidden = true;
    $('#detailView').hidden = false;
    $('#detailTokenBox').hidden = true;

    $('#detailTitle').textContent = player.display_name
      ? `${player.free_fire_id} — ${player.display_name}`
      : String(player.free_fire_id);

    $('#detailMeta').innerHTML = `
      <div class="meta-item">
        <div class="meta-label">Máximo histórico</div>
        <div class="meta-value">${player.suspicion_score}</div>
        <span class="badge ${levelClass(player.level)}">${escapeHtml(levelLabel(player.level))}</span>
      </div>
      <div class="meta-item">
        <div class="meta-label">Último reporte</div>
        <div class="meta-value">${player.last_score}</div>
        <span class="badge ${levelClass(player.last_level)}">${escapeHtml(levelLabel(player.last_level))}</span>
      </div>
      <div class="meta-item">
        <div class="meta-label">Reportes</div>
        <div class="meta-value">${player.report_count}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Visto por última vez</div>
        <div class="meta-value" style="font-size:.9rem">${escapeHtml(formatDate(player.last_report_at))}</div>
      </div>
    `;

    const container = $('#detailReports');
    container.innerHTML = '';
    if (!reports.length) {
      container.innerHTML = '<p class="empty">Este jugador todavía no mandó ningún reporte.</p>';
      return;
    }

    for (const r of reports) {
      const box = document.createElement('div');
      box.className = 'report';
      const findings = r.findings || [];
      const findingsHtml = findings.length
        ? `<ul class="findings-list">${findings.map((f) => `
            <li>⚠️ <strong>${escapeHtml(TIPO_HALLAZGO[f.type] || f.type)}</strong>
            (+${f.weight}) — ${escapeHtml(f.detail)}</li>`).join('')}</ul>`
        : '<p class="empty">Sin hallazgos en este reporte.</p>';
      box.innerHTML = `
        <div class="report-head">
          <strong>${r.source === 'android' ? '📱 Android' : '🖥️ PC'} — ${r.score} pts</strong>
          <span class="report-when">${escapeHtml(formatDate(r.created_at))}</span>
        </div>
        ${findingsHtml}
      `;
      container.appendChild(box);
    }
  });
}

// ---------------------------------------------------------------------------
// Firmas
// ---------------------------------------------------------------------------

function loadSignatures() {
  return guard(async () => {
    const { signatures } = await api('/admin/signatures');
    const list = $('#sigList');
    list.innerHTML = '';

    if (!signatures.length) {
      list.innerHTML = `<p class="empty">
        El catálogo está vacío a propósito: no inventamos nombres de cheats.
        Aun así el sistema ya detecta root, Xposed y DLLs inyectadas.
        Agregá acá lo que vayan confirmando en la comunidad.
      </p>`;
      return;
    }

    for (const s of signatures) {
      const item = document.createElement('div');
      item.className = 'item';
      item.style.cursor = 'default';
      item.innerHTML = `
        <div class="item-main">
          <div class="item-title">${escapeHtml(s.value)}</div>
          <div class="item-sub">
            ${escapeHtml(TIPO_FIRMA[s.kind] || s.kind)}${s.note ? ` · ${escapeHtml(s.note)}` : ''}
          </div>
        </div>
      `;
      const del = document.createElement('button');
      del.className = 'danger small';
      del.textContent = 'Quitar';
      del.addEventListener('click', () => guard(async () => {
        if (!confirm(`¿Quitar "${s.value}" del catálogo?`)) return;
        await api(`/admin/signatures/${s.id}`, { method: 'DELETE' });
        loadSignatures();
      }));
      item.appendChild(del);
      list.appendChild(item);
    }
  });
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function login() {
  const key = $('#adminKeyInput').value.trim();
  if (!key) {
    $('#loginError').textContent = 'Escribí tu admin key.';
    return;
  }
  setAdminKey(key);
  showApp();
}

$('#loginBtn').addEventListener('click', login);
$('#adminKeyInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});

$('#logoutBtn').addEventListener('click', () => {
  setAdminKey('');
  showLogin('');
});

for (const tab of document.querySelectorAll('.tab[data-tab]')) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
}

$('#refreshBtn').addEventListener('click', loadPlayers);
$('#refreshSigBtn').addEventListener('click', loadSignatures);
$('#backBtn').addEventListener('click', showPlayersList);

$('#addPlayerBtn').addEventListener('click', () => guard(async () => {
  const free_fire_id = $('#ffidInput').value.trim();
  const display_name = $('#nameInput').value.trim();
  if (!free_fire_id) {
    showError('Falta el ID de Free Fire.');
    return;
  }
  const data = await api('/admin/players', {
    method: 'POST',
    body: JSON.stringify({ free_fire_id, display_name }),
  });
  const box = $('#tokenBox');
  box.hidden = false;
  box.innerHTML = `
    Token de <strong>${escapeHtml(free_fire_id)}</strong> — copialo ahora,
    no se vuelve a mostrar (pero se puede regenerar):
    <code>${escapeHtml(data.token)}</code>
  `;
  $('#ffidInput').value = '';
  $('#nameInput').value = '';
  loadPlayers();
}));

$('#regenBtn').addEventListener('click', () => guard(async () => {
  if (!confirm('El token viejo va a dejar de funcionar y el jugador tiene que cargar el nuevo. ¿Seguimos?')) return;
  const data = await api(`/admin/players/${currentPlayerId}/regenerate-token`, { method: 'POST' });
  const box = $('#detailTokenBox');
  box.hidden = false;
  box.innerHTML = `Token nuevo — pasáselo al jugador:<code>${escapeHtml(data.token)}</code>`;
}));

$('#deleteBtn').addEventListener('click', () => guard(async () => {
  if (!confirm('Se borra el jugador y todo su historial de reportes. Esto no se puede deshacer. ¿Seguro?')) return;
  await api(`/admin/players/${currentPlayerId}`, { method: 'DELETE' });
  showPlayersList();
}));

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

if (getAdminKey()) showApp();
else showLogin('');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
