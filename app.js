// Wait for all scripts
window.addEventListener('load', function() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('Service worker:', err));
  }
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined' || typeof htm === 'undefined') {
    document.getElementById('root').innerHTML = '<div style="padding:40px;text-align:center"><h2 style="color:#DC2626">Erro ao carregar</h2><p style="color:#6B7280;margin-top:8px">Verifique sua conexão e recarregue.</p><button onclick="location.reload()" style="margin-top:16px;background:#F59500;color:white;border:none;padding:12px 24px;border-radius:10px;font-size:14px;cursor:pointer;font-weight:600">Recarregar</button></div>';
    return;
  }
  initApp();
});

function initApp() {
const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } = React;
const html = htm.bind(React.createElement);

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function getWeekId(d = new Date()) {
  const dt = new Date(d); dt.setHours(12,0,0,0);
  dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
  const weekYear = dt.getFullYear();
  const w1 = new Date(weekYear, 0, 4, 12, 0, 0, 0);
  const week = 1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}
function weekStartDate(weekId) {
  const m = String(weekId || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return new Date();
  const year = Number(m[1]), week = Number(m[2]);
  const jan4 = new Date(year, 0, 4, 12, 0, 0, 0);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return monday;
}
function wLbl(w) { if (!w) return ''; const [y, n] = w.split('-W'); return `Semana ${parseInt(n)} · ${y}`; }
function todayISO(input = new Date()) { const d = new Date(input); if (Number.isNaN(d.getTime())) return todayISO(new Date()); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0]; }
function dateToWeek(s) { return getWeekId(s ? new Date(s + 'T12:00:00') : new Date()); }
function weekFromDateLabel(s) { return wLbl(dateToWeek(s)); }
function recordLabel(type, rec) {
  const map = { pedido:'Pedido', orcamento:'Orçamento', rnc:'RNC', recebimento:'Recebimento' };
  const base = map[type] || type || 'Registro';
  const sem = rec?.semana ? wLbl(rec.semana) : '';
  const cat = rec?.categoria ? ` · ${rec.categoria}` : '';
  const orig = rec?.origem ? ` · ${rec.origem}` : '';
  return `${base}${sem ? ' ' + sem : ''}${orig}${cat}`.trim();
}
function fDate(s) { if (!s) return ''; try { if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y,m,d]=s.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('pt-BR'); } return new Date(s).toLocaleDateString('pt-BR'); } catch { return ''; } }
function fMoeda(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function nonNeg(v) { const n = parseFloat(v); return Number.isFinite(n) ? Math.max(0, n) : 0; }
function ultimoPrecoGlobal(nome) {
  const t = LS.get('tabPrecos') || {};
  const sems = Object.keys(t).sort().reverse();
  for (const w of sems) {
    const n = parseFloat((t[w] || {})[nome] || 0);
    if (n > 0) return n;
  }
  const orcs = LS.get('orcamentos') || [];
  for (const o of [...orcs].sort((a,b)=>String(b.criadoEm||'').localeCompare(String(a.criadoEm||'')))) {
    const it = (o.itens || []).find(i => i.nome === nome);
    const n = parseFloat(it?.precoUnit || 0);
    if (n > 0) return n;
  }
  return 0;
}
function uid() { if (globalThis.crypto?.randomUUID) return crypto.randomUUID(); return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function genSems() {
  const base = weekStartDate(getWeekId());
  const out = [];
  for (let i = -8; i <= 104; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i * 7);
    out.push(getWeekId(d));
  }
  return [...new Set(out)].sort();
}
function fDateTime(s) { if (!s) return ''; try { return new Date(s).toLocaleString('pt-BR'); } catch { return ''; } }
function recordWeek(rec) { return rec?.semana || dateToWeek(rec?.data || rec?.recebimento?.finalizadoEm || todayISO()); }

/* ══════════════════════════════════════
   STORAGE
══════════════════════════════════════ */
let _lastStorageNotice = 0;
function showStorageError(message) {
  console.error(message);
  const now = Date.now();
  if (now - _lastStorageNotice < 2500) return;
  _lastStorageNotice = now;
  document.querySelector('.nx-storage-alert')?.remove();
  const el = document.createElement('div'); el.className = 'nx-storage-alert';
  el.innerHTML = `<strong>Não foi possível salvar os dados.</strong><br>${String(message || 'O armazenamento local está cheio ou indisponível. Exporte um backup em Configurações e remova fotos antigas.')}<button aria-label="Fechar">×</button>`;
  el.querySelector('button').onclick = () => el.remove();
  document.body.appendChild(el);
}
const LS = {
  get: k => { try { const v = localStorage.getItem('nx:' + k); return v ? JSON.parse(v) : null; } catch (e) { console.warn('Falha ao ler', k, e); return null; } },
  set: (k, v) => {
    try {
      localStorage.setItem('nx:' + k, JSON.stringify(v));
      window.dispatchEvent(new CustomEvent('nx-storage-change', { detail: { key: k } }));
      return true;
    } catch (e) {
      showStorageError(e?.name === 'QuotaExceededError' ? 'O limite de armazenamento foi atingido. Exporte um backup e remova fotos ou registros antigos.' : `Falha ao gravar ${k}: ${e?.message || e}`);
      return false;
    }
  },
  del: k => { try { localStorage.removeItem('nx:' + k); return true; } catch (e) { showStorageError(`Falha ao remover ${k}: ${e?.message || e}`); return false; } },
};
function commitLocal(changes) {
  const previous = {};
  for (const k of Object.keys(changes)) previous[k] = LS.get(k);
  const written = [];
  for (const [k, value] of Object.entries(changes)) {
    if (!LS.set(k, value)) {
      for (const done of written.reverse()) previous[done] == null ? LS.del(done) : LS.set(done, previous[done]);
      return false;
    }
    written.push(k);
  }
  return true;
}
function storageUsage() {
  let chars = 0;
  for (let i=0;i<localStorage.length;i++) { const k=localStorage.key(i); if (k?.startsWith('nx:')) chars += k.length + (localStorage.getItem(k)?.length || 0); }
  return { bytes: chars * 2, mb: chars * 2 / 1024 / 1024 };
}
function isWeekClosed(sem) { return !!(sem && (LS.get('closedWeeks') || []).includes(sem)); }
function ensureWeekOpen(sem, toast, action='alterar este registro') { if (!isWeekClosed(sem)) return true; toast?.show(`Semana fechada: não é possível ${action}.`); return false; }
function closeWeek(sem) { if (!sem) return false; const a = LS.get('closedWeeks') || []; const ok = a.includes(sem) || LS.set('closedWeeks', [...a, sem].sort()); if (ok) auditLog('Fechamento semanal', wLbl(sem)); return ok; }
function reopenWeek(sem, motivo) { if (!String(motivo || '').trim()) return false; const a = (LS.get('closedWeeks') || []).filter(x => x !== sem); const ok = LS.set('closedWeeks', a); if (ok) auditLog('Reabertura semanal', `${wLbl(sem)} · Motivo: ${String(motivo).trim()}`); return ok; }
function isInactiveItem(name) { return (LS.get('inactiveItems') || []).includes(name); }
function toggleInactiveItem(name) { const a = LS.get('inactiveItems') || []; const inactive = a.includes(name); const ok = LS.set('inactiveItems', inactive ? a.filter(x => x !== name) : [...a, name]); if (ok) auditLog(inactive ? 'Item reativado' : 'Item inativado', name); return ok; }
function clearDraft(k) { LS.del('draft_' + k); }
function hydratePedidoDraft(d) { return d ? { origem:d.origem, semana:d.semana || dateToWeek(d.data), data:d.data, responsavel:d.responsavel, notas:d.notas, itens:Object.entries(d.qtds||{}).filter(([_,v])=>nonNeg(v)>0).map(([nome,qtd])=>({nome,qtd:nonNeg(qtd)})) } : null; }

function auditLog(action, detail) {
  const logs = LS.get('audit') || [];
  // Compatível com versões anteriores: algumas telas antigas liam acao/det, outras action/detail.
  const usuario = (LS.get('config') || {}).responsavel || 'Usuário local';
  logs.unshift({ id: uid(), data: new Date().toISOString(), usuario, action, detail, acao: action, det: detail });
  LS.set('audit', logs.slice(0, 1500));
}
function moveToTrash(type, record, motivo='Exclusão administrativa') {
  const trash = LS.get('trash') || [];
  const entry = { id: uid(), type, record, motivo, apagadoEm: new Date().toISOString() };
  const ok = LS.set('trash', [entry, ...trash].slice(0, 300));
  if (ok) auditLog('Exclusão enviada para lixeira', `${type}: ${record?.numero || record?.semana || record?.id || ''}. ${motivo}`);
  return ok;
}
function strongConfirm(msg) {
  const r = prompt(msg + '\n\nDigite EXCLUIR para confirmar.');
  return r === 'EXCLUIR';
}

function nextRncNumber(orig, list = LS.get('rncs') || [], date = todayISO()) {
  const year = Number(String(date || todayISO()).slice(0,4)) || new Date().getFullYear();
  const prefix = `RNC-${orig}-${year}-`;
  const deleted = (LS.get('trash') || []).filter(t => t.type === 'rnc').map(t => t.record).filter(Boolean);
  const used = new Set([...list, ...deleted].map(r => r.numero).filter(n => String(n || '').startsWith(prefix)));
  let max = 0;
  for (const n of used) { const m = String(n).match(/-(\d{4})$/); if (m) max = Math.max(max, Number(m[1])); }
  let candidate;
  do { max += 1; candidate = `${prefix}${String(max).padStart(4,'0')}`; } while (used.has(candidate));
  return candidate;
}
function upsertById(arr, rec) { return arr.some(x => x.id === rec.id) ? arr.map(x => x.id === rec.id ? rec : x) : [rec, ...arr]; }
function canLeaveEditor() {
  if (!window.__nxEditorDirty) return true;
  return confirm('Existem alterações não salvas. Deseja sair e descartá-las?');
}
function useDirtyGuard(snapshot) {
  const initial = useRef(snapshot);
  const dirty = snapshot !== initial.current;
  useEffect(() => {
    window.__nxEditorDirty = dirty;
    const fn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', fn);
    return () => { window.removeEventListener('beforeunload', fn); if (window.__nxEditorDirty === dirty) window.__nxEditorDirty = false; };
  }, [dirty]);
  return {
    dirty,
    leave: cb => { if (!dirty || canLeaveEditor()) { window.__nxEditorDirty = false; cb(); } },
    clean: () => { initial.current = snapshot; window.__nxEditorDirty = false; },
  };
}
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() {
  const data = { app:'NEXUS', version:'2.6.3', exportedAt:new Date().toISOString(), stores:{} };
  for (let i=0;i<localStorage.length;i++) { const k=localStorage.key(i); if (k?.startsWith('nx:')) { try { data.stores[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (error) { console.warn('Backup ignorou uma chave inválida:', k, error); } } }
  downloadJson(`NEXUS_backup_${todayISO()}.json`, data);
  auditLog('Backup exportado', `${Object.keys(data.stores).length} conjuntos de dados`);
}
async function importBackupFile(file) {
  if (!file || file.size > 30 * 1024 * 1024) throw new Error('O arquivo de backup é inválido ou excede 30 MB.');
  const raw = await file.text(); const parsed = JSON.parse(raw);
  if (parsed?.app !== 'NEXUS' || !parsed?.stores || typeof parsed.stores !== 'object' || Array.isArray(parsed.stores)) throw new Error('Arquivo de backup inválido.');
  if (!confirm('Importar este backup substituirá todos os dados locais atuais. Continuar?')) return false;
  const current = {};
  for (let i=0;i<localStorage.length;i++) { const full=localStorage.key(i); if (full?.startsWith('nx:')) current[full.slice(3)] = LS.get(full.slice(3)); }
  const restoreSnapshot = () => {
    const present=[]; for(let i=0;i<localStorage.length;i++){const full=localStorage.key(i);if(full?.startsWith('nx:')) present.push(full.slice(3));}
    for(const k of present) if(!(k in current)) LS.del(k);
    return commitLocal(current);
  };
  exportBackup();
  const changes = {};
  for (const [k,v] of Object.entries(parsed.stores)) {
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(k)) throw new Error(`Chave de backup inválida: ${k}`);
    changes[k] = v;
  }
  if (!commitLocal(changes)) throw new Error('Não foi possível gravar o backup.');
  const incoming = new Set(Object.keys(changes));
  let cleanupOk = true;
  for (const k of Object.keys(current)) if (!incoming.has(k) && !LS.del(k)) cleanupOk = false;
  if (!cleanupOk) {
    restoreSnapshot();
    throw new Error('A importação foi revertida porque alguns dados antigos não puderam ser removidos.');
  }
  LS.del('schemaVersion');
  if (!migrateLocalData()) {
    restoreSnapshot();
    throw new Error('A importação foi revertida porque os dados não puderam ser normalizados.');
  }
  auditLog('Backup importado', `Origem: ${parsed.exportedAt || 'não informada'} · ${Object.keys(changes).length} conjuntos`);
  return true;
}


/* ══════════════════════════════════════
   CATÁLOGO BASE
══════════════════════════════════════ */
const CAT_BASE = {
  CD: {
    label: 'Centro de Distribuição',
    cats: {
      'Peixaria': { unit: 'UND', items: ['PORÇÃO: BADEJO MOQ (550G)','PORÇÃO: CAÇÃO POSTA (700G)','PORÇÃO: CAM CINZA (11.5KG)','PORÇÃO: CAM VG (8 UND) +OU- 300G','PORÇÃO: CAM VM C/ RABO (250G)','PORÇÃO: CAM VM C/ RABO (500G)','PORÇÃO: FILE PEIXE (500G)','PORÇÃO: GORJAO (1KG)','PORÇÃO: LAGOSTA (400G)','PORÇÃO: LULA (200G)','PORÇÃO: MIX DE MARISCO','PORÇÃO: PEROA POSTAS (700G)','PORÇÃO: PEROA POSTINHA (400G)','PORÇÃO: SURURU (250G)'] },
      'Açougue': { unit: 'UND', items: ['MINI HAMBURGUER (60G)','PORÇÃO: CARNE DE SOL (350G)','PORÇÃO: CARNE MOIDA (1KG)','PORÇÃO: FILE MIGNON CUBO (350G)','PORÇÃO: FILE MIGNON KIDS (150G)','PORÇÃO: FILE MIGNON TORNEDOR (300G)'] },
      'Frutos do Mar': { unit: 'KG', items: ['SIRI / ARATU'] },
      'Camarão (KG)': { unit: 'KG', items: ['CAMARÃO MOLHO 7B','CAMARÃO PAULISTINHA'] },
    }
  },
  CP: {
    label: 'Cozinha de Produção',
    cats: {
      'Bases da Cozinha': { unit: 'UND', items: ['MOLHO BRANCO - 2KG','MOLHO DE COCO - 2KG','RECHEIO DE CAMARÃO - 2KG','RECHEIO DE CARNE SECA - 2KG'] },
      'Insumos Processados': { unit: 'UND', items: ['BADEJO/ARRAIA DESFIADO (1KG)','BATATA PALHA DA CASA (3KG)','CARNE SECA COZIDA E DESFIADA (1KG)','CREME DE AIPIM COM LEITE DE COCO (2KG)','FAROFA DA CASA (2KG)','MIX DE MAIONESE (UND)','ÓLEO DE URUCUM (5L)','PAIO EM CUBOS (1KG)','PRESUNTO EM CUBOS (1KG)'] },
      'Petiscos e Bolinhos': { unit: 'UND', items: ['BASE CROQUETE SALMÃO - 5KG','CAMARÃO VM RECHEADO - 12 UND'] },
      'Proteínas': { unit: 'UND', items: ['BACALHAU SAITH (60GR)','POLACA DESSALGADA (1KG)','POLVO COZIDO (400GR)'] },
      'Sobremesas': { unit: 'KG', items: ['ORGULHO DA NUTRI','PUDINZIM DE LEITE','RAINHA DA COCADA'] },
    }
  }
};

function getCatalog() {
  const custom = LS.get('catalog') || { added: [], removed: [], addedCats: [] };
  const m = JSON.parse(JSON.stringify(CAT_BASE));
  for (const c of (custom.addedCats || [])) { if (m[c.orig] && !m[c.orig].cats[c.cat]) m[c.orig].cats[c.cat] = { unit: c.unit || 'UND', items: [] }; }
  for (const a of (custom.added || [])) { if (m[a.orig]?.cats[a.cat] && !m[a.orig].cats[a.cat].items.includes(a.name)) m[a.orig].cats[a.cat].items.push(a.name); }
  for (const r of (custom.removed || [])) { if (m[r.orig]?.cats[r.cat]) m[r.orig].cats[r.cat].items = m[r.orig].cats[r.cat].items.filter(i => i !== r.name); }
  return m;
}

function flatCatalog(cat, opts = {}) {
  const all = [];
  const inactive = LS.get('inactiveItems') || [];
  const custom = LS.get('catalog') || { added: [] };
  for (const [orig, o] of Object.entries(cat)) {
    for (const [c, cv] of Object.entries(o.cats)) {
      for (const item of cv.items) {
        if (!opts.includeInactive && inactive.includes(item)) continue;
        const customItem = (custom.added || []).find(a => a.orig === orig && a.cat === c && a.name === item);
        all.push({ name: item, unit: customItem?.unit || cv.unit, orig, cat: c, inactive: inactive.includes(item) });
      }
    }
  }
  return all;
}

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function useToast() {
  const [m, setM] = useState(null); const t = useRef();
  const show = useCallback((msg, dur = 2600) => { setM(msg); clearTimeout(t.current); t.current = setTimeout(() => setM(null), dur); }, []);
  return { show, ui: m ? html`<div class="toast">${m}</div>` : null };
}

/* ══════════════════════════════════════
   ICONS
══════════════════════════════════════ */
const PATHS = {
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  orc: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z M12 6v6l4 2',
  orders: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 3h6v4H9z M9 12h6 M9 16h3',
  box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01 20.73 6.96 M12 22.08V12',
  handbox: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8 M3.27 6.96L12 12.01 20.73 6.96 M12 22.08V12 M2 17h5l2 2h5a2 2 0 0 0 2-2v0 M2 21h10a4 4 0 0 0 4-4 M16 17h3a2 2 0 0 0 2-2',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  recv: 'M20 12v10H4V12 M22 7H2v5h20z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  rnc: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  rep: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  chart: 'M18 20V10 M12 20V4 M6 20v-6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  plus: 'M12 5v14 M5 12h14',
  x: 'M18 6L6 18 M6 6l12 12',
  chk: 'M20 6L9 17l-5-5',
  cr: 'M9 18l6-6-6-6',
  cl: 'M15 18l-6-6 6-6',
  left: 'M19 12H5 M12 19l-7-7 7-7',
  trash: 'M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  img: 'M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h4l2 3h4a2 2 0 0 1 2 2z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  pen: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
  ref: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  money: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  down: 'M12 3v12 M7 10l5 5 5-5 M5 21h14',
  up: 'M12 21V9 M7 14l5-5 5 5 M5 3h14',
};
function Ic({ n, s = 20, c = '', style = {} }) {
  return html`<svg class=${c} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style=${{ width: s, height: s, flexShrink: 0, ...style }}><path d=${PATHS[n] || ''}/></svg>`;
}
function Spin({ s = 28 }) { return html`<div class="spin" style=${{ width: s, height: s }}/>`; }

/* ══════════════════════════════════════
   LOGO
══════════════════════════════════════ */
function Logo({ size = 118 }) {
  return html`<div class="nx-logo-wrap" style=${{ width: size, height: Math.round(size * 0.68), flexShrink: 0 }}>
    <img class="nx-logo-img" src="logo-ilha-clean.png" alt="Grupo Ilha" onError=${e => { e.target.src = 'logo-ilha.png'; }} style=${{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}/>
  </div>`;
}

/* ══════════════════════════════════════
   HEADER + NAV
══════════════════════════════════════ */
const TABS = [
  { id: 'inicio', l: 'Início', ic: 'home' },
  { id: 'orcamento', l: 'Orçamento', ic: 'money' },
  { id: 'pedidos', l: 'Pedidos', ic: 'orders' },
  { id: 'recebimento', l: 'Recebimento', ic: 'recv' },
  { id: 'rnc', l: 'RNC', ic: 'rnc' },
  { id: 'relatorios', l: 'Relatórios', ic: 'rep' },
  { id: 'analise', l: 'Análise', ic: 'chart' },
  { id: 'admin', l: 'Administração', ic: 'users' },
  { id: 'config', l: 'Configurações', ic: 'gear' },
];
const TAB_NAMES = Object.fromEntries(TABS.map(t => [t.id, t.l]));

function Header({ tab, setTab }) {
  return html`<header>
    <div style=${{ maxWidth: 'none', margin: '0 auto', padding: '18px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button class="nx-brand" onClick=${() => setTab('inicio')} title="Ir para o início" style=${{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}>
        <${Logo} size=${118}/>
        <div class="nx-brand-kicker" style=${{ fontSize: 9, fontWeight: 700, letterSpacing: '.16em', color: 'rgba(255,255,255,.75)', textTransform: 'uppercase' }}>NEXUS · GRUPO ILHA</div>
        <div class="nx-brand-title" style=${{ fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: "'Plus Jakarta Sans',sans-serif", lineHeight: 1.2 }}>${TAB_NAMES[tab] || 'NEXUS'}</div>
      </button>
    </div>
  </header>`;
}

function BottomNav({ tab, setTab }) {
  return html`<nav class="bnav">
    <div style=${{ maxWidth: 'none', margin: '0 auto', display: 'flex', padding: '2px 0' }}>
      ${TABS.map(t => html`
        <button key=${t.id} class=${`nbtn ${tab === t.id ? 'on' : ''}`} onClick=${() => setTab(t.id)} style=${{ minWidth: 0, flex: 1 }}>
          <${Ic} n=${t.ic} s=${19} c="nic"/>
          <span class="nlbl">${t.l}</span>
        </button>`)}
    </div>
  </nav>`;
}

/* ══════════════════════════════════════
   STATUS MAPS
══════════════════════════════════════ */
const ST_PED = { pendente: { l: 'Aguardando', c: 'bgy' }, recebido: { l: 'Recebido', c: 'bgr2' }, parcial: { l: 'Parcial', c: 'bam' }, cancelado: { l: 'Cancelado', c: 'brd2' } };
const ST_RNC = { aberta: { l: 'Aberta', c: 'brd2' }, analise: { l: 'Em acompanhamento', c: 'bam' }, resolvida: { l: 'Concluída', c: 'bgr2' }, cancelada: { l: 'Cancelada', c: 'bgy' } };

function RecordsFilter({ busca, setBusca, origem, setOrigem, status, setStatus, statusOpts=[] }) {
  return html`<div class="card" style=${{ padding:12, marginBottom:14 }}>
    <div style=${{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:8 }}>
      <input class="inp" value=${busca} onInput=${e=>setBusca(e.target.value)} placeholder="Buscar por semana, produto ou responsável..."/>
      <select class="inp" value=${origem} onChange=${e=>setOrigem(e.target.value)}><option value="TODOS">CD + CP</option><option value="CD">CD</option><option value="CP">CP</option></select>
      <select class="inp" value=${status} onChange=${e=>setStatus(e.target.value)}><option value="TODOS">Todos os status</option>${statusOpts.map(o=>html`<option key=${o.v} value=${o.v}>${o.l}</option>`)}</select>
    </div>
  </div>`;
}
function MoreResults({ total, shown, onMore }) {
  if (total <= shown) return null;
  return html`<button class="btn bs" style=${{ width:'100%', marginTop:8 }} onClick=${onMore}>Mostrar mais (${total-shown} restantes)</button>`;
}

/* ══════════════════════════════════════
   INÍCIO
══════════════════════════════════════ */
function InicioTab({ setTab }) {
  const pedidos = LS.get('pedidos') || [];
  const rncs = LS.get('rncs') || [];
  const orcamentos = LS.get('orcamentos') || [];
  const pend = pedidos.filter(p => p.status === 'pendente').length;
  const rncA = rncs.filter(r => r.status === 'aberta' || r.status === 'analise').length;
  const aguardandoRetorno = rncs.filter(r => r.status === 'aberta' && !String(r.respostaFornecedor || '').trim()).length;
  const parcial = pedidos.filter(p => p.status === 'parcial').length;
  const orcPend = orcamentos.filter(o => o.status !== 'autorizado').length;
  const recentes = [...pedidos].sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0)).slice(0, 4);
  return html`<div class="page">
    <div class="card" style=${{ padding: 20, marginBottom: 16, background: 'linear-gradient(135deg,var(--or) 0%,var(--or2) 100%)', color: '#fff', boxShadow: '0 4px 20px rgba(245,149,0,.3)' }}>
      <div style=${{ fontSize: 9, fontWeight: 700, opacity: .75, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>Semana atual</div>
      <div style=${{ fontSize: 21, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>${wLbl(getWeekId())}</div>
      <div style=${{ fontSize: 12, opacity: .8, marginTop: 4 }}>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
    <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
      ${[[`Pedidos pendentes`, pend, pend > 0 ? 'var(--or)' : 'var(--ink)', 'recebimento'],
        [`RNCs abertas`, rncA, rncA > 0 ? 'var(--rd)' : 'var(--ink)', 'rnc'],
        [`Recebimentos parciais`, parcial, parcial > 0 ? 'var(--am)' : 'var(--ink)', 'recebimento'],
        [`Orçamentos a autorizar`, orcPend, orcPend > 0 ? 'var(--bl)' : 'var(--ink)', 'orcamento'],
      ].map(([l, v, c, t]) => html`
        <button class="stcard" key=${l} onClick=${() => setTab(t)}>
          <div style=${{ fontSize: 10, fontWeight: 700, color: 'var(--s3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>${l}</div>
          <div style=${{ fontSize: 30, fontWeight: 800, color: c, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>${v}</div>
        </button>`)}
    </div>
    ${aguardandoRetorno > 0 && html`<button class="card" style=${{ width:'100%', border:'1.5px solid var(--rd)', background:'var(--rd3)', padding:'13px 16px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', textAlign:'left' }} onClick=${()=>setTab('rnc')}><span><strong style=${{color:'var(--rd)'}}>${aguardandoRetorno} RNC${aguardandoRetorno!==1?'s':''} aguardando retorno</strong><br/><span style=${{fontSize:12,color:'var(--s2)'}}>Confira as ocorrências que ainda não tiveram resposta do fornecedor.</span></span><${Ic} n="cr" s=${18} style=${{color:'var(--rd)'}}/></button>`}
    <button class="btn bp" style=${{ width: '100%', padding: 14, fontSize: 15, borderRadius: 12, marginBottom: 20 }} onClick=${() => setTab('pedidos')}>
      <${Ic} n="plus" s=${20}/>Novo Pedido
    </button>
    ${recentes.length > 0 && html`
      <span class="slbl">Atividade recente</span>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        ${recentes.map(p => { const st = ST_PED[p.status] || { l: p.status, c: 'bgy' }; return html`
          <button key=${p.id} class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick=${() => setTab('pedidos')}>
            <div style=${{ flex: 1, minWidth: 0 }}>
              <div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span><span class="badge bor">${p.origem}</span></div>
              <div style=${{ fontWeight: 700, fontSize: 14 }}>${wLbl(p.semana)}</div>
              <div style=${{ fontSize: 12, color: 'var(--s2)', marginTop: 2 }}>${(p.itens || []).length} itens · ${fDate(p.criadoEm)}</div>
            </div>
            <${Ic} n="cr" s=${16} style=${{ color: 'var(--s3)' }}/>
          </button>`; })}
      </div>`}
  </div>`;
}

/* ══════════════════════════════════════
   ORÇAMENTO
══════════════════════════════════════ */
function OrcamentoTab({ toast }) {
  const [view, setView] = useState('lista');
  const [orcamentos, setOrcamentos] = useState(() => LS.get('orcamentos') || []);
  const [editing, setEditing] = useState(null);
  const [fBusca, setFBusca] = useState(''); const [fOrig, setFOrig] = useState('TODOS'); const [fStatus, setFStatus] = useState('TODOS'); const [limit, setLimit] = useState(30);
  useEffect(() => { const openTarget=()=>{ const t=LS.get('openTarget'); if(t?.tab==='orcamento'){ const rec=(LS.get('orcamentos')||[]).find(x=>x.id===t.id); if(rec){ setEditing(rec); setView('editor'); } LS.del('openTarget'); } }; openTarget(); window.addEventListener('nx-open-target',openTarget); return()=>window.removeEventListener('nx-open-target',openTarget); }, []);
  const cat = useMemo(getCatalog, []);
  const allItems = useMemo(() => flatCatalog(cat), [cat]);
  const tPrecos = useMemo(() => LS.get('tabPrecos') || {}, []);

  const save = orc => {
    const upd = upsertById(orcamentos, orc);
    if (!LS.set('orcamentos', upd)) return false;
    setOrcamentos(upd);
    auditLog(orcamentos.some(o => o.id === orc.id) ? 'Orçamento atualizado' : 'Orçamento criado', `${wLbl(orc.semana)} · ${orc.origem} · ${orc.status}`);
    return true;
  };
  const del = id => {
    const rec = orcamentos.find(o => o.id === id || (!o.id && (o.semana === id || o.semana + o.origem === id)));
    if (!rec || !ensureWeekOpen(rec.semana, toast, 'excluir o orçamento')) return false;
    const pedidos = LS.get('pedidos') || [];
    const vinculados = pedidos.filter(p => p.orcamentoId === rec.id);
    if (vinculados.some(p => p.recebimento)) {
      toast.show('Não é possível excluir: existe recebimento vinculado. Exclua o recebimento primeiro.');
      return false;
    }
    if (vinculados.length && !strongConfirm(`Este orçamento gerou ${vinculados.length} pedido(s). Ao excluir, os pedidos vinculados também irão para a lixeira.`)) return false;
    const trash = LS.get('trash') || [];
    const agora = new Date().toISOString();
    const entradas = [
      ...vinculados.map(p => ({ id:uid(), type:'pedido', record:p, motivo:'Pedido removido por exclusão do orçamento vinculado', apagadoEm:agora })),
      { id:uid(), type:'orcamento', record:rec, motivo:vinculados.length ? 'Exclusão de orçamento com pedidos vinculados' : 'Exclusão de orçamento', apagadoEm:agora }
    ];
    const pedidosUpd = pedidos.filter(p => p.orcamentoId !== rec.id);
    const orcsUpd = orcamentos.filter(o => o !== rec);
    if (!commitLocal({ pedidos:pedidosUpd, orcamentos:orcsUpd, trash:[...entradas, ...trash].slice(0,300) })) return false;
    setOrcamentos(orcsUpd);
    auditLog('Orçamento excluído', `${wLbl(rec.semana)} · ${rec.origem} · ${vinculados.length} pedido(s) vinculados`);
    return true;
  };
  const autorizar = orc => {
    if (!ensureWeekOpen(orc.semana, toast, 'autorizar o orçamento')) return false;
    if (!(orc.itens || []).some(i => Number(i.qtd) > 0)) { toast.show('Inclua ao menos um item.'); return false; }
    const pedidos = LS.get('pedidos') || [];
    const existente = pedidos.find(p => p.orcamentoId === orc.id);
    if (existente?.recebimento) { toast.show('Este orçamento já possui pedido recebido e não pode ser reautorizado.'); return false; }
    const agora = new Date().toISOString();
    const orcUp = { ...orc, status:'autorizado', autorizadoEm:orc.autorizadoEm || agora, atualizadoEm:agora };
    const pedidoBase = existente || { id:uid(), criadoEm:agora, orcamentoId:orc.id };
    const newPed = { ...pedidoBase, origem:orc.origem, semana:orc.semana, data:orc.data, responsavel:orc.responsavel, status:'pendente', recebimento:null,
      itens:(orc.itens || []).filter(i => Number(i.qtd) > 0), notas:`Gerado via Orçamento · Total: ${fMoeda(orc.total || 0)}` };
    const orcsUpd = upsertById(orcamentos, orcUp);
    const pedsUpd = upsertById(pedidos, newPed);
    if (!commitLocal({ orcamentos:orcsUpd, pedidos:pedsUpd })) return false;
    setOrcamentos(orcsUpd);
    auditLog('Orçamento autorizado', `${wLbl(orc.semana)} · ${orc.origem} · Pedido ${newPed.id}`);
    toast.show(existente ? 'Autorização atualizada e pedido sincronizado.' : 'Autorizado! Pedido criado automaticamente.');
    setView('lista'); setEditing(null); clearDraft('orcamento');
    return true;
  };
  const updateAuthorized = orc => {
    if (!ensureWeekOpen(orc.semana, toast, 'atualizar o orçamento')) return false;
    const pedidos = LS.get('pedidos') || [];
    const vinculados = pedidos.filter(p => p.orcamentoId === orc.id);
    if (vinculados.some(p => p.recebimento)) { toast.show('Edição bloqueada: o pedido vinculado já possui recebimento.'); return false; }
    const agora = new Date().toISOString();
    const orcUp = { ...orc, status:'autorizado', atualizadoEm:agora };
    const orcsUpd = upsertById(orcamentos, orcUp);
    const pedsUpd = pedidos.map(p => p.orcamentoId === orc.id ? { ...p, origem:orc.origem, semana:orc.semana, data:orc.data, responsavel:orc.responsavel, itens:orc.itens, notas:`Gerado via Orçamento · Total: ${fMoeda(orc.total || 0)}` } : p);
    if (!commitLocal({ orcamentos:orcsUpd, pedidos:pedsUpd })) return false;
    setOrcamentos(orcsUpd); auditLog('Orçamento autorizado atualizado', `${wLbl(orc.semana)} · ${orc.origem} · ${fMoeda(orc.total || 0)}`);
    toast.show('Orçamento e pedido atualizados.'); setView('lista'); setEditing(null); return true;
  };

  if (view === 'precos') return html`<${TabelaPrecos} cat=${cat} allItems=${allItems} toast=${toast} onBack=${() => setView('lista')}/>`;
  if (view === 'editor') return html`<${OrcEditor} orc=${editing} cat=${cat} allItems=${allItems} tPrecos=${tPrecos} toast=${toast}
    onBack=${() => { setView('lista'); setEditing(null); }}
    onSave=${orc => { if (save(orc)) { clearDraft('orcamento'); toast.show(orc.status === 'rascunho' ? 'Rascunho salvo' : 'Orçamento salvo'); setView('lista'); setEditing(null); } }}
    onDelete=${id => { if (del(id)) { toast.show('Excluído'); setView('lista'); setEditing(null); } }}
    onAutorizar=${autorizar} onUpdateAuthorized=${updateAuthorized}/>`;

  const term = fBusca.trim().toLowerCase();
  const filtrados = orcamentos.filter(o => (fOrig === 'TODOS' || o.origem === fOrig) && (fStatus === 'TODOS' || o.status === fStatus) && (!term || `${wLbl(o.semana)} ${o.origem||''} ${o.responsavel||''} ${(o.itens||[]).map(i=>i.nome).join(' ')}`.toLowerCase().includes(term)));
  const pendAll = filtrados.filter(o => o.status === 'rascunho' || o.status === 'pendente');
  const autAll = filtrados.filter(o => o.status === 'autorizado');
  const pend = pendAll.slice(0,limit), aut = autAll.slice(0,limit);
  const resetLimit = fn => v => { fn(v); setLimit(30); };
  return html`<div class="page">
    <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 16 }}>
      <div><h2 style=${{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", margin: 0 }}>Orçamentos</h2></div>
      <div class="row"><button class="btn bs bsm" onClick=${() => setView('precos')}><${Ic} n="money" s=${14}/>Preços</button><button class="btn bp bsm" onClick=${() => { setEditing(null); setView('editor'); }}><${Ic} n="plus" s=${14}/>Novo</button></div>
    </div>
    ${orcamentos.length > 0 && html`<${RecordsFilter} busca=${fBusca} setBusca=${resetLimit(setFBusca)} origem=${fOrig} setOrigem=${resetLimit(setFOrig)} status=${fStatus} setStatus=${resetLimit(setFStatus)} statusOpts=${[{v:'rascunho',l:'Rascunho'},{v:'pendente',l:'Pendente'},{v:'autorizado',l:'Autorizado'}]}/>`}
    ${orcamentos.length === 0 && html`<div class="empty"><${Ic} n="money" s=${40} style=${{ color: 'var(--s3)' }}/><p>Nenhum orçamento.<br/>Crie um para começar.</p><button class="btn bp" style=${{ marginTop: 8 }} onClick=${() => setView('editor')}><${Ic} n="plus" s=${16}/>Criar orçamento</button></div>`}
    ${orcamentos.length > 0 && filtrados.length === 0 && html`<div class="empty"><p>Nenhum orçamento corresponde aos filtros.</p></div>`}
    ${pendAll.length > 0 && html`<span class="slbl">Pendentes (${pendAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>${pend.map(o => html`<${OrcCard} key=${o.id} orc=${o} onClick=${() => { setEditing(o); setView('editor'); }}/>`)}<${MoreResults} total=${pendAll.length} shown=${pend.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
    ${autAll.length > 0 && html`<span class="slbl">Autorizados (${autAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${aut.map(o => html`<${OrcCard} key=${o.id} orc=${o} onClick=${() => { setEditing(o); setView('editor'); }}/>`)}<${MoreResults} total=${autAll.length} shown=${aut.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
  </div>`;
}

function OrcCard({ orc, onClick }) {
  return html`<button class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick=${onClick}>
    <div style=${{ flex: 1, minWidth: 0 }}>
      <div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${orc.status === 'autorizado' ? 'bgr2' : orc.status === 'rascunho' ? 'bgy' : 'bam'}`}>${orc.status === 'autorizado' ? 'Autorizado' : orc.status === 'rascunho' ? 'Rascunho' : 'Pendente'}</span><span class="badge bor">${orc.origem}</span></div>
      <div style=${{ fontWeight: 700, fontSize: 14 }}>${wLbl(orc.semana)}</div>
      <div style=${{ fontSize: 12, color: 'var(--s2)', marginTop: 2 }}>${(orc.itens || []).filter(i => parseFloat(i.qtd) > 0).length} itens · ${fMoeda(orc.total || 0)}${orc.data ? ' · ' + fDate(orc.data) : ''}</div>
    </div>
    <${Ic} n="cr" s=${16} style=${{ color: 'var(--s3)' }}/>
  </button>`;
}

function OrcEditor({ orc, cat, allItems, tPrecos, toast, onBack, onSave, onDelete, onAutorizar, onUpdateAuthorized }) {
  const isEdit = !!orc?.id; const autorizado = orc?.status === 'autorizado';
  const sems = useMemo(genSems, []);
  const [orig, setOrig] = useState(orc?.origem || 'CD');
  const [data, setData] = useState(orc?.data || todayISO());
  const [sem, setSem] = useState(orc?.semana || dateToWeek(data));
  const [resp, setResp] = useState(orc?.responsavel || (LS.get('config') || {}).responsavel || '');
  const linkedPedido = (LS.get('pedidos') || []).find(p => p.orcamentoId === orc?.id);
  const lockedByReceipt = !!linkedPedido?.recebimento;
  const [qtds, setQtds] = useState(() => { const m = {}; (orc?.itens || []).forEach(i => m[i.nome] = String(i.qtd)); return m; });
  const [precos, setPrecos] = useState(() => {
    if (orc?.precos && Object.keys(orc.precos).length > 0) return orc.precos;
    const sems2 = Object.keys(tPrecos).sort().reverse();
    return sems2.length > 0 ? { ...(tPrecos[sems2[0]] || {}) } : {};
  });
  const itemsOrig = allItems.filter(i => i.orig === orig);
  const locked = isWeekClosed(sem) || lockedByReceipt;
  useEffect(() => { const w = dateToWeek(data); if (w !== sem) setSem(w); }, [data]);
  const byC = useMemo(() => { const m = {}; itemsOrig.forEach(i => { if (!m[i.cat]) m[i.cat] = []; m[i.cat].push(i); }); return m; }, [itemsOrig]);
  const total = itemsOrig.reduce((s, i) => s + nonNeg(qtds[i.name]) * nonNeg(precos[i.name]), 0);
  const sel = itemsOrig.filter(i => nonNeg(qtds[i.name]) > 0).length;
  const carregarSemanaAnterior = () => {
    const ants = Object.keys(tPrecos).filter(w => w < sem).sort();
    const ant = ants[ants.length - 1];
    if (!ant) { toast.show('Não encontrei preços de semana anterior'); return; }
    setPrecos({ ...(tPrecos[ant] || {}) });
    toast.show('Preços carregados de ' + wLbl(ant));
  };
  const snapshot = JSON.stringify({ orig, data, sem, resp, qtds, precos });
  const guard = useDirtyGuard(snapshot);
  const doSave = () => {
    if (!ensureWeekOpen(sem, toast, 'salvar o orçamento')) return;
    const itens = itemsOrig.filter(i => nonNeg(qtds[i.name]) > 0).map(i => ({ nome: i.name, cat: i.cat, unit: i.unit, qtd: nonNeg(qtds[i.name]), precoUnit: nonNeg(precos[i.name]) }));
    if (!itens.length) { toast.show('Inclua ao menos um item.'); return; }
    guard.clean();
    onSave({ id: orc?.id || uid(), origem: orig, semana: sem, data, responsavel: resp, status: 'rascunho', itens, precos, total, criadoEm: orc?.criadoEm || new Date().toISOString(), atualizadoEm:new Date().toISOString() });
  };
  return html`<div style=${{ maxWidth: 'none', margin: '0 auto' }}>
    <div class="stk" style=${{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button class="btn bg0 bic" onClick=${() => guard.leave(onBack)}><${Ic} n="left" s=${20}/></button>
      <div style=${{ flex: 1 }}><div style=${{ fontWeight: 800, fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>${orc ? (autorizado ? 'Editar Orçamento Autorizado' : 'Editar Orçamento') : 'Novo Orçamento'}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${sel} itens · ${fMoeda(total)}</div></div>
      ${orc && !locked && html`<button class="btn bg0 bic" style=${{ color: 'var(--rd)' }} onClick=${() => { if (strongConfirm('Excluir orçamento')) onDelete(orc.id || orc.semana); }}><${Ic} n="trash" s=${18}/></button>`}
    </div>
    ${locked && html`<div class="nx-lock-note">${lockedByReceipt ? 'Edição bloqueada porque o pedido vinculado já possui recebimento.' : 'Esta semana está fechada. Reabra-a na Administração para editar.'}</div>`}
    <div class="page" style=${{ paddingBottom: locked ? 24 : 140 }}>
      <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
        <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          ${['CD', 'CP'].map(o => html`<button key=${o} onClick=${() => { if (!locked) { setOrig(o); setQtds({}); } }} style=${{ padding: 10, borderRadius: 10, border: `2px solid ${orig === o ? 'var(--or)' : 'var(--bd)'}`, background: orig === o ? 'var(--or3)' : '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}><div style=${{ color: orig === o ? 'var(--or2)' : 'var(--ink)' }}>${o}</div><div style=${{ fontSize: 11, color: orig === o ? 'var(--or)' : 'var(--s2)', marginTop: 2 }}>${cat[o].label}</div></button>`)}
        </div>
        <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Semana de referência</label><select class="inp" value=${sem} onChange=${e => setSem(e.target.value)} disabled=${locked}>${sems.map(s => html`<option key=${s} value=${s}>${wLbl(s)}</option>`)}</select></div>
          <div><label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Responsável</label><input class="inp" value=${resp} onInput=${e => setResp(e.target.value)} placeholder="Nome do responsável" disabled=${locked}/></div>
        </div>
        ${!locked && html`<button class="btn bs bsm" onClick=${carregarSemanaAnterior}><${Ic} n="ref" s=${14}/>Usar preços da semana anterior</button>`}
      </div>
      ${Object.entries(byC).map(([catN, items]) => {
        const catTotal = items.reduce((s, i) => s + nonNeg(qtds[i.name]) * nonNeg(precos[i.name]), 0);
        return html`<details key=${catN + orig} open style=${{ marginBottom: 8 }}>
          <summary class="cat-hdr"><${Ic} n="cr" s=${14} c="chv" style=${{ color: 'var(--s3)' }}/><span style=${{ fontWeight: 700, fontSize: 14, flex: 1 }}>${catN}</span>${catTotal > 0 && html`<span class="badge bor">${fMoeda(catTotal)}</span>`}</summary>
          <div class="ilist">
            <div class="ghdr" style=${{ gridTemplateColumns: '1fr 70px 76px' }}><span>Produto</span><span style=${{ textAlign: 'center' }}>Qtd.</span><span style=${{ textAlign: 'right' }}>Preço</span></div>
            ${items.map((item, idx) => { const qtd = nonNeg(qtds[item.name]), preco = nonNeg(precos[item.name]), sub = qtd * preco; return html`
              <div key=${item.name} class="irow" style=${{ gridTemplateColumns: '1fr 70px 76px', background: qtd > 0 ? 'var(--or3)' : '#fff' }}>
                <div><div style=${{ fontSize: 13, fontWeight: qtd > 0 ? 600 : 400 }}>${item.name}</div><div style=${{ fontSize: 11, color: 'var(--s3)' }}>${item.unit}${sub > 0 ? ` · ${fMoeda(sub)}` : ''}</div></div>
                <div style=${{ display: 'flex', justifyContent: 'center' }}><input type="number" min="0" class="inp-n" value=${qtds[item.name] || ''} onInput=${e => setQtds(p => ({ ...p, [item.name]: e.target.value }))} disabled=${locked} placeholder="0" style=${{ borderColor: qtd > 0 ? 'var(--or)' : undefined }}/></div>
                <div style=${{ display: 'flex', justifyContent: 'flex-end' }}><input type="number" min="0" step="0.01" class="inp-n" value=${precos[item.name] || ''} onInput=${e => setPrecos(p => ({ ...p, [item.name]: e.target.value }))} disabled=${locked} placeholder="0,00" style=${{ width: 72, fontSize: 12, borderColor: preco > 0 ? 'var(--or)' : undefined }}/></div>
              </div>`; })}
          </div>
        </details>`; })}
    </div>
    ${!locked && html`<div style=${{ position: 'sticky', bottom: 72, background: '#fff', borderTop: '1px solid var(--bd)', padding: '12px 16px' }}>
      <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 10 }}><span style=${{ fontSize: 13, color: 'var(--s2)' }}>Total estimado</span><span style=${{ fontSize: 20, fontWeight: 800, color: 'var(--or)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>${fMoeda(total)}</span></div>
      <div class="row" style=${{ gap: 8 }}>
        <button class="btn bs" style=${{ flex: 1 }} onClick=${doSave}><${Ic} n="save" s=${15}/>Rascunho</button>
        <button class="btn bp" style=${{ flex: 1 }} onClick=${() => {
          const itens = itemsOrig.filter(i => nonNeg(qtds[i.name]) > 0).map(i => ({ nome: i.name, cat: i.cat, unit: i.unit, qtd: nonNeg(qtds[i.name]), precoUnit: nonNeg(precos[i.name]) }));
          const orcAtual = { ...(orc || {}), id: orc?.id || uid(), origem: orig, semana: sem, data, responsavel: resp, status: 'autorizado', itens, precos, total, criadoEm: orc?.criadoEm || new Date().toISOString() };
          if (!itens.length) { toast.show('Inclua ao menos um item.'); return; }
          guard.clean();
          if (autorizado) onUpdateAuthorized(orcAtual);
          else onAutorizar(orcAtual);
        }}>
          <${Ic} n="chk" s=${15}/>${autorizado ? 'Atualizar pedido' : 'Autorizar'}
        </button>
      </div>
    </div>`}
    ${locked && html`<div style=${{ padding: '12px 16px 24px', textAlign: 'center' }}><span class="badge bgr2" style=${{ fontSize: 13, padding: '6px 16px' }}>${lockedByReceipt ? 'Recebimento registrado — edição bloqueada' : 'Semana fechada — somente leitura'}</span></div>`}
  </div>`;
}

/* ══════════════════════════════════════
   TABELA DE PREÇOS
══════════════════════════════════════ */
function TabelaPrecos({ cat, allItems, toast, onBack }) {
  const cur = getWeekId();
  const [tPrecos, setTPrecos] = useState(() => LS.get('tabPrecos') || {});
  const sems = useMemo(() => { const saved = Object.keys(tPrecos).sort().reverse(); return [...new Set([...saved, ...genSems()])].sort().reverse(); }, [tPrecos]);
  const [orig, setOrig] = useState('CD'); const [sem, setSem] = useState(cur); const [ed, setEd] = useState({});
  useEffect(() => { setEd({ ...((tPrecos)[sem] || {}) }); }, [sem]);
  const items = allItems.filter(i => i.orig === orig);
  const semAnt = Object.keys(tPrecos).sort().reverse().find(s => s < sem);
  const antP = semAnt ? (tPrecos[semAnt] || {}) : {};
  const byC = useMemo(() => { const m = {}; items.forEach(i => { if (!m[i.cat]) m[i.cat] = []; m[i.cat].push(i); }); return m; }, [items]);
  const salvar = () => { if (!ensureWeekOpen(sem, toast, 'alterar os preços')) return; const l = {}; Object.entries(ed).forEach(([k, v]) => { const n = parseFloat(v); if (!isNaN(n) && n > 0) l[k] = n; }); const upd = { ...tPrecos, [sem]: l }; if (!LS.set('tabPrecos', upd)) return; setTPrecos(upd); auditLog('Tabela de preços atualizada', `${wLbl(sem)} · ${orig} · ${Object.keys(l).length} preços`); toast.show(`Preços de ${wLbl(sem)} salvos`); };
  const preenchidos = items.filter(i => parseFloat(ed[i.name] || 0) > 0).length;
  const weekLocked = isWeekClosed(sem);
  return html`<div style=${{ maxWidth: 'none', margin: '0 auto' }}>
    <div class="stk" style=${{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button class="btn bg0 bic" onClick=${onBack}><${Ic} n="left" s=${20}/></button>
      <div style=${{ flex: 1 }}><div style=${{ fontWeight: 800, fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Tabela de Preços</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${preenchidos}/${items.length} preenchidos</div></div>
      <button class="btn bp bsm" onClick=${salvar} disabled=${weekLocked}><${Ic} n="save" s=${14}/>Salvar</button>
    </div>
    <div class="page">
      ${weekLocked && html`<div class="nx-lock-note" style=${{margin:'0 0 12px'}}>Semana fechada: a tabela de preços está em modo somente leitura.</div>`}
      <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
        <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          ${['CD', 'CP'].map(o => html`<button key=${o} onClick=${() => setOrig(o)} style=${{ padding: 10, borderRadius: 10, border: `2px solid ${orig === o ? 'var(--or)' : 'var(--bd)'}`, background: orig === o ? 'var(--or3)' : '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}><span style=${{ color: orig === o ? 'var(--or2)' : 'var(--ink)' }}>${o}</span></button>`)}
        </div>
        <label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Semana</label>
        <select class="inp" value=${sem} onChange=${e => setSem(e.target.value)} style=${{ marginBottom: 10 }}>${sems.map(s => html`<option key=${s} value=${s}>${wLbl(s)}${s === cur ? ' (atual)' : ''}</option>`)}</select>
        <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button class="btn bs bsm" disabled=${weekLocked} onClick=${() => { if (!semAnt) { toast.show('Nenhuma semana anterior'); return; } const ant = tPrecos[semAnt] || {}; setEd(prev => { const m = { ...ant }; Object.entries(prev).forEach(([k, v]) => { if (v && parseFloat(v) > 0) m[k] = v; }); return m; }); toast.show('Vazios copiados'); }}><${Ic} n="ref" s=${12}/>Copiar vazios</button>
          <button class="btn bs bsm" disabled=${weekLocked} onClick=${() => { if (!semAnt) { toast.show('Nenhuma semana anterior'); return; } setEd({ ...(tPrecos[semAnt] || {}) }); toast.show('Tudo copiado'); }}><${Ic} n="ref" s=${12}/>Copiar tudo</button>
        </div>
      </div>
      ${Object.entries(byC).map(([catN, itens]) => html`
        <details key=${catN + orig} open style=${{ marginBottom: 8 }}>
          <summary class="cat-hdr"><${Ic} n="cr" s=${14} c="chv" style=${{ color: 'var(--s3)' }}/><span style=${{ fontWeight: 700, fontSize: 14, flex: 1 }}>${catN}</span><span style=${{ fontSize: 12, color: 'var(--s2)' }}>${itens.filter(i => parseFloat(ed[i.name] || 0) > 0).length}/${itens.length}</span></summary>
          <div class="ilist">
            <div class="ghdr" style=${{ gridTemplateColumns: '1fr 76px 76px 56px' }}><span>Produto</span><span style=${{ textAlign: 'right' }}>Ant.</span><span style=${{ textAlign: 'center' }}>Atual</span><span style=${{ textAlign: 'right' }}>Var.</span></div>
            ${itens.map(item => { const atual = parseFloat(ed[item.name] || 0), ant = parseFloat(antP[item.name] || 0), vr = ant && atual ? ((atual - ant) / ant * 100) : null; return html`
              <div key=${item.name} class="irow" style=${{ gridTemplateColumns: '1fr 76px 76px 56px' }}>
                <div style=${{ fontSize: 12, fontWeight: 500 }}>${item.name}</div>
                <div style=${{ textAlign: 'right', fontSize: 11, color: 'var(--s2)' }}>${ant ? fMoeda(ant) : '—'}</div>
                <div style=${{ display: 'flex', justifyContent: 'center' }}><input type="number" min="0" step="0.01" class="inp-n" value=${ed[item.name] || ''} onInput=${e => setEd(p => ({ ...p, [item.name]: e.target.value }))} disabled=${weekLocked} placeholder="0,00" style=${{ width: 72, fontSize: 12, borderColor: atual > 0 ? 'var(--or)' : undefined }}/></div>
                <div style=${{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: vr === null ? 'var(--s3)' : vr > 0 ? 'var(--rd)' : vr < 0 ? 'var(--gr)' : 'var(--s2)' }}>${vr === null ? '—' : vr > 0 ? `▲${vr.toFixed(0)}%` : `▼${Math.abs(vr).toFixed(0)}%`}</div>
              </div>`; })}
          </div>
        </details>`)}
      <button class="btn bp" style=${{ width: '100%', padding: 14, borderRadius: 12, fontSize: 15, marginTop: 4 }} onClick=${salvar} disabled=${weekLocked}><${Ic} n="save" s=${16}/>Salvar preços</button>
    </div>
  </div>`;
}

/* ══════════════════════════════════════
   PEDIDOS
══════════════════════════════════════ */
function PedidosTab({ toast }) {
  const [view, setView] = useState('lista');
  const [pedidos, setPedidos] = useState(() => LS.get('pedidos') || []);
  const [editing, setEditing] = useState(null);
  const [fBusca, setFBusca] = useState(''); const [fOrig, setFOrig] = useState('TODOS'); const [fStatus, setFStatus] = useState('TODOS'); const [limit, setLimit] = useState(30);
  useEffect(() => { const openTarget=()=>{ const t=LS.get('openTarget'); if(t?.tab==='pedidos'){ const rec=(LS.get('pedidos')||[]).find(x=>x.id===t.id); if(rec){ setEditing(rec); setView('editor'); } LS.del('openTarget'); } }; openTarget(); window.addEventListener('nx-open-target',openTarget); return()=>window.removeEventListener('nx-open-target',openTarget); }, []);
  const cat = useMemo(getCatalog, []);
  const allItems = useMemo(() => flatCatalog(cat), [cat]);

  const savePed = p => {
    const upd = upsertById(pedidos, p);
    if (!LS.set('pedidos', upd)) return false;
    setPedidos(upd); auditLog(pedidos.some(x => x.id === p.id) ? 'Pedido atualizado' : 'Pedido criado', `${wLbl(p.semana)} · ${p.origem} · ${(p.itens || []).length} item(ns)`); return true;
  };
  const delPed = id => {
    const rec = pedidos.find(p => p.id === id);
    if (!rec || !ensureWeekOpen(rec.semana, toast, 'excluir o pedido')) return false;
    if (rec.recebimento) { toast.show('Exclua o recebimento antes de excluir este pedido.'); return false; }
    if (rec.orcamentoId) { toast.show('Pedido gerado por orçamento. Exclua-o pela tela de Orçamentos.'); return false; }
    const trash = LS.get('trash') || [];
    const upd = pedidos.filter(p => p.id !== id);
    const entry = { id:uid(), type:'pedido', record:rec, motivo:'Exclusão administrativa', apagadoEm:new Date().toISOString() };
    if (!commitLocal({ pedidos:upd, trash:[entry,...trash].slice(0,300) })) return false;
    setPedidos(upd); auditLog('Pedido excluído', `${wLbl(rec.semana)} · ${rec.origem}`); return true;
  };

  if (view === 'editor') return html`<${PedidoEditor} pedido=${editing} cat=${cat} allItems=${allItems} toast=${toast}
    onBack=${() => { setView('lista'); setEditing(null); }}
    onSave=${p => { if (savePed(p)) { clearDraft('pedido'); toast.show(editing ? 'Pedido salvo' : 'Pedido criado'); setView('lista'); setEditing(null); } }}
    onDelete=${id => { if (delPed(id)) { toast.show('Pedido excluído'); setView('lista'); setEditing(null); } }}/>`;

  const term = fBusca.trim().toLowerCase();
  const filtrados = pedidos.filter(p => (fOrig === 'TODOS' || p.origem === fOrig) && (fStatus === 'TODOS' || p.status === fStatus) && (!term || `${wLbl(p.semana)} ${p.origem||''} ${p.responsavel||''} ${(p.itens||[]).map(i=>i.nome).join(' ')}`.toLowerCase().includes(term)));
  const pendAll = filtrados.filter(p => p.status === 'pendente');
  const outrosAll = filtrados.filter(p => p.status !== 'pendente').sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
  const pend=pendAll.slice(0,limit), outros=outrosAll.slice(0,limit);
  const resetLimit=fn=>v=>{fn(v);setLimit(30)};
  return html`<div class="page">
    <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 16 }}>
      <div><h2 style=${{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", margin: 0 }}>Pedidos</h2><p style=${{ fontSize: 13, color: 'var(--s2)', margin: '2px 0 0' }}>${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}</p></div>
      <button class="btn bp bsm" onClick=${() => { const d=LS.get('draft_pedido'); if(d && confirm('Continuar rascunho automático do pedido?')) setEditing(hydratePedidoDraft(d)); else setEditing(null); setView('editor'); }}><${Ic} n="plus" s=${14}/>Novo</button>
    </div>
    ${pedidos.length>0 && html`<${RecordsFilter} busca=${fBusca} setBusca=${resetLimit(setFBusca)} origem=${fOrig} setOrigem=${resetLimit(setFOrig)} status=${fStatus} setStatus=${resetLimit(setFStatus)} statusOpts=${[{v:'pendente',l:'Aguardando'},{v:'recebido',l:'Recebido'},{v:'parcial',l:'Parcial'},{v:'cancelado',l:'Cancelado'}]}/>`}
    ${pedidos.length === 0 && html`<div class="empty"><${Ic} n="orders" s=${40} style=${{ color: 'var(--s3)' }}/><p>Nenhum pedido ainda.</p></div>`}
    ${pedidos.length>0 && filtrados.length===0 && html`<div class="empty"><p>Nenhum pedido corresponde aos filtros.</p></div>`}
    ${pendAll.length > 0 && html`<span class="slbl">Aguardando recebimento (${pendAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>${pend.map(p => html`<${PCard} key=${p.id} p=${p} onClick=${() => { setEditing(p); setView('editor'); }} toast=${toast}/>`)}<${MoreResults} total=${pendAll.length} shown=${pend.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
    ${outrosAll.length > 0 && html`<span class="slbl">Histórico (${outrosAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${outros.map(p => html`<${PCard} key=${p.id} p=${p} onClick=${() => { setEditing(p); setView('editor'); }} toast=${toast}/>`)}<${MoreResults} total=${outrosAll.length} shown=${outros.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
  </div>`;
}

function PCard({ p, onClick, toast }) {
  const st = ST_PED[p.status] || { l: p.status, c: 'bgy' };
  return html`<div class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
    <div style=${{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick=${onClick}>
      <div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span><span class="badge bor">${p.origem}</span></div>
      <div style=${{ fontWeight: 700, fontSize: 14 }}>${wLbl(p.semana)}</div>
      <div style=${{ fontSize: 12, color: 'var(--s2)', marginTop: 2 }}>${(p.itens || []).length} itens · ${fDate(p.criadoEm)}</div>
    </div>
    <div class="row" style=${{ gap: 6 }}>
      <${Ic} n="cr" s=${16} style=${{ color: 'var(--s3)', cursor: 'pointer' }} onClick=${onClick}/>
    </div>
  </div>`;
}

function PedidoEditor({ pedido, cat, allItems, toast, onBack, onSave, onDelete }) {
  const isEdit = !!pedido?.id; const hasRecebimento = pedido?.recebimento != null;
  const sems = useMemo(genSems, []);
  const [orig, setOrig] = useState(pedido?.origem || 'CD');
  const [sem, setSem] = useState(pedido?.semana || getWeekId());
  const [data, setData] = useState(pedido?.data || todayISO());
  const [resp, setResp] = useState(pedido?.responsavel || (LS.get('config') || {}).responsavel || '');
  const [notas, setNotas] = useState(pedido?.notas || '');
  const [qtds, setQtds] = useState(() => { const m = {}; (pedido?.itens || []).forEach(i => m[i.nome] = String(i.qtd)); return m; });
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState([]);
  const allOrigItems = useMemo(() => allItems.filter(i => i.orig === orig), [allItems, orig]);
  const itemsOrig = useMemo(() => allOrigItems.filter(i => !busca || i.name.toLowerCase().includes(busca.toLowerCase()) || i.cat.toLowerCase().includes(busca.toLowerCase())), [allOrigItems, busca]);
  const byC = useMemo(() => { const m = {}; itemsOrig.forEach(i => { if (!m[i.cat]) m[i.cat] = []; m[i.cat].push(i); }); return m; }, [itemsOrig]);
  const sel = allOrigItems.filter(i => nonNeg(qtds[i.name]) > 0).length;
  const lockedReason = hasRecebimento ? 'O pedido já possui recebimento.' : pedido?.orcamentoId ? 'Pedido gerado por orçamento: edite pela tela de Orçamentos.' : isWeekClosed(sem) ? 'A semana está fechada.' : '';
  const locked = !!lockedReason;
  const snapshot = JSON.stringify({ orig, sem, data, resp, notas, qtds });
  const guard = useDirtyGuard(snapshot);
  const salvar = () => {
    if (!ensureWeekOpen(sem, toast, 'salvar o pedido')) return;
    if (hasRecebimento || pedido?.orcamentoId) { toast.show(lockedReason); return; }
    const itens = allOrigItems.filter(i => nonNeg(qtds[i.name]) > 0).map(i => ({ nome: i.name, cat: i.cat, unit: i.unit, qtd: nonNeg(qtds[i.name]) }));
    if (!itens.length) { toast.show('Inclua ao menos um item.'); return; }
    guard.clean();
    onSave({ id: pedido?.id || uid(), origem: orig, semana: sem, data, responsavel: resp, notas, status: pedido?.status || 'pendente', itens, recebimento: pedido?.recebimento || null, criadoEm: pedido?.criadoEm || new Date().toISOString(), atualizadoEm:new Date().toISOString() });
  };
  useEffect(() => { if (locked) return; const draft = { origem: orig, semana: sem, data, responsavel: resp, notas, qtds, atualizadoEm: new Date().toISOString() }; LS.set('draft_pedido', draft); }, [orig, sem, data, resp, notas, JSON.stringify(qtds)]);
  return html`<div style=${{ maxWidth: 'none', margin: '0 auto' }}>
    <div class="stk" style=${{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button class="btn bg0 bic" onClick=${() => guard.leave(onBack)}><${Ic} n="left" s=${20}/></button>
      <div style=${{ flex: 1 }}><div style=${{ fontWeight: 800, fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>${isEdit ? 'Editar Pedido' : 'Novo Pedido'}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${sel} itens selecionados</div></div>
      ${isEdit && !locked && html`<button class="btn bg0 bic" style=${{ color: 'var(--rd)' }} onClick=${() => { if (strongConfirm('Excluir pedido')) onDelete(pedido.id); }}><${Ic} n="trash" s=${18}/></button>`}
    </div>
    ${locked && html`<div class="nx-lock-note">${lockedReason}</div>`}
    <div class="page" style=${{ paddingBottom: locked ? 24 : 100 }}>
      <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
        <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          ${['CD', 'CP'].map(o => html`<button key=${o} onClick=${() => { if (!locked) { setOrig(o); setQtds({}); } }} style=${{ padding: 10, borderRadius: 10, border: `2px solid ${orig === o ? 'var(--or)' : 'var(--bd)'}`, background: orig === o ? 'var(--or3)' : '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}><div style=${{ color: orig === o ? 'var(--or2)' : 'var(--ink)' }}>${o}</div><div style=${{ fontSize: 11, color: orig === o ? 'var(--or)' : 'var(--s2)', marginTop: 2 }}>${cat[o].label}</div></button>`)}
        </div>
        <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Data</label><input type="date" class="inp" value=${data} onInput=${e => { setData(e.target.value); setSem(getWeekId(new Date(e.target.value + 'T12:00:00'))); }} disabled=${locked}/></div>
          <div><label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Semana</label><select class="inp" value=${sem} onChange=${e => setSem(e.target.value)} disabled=${locked}>${sems.map(s => html`<option key=${s} value=${s}>${wLbl(s)}</option>`)}</select></div>
        </div>
        <label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Responsável</label>
        <input class="inp" value=${resp} onInput=${e => setResp(e.target.value)} placeholder="Nome de quem está solicitando" disabled=${locked} style=${{ marginBottom: 8 }}/>
        <label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Observações</label>
        <textarea class="inp" value=${notas} onInput=${e => setNotas(e.target.value)} rows="2" placeholder="Observações opcionais..." disabled=${locked}/>
        <div style=${{ marginTop: 12, display:'grid', gridTemplateColumns:'1fr auto auto', gap:8 }}>
          <input class="inp" value=${busca} onInput=${e=>setBusca(e.target.value)} placeholder="Buscar item ou categoria..."/>
          <button class="btn bs bsm" onClick=${()=>setMarcados(itemsOrig.map(i=>i.name))}>Marcar todos</button>
          <button class="btn bs bsm" onClick=${()=>setQtds(p=>{const n={...p}; (marcados.length?marcados:itemsOrig.map(i=>i.name)).forEach(k=>n[k]=''); return n;})}>Zerar</button>
        </div>
      </div>
      ${Object.entries(byC).map(([catN, prods]) => html`
        <details key=${catN + orig} open style=${{ marginBottom: 8 }}>
          <summary class="cat-hdr"><${Ic} n="cr" s=${14} c="chv" style=${{ color: 'var(--s3)' }}/><span style=${{ fontWeight: 700, fontSize: 14, flex: 1 }}>${catN}</span><span style=${{ fontSize: 12, color: 'var(--s2)' }}>${prods.filter(p => nonNeg(qtds[p.name]) > 0).length}/${prods.length}</span></summary>
          <div class="ilist">
            <div class="ghdr" style=${{ gridTemplateColumns: '1fr 60px' }}><span>Produto</span><span style=${{ textAlign: 'center' }}>Qtd.</span></div>
            ${prods.map(prod => { const qtd = nonNeg(qtds[prod.name]); return html`
              <div key=${prod.name} class="irow" style=${{ gridTemplateColumns: '1fr 60px', background: qtd > 0 ? 'var(--or3)' : '#fff' }}>
                <div><div style=${{ fontSize: 13, fontWeight: qtd > 0 ? 600 : 400 }}>${prod.name}</div><div style=${{ fontSize: 11, color: 'var(--s3)' }}>${prod.unit}</div></div>
                <div style=${{ display: 'flex', justifyContent: 'center' }}><input type="number" min="0" class="inp-n" value=${qtds[prod.name] || ''} onInput=${e => setQtds(p => ({ ...p, [prod.name]: e.target.value }))} disabled=${locked} placeholder="0" style=${{ borderColor: qtd > 0 ? 'var(--or)' : undefined }}/></div>
              </div>`; })}
          </div>
        </details>`)}
    </div>
    ${!locked && html`<div style=${{ position: 'sticky', bottom: 72, background: '#fff', borderTop: '1px solid var(--bd)', padding: '12px 16px' }}>
      <button class="btn bp" style=${{ width: '100%', padding: 14, borderRadius: 12, fontSize: 15 }} onClick=${salvar} disabled=${sel === 0}><${Ic} n="save" s=${16}/>${isEdit ? 'Salvar alterações' : 'Criar pedido'}</button>
    </div>`}
  </div>`;
}

/* ══════════════════════════════════════
   RECEBIMENTO
══════════════════════════════════════ */
function receiptDivergences(pedido, receiptItems) {
  return (receiptItems || []).map(i => ({ ...i, diferenca:Number(i.qtdRecebida || 0) - Number(i.qtd || 0) })).filter(i => Math.abs(i.diferenca) > 0.000001);
}
function syncAutoRncsForReceipt(pedido, recebimento, allowCreate) {
  let rncs = [...(LS.get('rncs') || [])];
  const divergencias = receiptDivergences(pedido, recebimento.itens);
  const activeKeys = new Set(divergencias.map(d => `${pedido.id}::${d.nome}`));
  const now = new Date().toISOString();
  const usuario = recebimento.responsavel || pedido.responsavel || (LS.get('config') || {}).responsavel || 'Usuário local';
  for (const d of divergencias) {
    const autoKey = `${pedido.id}::${d.nome}`;
    const idx = rncs.findIndex(r => r.autoGerada && (r.autoKey === autoKey || (r.pedidoId === pedido.id && r.produto === d.nome)));
    if (idx < 0 && !allowCreate) continue;
    const existente = idx >= 0 ? rncs[idx] : null;
    const changed = existente && (Number(existente.qtdPedida || 0) !== Number(d.qtd || 0) || Number(existente.qtdRecebida || 0) !== Number(d.qtdRecebida || 0));
    const natureza = d.diferenca < 0 ? 'Falta no recebimento' : 'Excesso no recebimento';
    const quantidade = Math.abs(d.diferenca);
    const canceladaPeloSistema = existente?.status === 'cancelada' && (existente.canceladaAutomaticamente || ['Recebimento de origem removido','Divergência removida após correção do recebimento.'].includes(existente.motivoCancelamento));
    const novoStatus = (!existente || canceladaPeloSistema || (changed && ['resolvida','cancelada'].includes(existente.status))) ? 'aberta' : (existente.status || 'aberta');
    const historicoStatus = [...(existente?.historicoStatus || [])];
    if (!existente || existente.status !== novoStatus) historicoStatus.push({ de:existente?.status || null, para:novoStatus, em:now, usuario });
    const base = {
      ...(existente || {}), id:existente?.id || uid(), numero:existente?.numero || nextRncNumber(pedido.origem, rncs, recebimento.data || todayISO()),
      data:recebimento.data || todayISO(), semana:pedido.semana, origem:pedido.origem, setor:'Recebimento', responsavel:usuario,
      produto:d.nome, fornecedor:pedido.origem === 'CD' ? 'Centro de Distribuição (CD)' : 'Cozinha de Produção (CP)', unidade:d.unit || 'UND', quantidade,
      qtdPedida:Number(d.qtd || 0), qtdRecebida:Number(d.qtdRecebida || 0), qtdRecusada:d.diferenca > 0 ? quantidade : 0,
      tipo:'Quantidade incorreta', naturezaDivergencia:natureza,
      descricao:`RNC automática por ${natureza.toLowerCase()}. Pedido ${wLbl(pedido.semana)}: solicitado ${d.qtd} ${d.unit || ''}, recebido ${d.qtdRecebida} ${d.unit || ''}, diferença ${d.diferenca > 0 ? '+' : ''}${d.diferenca}.`,
      acao:existente?.acao || 'Apenas registrar ocorrência', obsAcao:existente?.obsAcao || recebimento.observacoes || '',
      status:novoStatus, historicoStatus,
      encerradoEm:novoStatus === 'resolvida' ? existente?.encerradoEm || null : null,
      motivoCancelamento:novoStatus === 'cancelada' ? existente?.motivoCancelamento || '' : '', canceladaEm:novoStatus === 'cancelada' ? existente?.canceladaEm || null : null,
      fotos:existente?.fotos || [], assinatura:existente?.assinatura || null,
      autoGerada:true, autoKey, pedidoId:pedido.id, recebimentoId:recebimento.id, orcamentoId:pedido.orcamentoId || null,
      criadoEm:existente?.criadoEm || now, atualizadoEm:now, canceladaAutomaticamente:false,
    };
    if (idx >= 0) rncs[idx] = base; else rncs.unshift(base);
  }
  rncs = rncs.map(r => {
    if (!r.autoGerada || r.pedidoId !== pedido.id || activeKeys.has(r.autoKey || `${pedido.id}::${r.produto}`)) return r;
    if (!['aberta','analise'].includes(r.status)) return r;
    return { ...r, status:'cancelada', canceladaAutomaticamente:true, motivoCancelamento:'Divergência removida após correção do recebimento.', canceladaEm:now, atualizadoEm:now,
      historicoStatus:[...(r.historicoStatus || []), { de:r.status, para:'cancelada', em:now, usuario }] };
  });
  return rncs;
}
function RecebimentoTab({ toast }) {
  const [view, setView] = useState('lista');
  const [pedidos, setPedidos] = useState(() => LS.get('pedidos') || []);
  const [editing, setEditing] = useState(null);
  const [fBusca, setFBusca] = useState(''); const [fOrig, setFOrig] = useState('TODOS'); const [fStatus, setFStatus] = useState('TODOS'); const [limit, setLimit] = useState(30);
  useEffect(() => { const openTarget=()=>{ const t=LS.get('openTarget'); if(t?.tab==='recebimento'){ const rec=(LS.get('pedidos')||[]).find(x=>x.id===t.id); if(rec){ setEditing(rec); setView('editor'); } LS.del('openTarget'); } }; openTarget(); window.addEventListener('nx-open-target',openTarget); return()=>window.removeEventListener('nx-open-target',openTarget); }, []);
  const savePed = (p, rncsUpd=null) => {
    const upd = pedidos.map(x => x.id === p.id ? p : x);
    const changes = { pedidos:upd }; if (rncsUpd) changes.rncs = rncsUpd;
    if (!commitLocal(changes)) return false;
    setPedidos(upd); return true;
  };
  const deleteReceipt = pedido => {
    if (!pedido?.recebimento || !ensureWeekOpen(pedido.semana, toast, 'excluir o recebimento')) return false;
    const agora = new Date().toISOString();
    const usuario = pedido.recebimento?.responsavel || pedido.responsavel || (LS.get('config')||{}).responsavel || 'Usuário local';
    const backup = { pedidoId:pedido.id, recebimento:pedido.recebimento, statusAnterior:pedido.status, semana:pedido.semana, origem:pedido.origem };
    const entry = { id:uid(), type:'recebimento', record:backup, motivo:'Recebimento removido do pedido', apagadoEm:agora };
    const pedidosUpd = pedidos.map(p => p.id === pedido.id ? { ...p, status:'pendente', recebimento:null, atualizadoEm:agora } : p);
    const rncsUpd = (LS.get('rncs')||[]).map(r => r.autoGerada && r.pedidoId===pedido.id && r.status!=='cancelada' ? {
      ...r, status:'cancelada', canceladaEm:agora, atualizadoEm:agora, canceladaAutomaticamente:true, motivoCancelamento:'Recebimento de origem removido',
      historicoStatus:[...(r.historicoStatus||[]),{de:r.status,para:'cancelada',em:agora,usuario}]
    } : r);
    const trashUpd = [entry, ...(LS.get('trash')||[])].slice(0,300);
    if (!commitLocal({ pedidos:pedidosUpd, rncs:rncsUpd, trash:trashUpd })) return false;
    setPedidos(pedidosUpd); auditLog('Recebimento excluído', `${wLbl(pedido.semana)} · ${pedido.origem}`); return true;
  };
  if (view === 'editor') return html`<${RecEditor} pedido=${editing} toast=${toast}
    onBack=${() => { setView('lista'); setEditing(null); setPedidos(LS.get('pedidos') || []); }}
    onDeleteReceipt=${p => { const ok=deleteReceipt(p); if(ok){ toast.show('Recebimento enviado para a lixeira.'); setView('lista'); setEditing(null); } return ok; }}
    onSave=${(p, rncsUpd, msg='Recebimento finalizado!') => { if (savePed(p, rncsUpd)) { auditLog('Recebimento atualizado', `${wLbl(p.semana)} · ${p.origem} · ${p.status}`); toast.show(msg); setView('lista'); setEditing(null); setPedidos(LS.get('pedidos') || []); } }}/>`;
  const term=fBusca.trim().toLowerCase();
  const filtrados=pedidos.filter(p=>(fOrig==='TODOS'||p.origem===fOrig)&&(fStatus==='TODOS'||p.status===fStatus)&&(!term||`${wLbl(p.semana)} ${p.origem||''} ${p.responsavel||''} ${p.recebimento?.responsavel||''} ${(p.itens||[]).map(i=>i.nome).join(' ')}`.toLowerCase().includes(term)));
  const pendAll=filtrados.filter(p=>p.status==='pendente');
  const recAll=filtrados.filter(p=>['recebido','parcial'].includes(p.status)).sort((a,b)=>new Date(b.recebimento?.finalizadoEm||0)-new Date(a.recebimento?.finalizadoEm||0));
  const pend=pendAll.slice(0,limit), rec=recAll.slice(0,limit);
  const resetLimit=fn=>v=>{fn(v);setLimit(30)};
  return html`<div class="page">
    <div style=${{ marginBottom: 16 }}><h2 style=${{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", margin: 0 }}>Recebimento</h2><p style=${{ fontSize: 13, color: 'var(--s2)', margin: '2px 0 0' }}>Confirme os itens recebidos</p></div>
    ${pedidos.length>0 && html`<${RecordsFilter} busca=${fBusca} setBusca=${resetLimit(setFBusca)} origem=${fOrig} setOrigem=${resetLimit(setFOrig)} status=${fStatus} setStatus=${resetLimit(setFStatus)} statusOpts=${[{v:'pendente',l:'Aguardando'},{v:'recebido',l:'Recebido'},{v:'parcial',l:'Parcial'}]}/>`}
    ${pedidos.length===0 && html`<div class="empty"><${Ic} n="recv" s=${40} style=${{ color:'var(--s3)' }}/><p>Nenhum pedido disponível para recebimento.</p></div>`}
    ${pedidos.length>0 && filtrados.length===0 && html`<div class="empty"><p>Nenhum recebimento corresponde aos filtros.</p></div>`}
    ${pendAll.length > 0 && html`<span class="slbl">Aguardando (${pendAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>${pend.map(p => html`<${RCard} key=${p.id} p=${p} onClick=${() => { setEditing(p); setView('editor'); }}/>`)}<${MoreResults} total=${pendAll.length} shown=${pend.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
    ${recAll.length > 0 && html`<span class="slbl">Finalizados (${recAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${rec.map(p => html`<${RCard} key=${p.id} p=${p} onClick=${() => { setEditing(p); setView('editor'); }}/>`)}<${MoreResults} total=${recAll.length} shown=${rec.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
  </div>`;
}

function RCard({ p, onClick }) {
  const st = ST_PED[p.status] || { l: p.status, c: 'bgy' };
  return html`<button class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick=${onClick}>
    <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span><span class="badge bor">${p.origem}</span></div><div style=${{ fontWeight: 700, fontSize: 14 }}>${wLbl(p.semana)}</div><div style=${{ fontSize: 12, color: 'var(--s2)', marginTop: 2 }}>${(p.itens || []).length} itens · ${fDate(p.criadoEm)}</div></div>
    <${Ic} n="cr" s=${16} style=${{ color: 'var(--s3)' }}/>
  </button>`;
}

function RecEditor({ pedido, toast, onBack, onSave, onDeleteReceipt }) {
  const finalizado = ['recebido', 'parcial'].includes(pedido.status);
  const rec = pedido.recebimento || {};
  const [resp, setResp] = useState(rec.responsavel || (LS.get('config') || {}).responsavel || '');
  const [obs, setObs] = useState(rec.observacoes || '');
  const [qtdsR, setQtdsR] = useState(() => { const m = {}; (pedido.itens || []).forEach(i => { const ri = (rec.itens || []).find(r => r.nome === i.nome); m[i.nome] = ri ? String(ri.qtdRecebida) : ''; }); return m; });
  const [abrirRncAuto, setAbrirRncAuto] = useState((LS.get('config') || {}).abrirRncDivergencia || 'perguntar');
  const itens = pedido.itens || [];
  const locked = isWeekClosed(pedido.semana);
  const previewItems = itens.map(i => ({ ...i, qtdRecebida:nonNeg(qtdsR[i.nome]) }));
  const divergencias = receiptDivergences(pedido, previewItems);
  const corretos = Math.max(0, itens.length - divergencias.length);
  const totaisUnidade = previewItems.reduce((m,i) => { const u=i.unit || 'UND'; if(!m[u]) m[u]={pedido:0,recebido:0}; m[u].pedido+=Number(i.qtd||0); m[u].recebido+=Number(i.qtdRecebida||0); return m; },{});
  const snapshot = JSON.stringify({ resp, obs, qtdsR, abrirRncAuto });
  const guard = useDirtyGuard(snapshot);
  const finalizar = () => {
    if (!ensureWeekOpen(pedido.semana, toast, 'registrar o recebimento')) return;
    if (!resp.trim()) { toast.show('Informe o responsável pelo recebimento.'); return; }
    const iL = itens.map(i => ({ ...i, qtdRecebida:nonNeg(qtdsR[i.nome]) }));
    const divs = receiptDivergences(pedido, iL);
    const hasDiv = divs.length > 0;
    const receiptId = rec.id || uid();
    const recebimento = { ...rec, id:receiptId, data:rec.data || todayISO(), responsavel:resp.trim(), observacoes:obs.trim(), itens:iL,
      finalizadoEm:rec.finalizadoEm || new Date().toISOString(), atualizadoEm:new Date().toISOString(), status:hasDiv ? 'parcial' : 'completo' };
    const ped = { ...pedido, status:hasDiv ? 'parcial' : 'recebido', recebimento };
    const atuais = LS.get('rncs') || [];
    const hasExistingAuto = atuais.some(r => r.autoGerada && r.pedidoId === pedido.id);
    let allowCreate = false;
    if (hasDiv) {
      if (hasExistingAuto || abrirRncAuto === 'sempre') allowCreate = true;
      else if (abrirRncAuto === 'perguntar') allowCreate = confirm(`Foram encontradas ${divs.length} divergência(s), incluindo faltas ou excessos. Deseja gerar uma RNC individual para cada produto?`);
    }
    const rncsUpd = syncAutoRncsForReceipt(pedido, recebimento, allowCreate);
    guard.clean();
    onSave(ped, rncsUpd, hasDiv ? 'Recebimento salvo com divergências.' : 'Recebimento finalizado sem divergências.');
  };
  return html`<div style=${{ maxWidth: 'none', margin: '0 auto' }}>
    <div class="stk" style=${{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button class="btn bg0 bic" onClick=${() => guard.leave(onBack)}><${Ic} n="left" s=${20}/></button>
      <div style=${{ flex: 1 }}><div style=${{ fontWeight: 800, fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Recebimento · ${pedido.origem}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${wLbl(pedido.semana)}</div></div>
      ${finalizado && !locked && html`<button class="btn brd bsm" onClick=${() => { if (strongConfirm('Excluir recebimento') && onDeleteReceipt(pedido)) guard.clean(); }}>Excluir recebimento</button>`}
    </div>
    ${locked && html`<div class="nx-lock-note">Esta semana está fechada. O recebimento está em modo somente leitura.</div>`}
    <div class="page" style=${{ paddingBottom: 110 }}>
      <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
        <label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Responsável</label>
        <input class="inp" value=${resp} onInput=${e => setResp(e.target.value)} placeholder="Seu nome" disabled=${locked}/>
      </div>
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        ${[['Itens', itens.length, 'var(--ink)'], ['Conformes', corretos, 'var(--gr)'], ['Divergentes', divergencias.length, divergencias.length ? 'var(--rd)' : 'var(--gr)']].map(([l,v,c]) => html`<div key=${l} class="card" style=${{ padding:'12px', textAlign:'center' }}><div style=${{ fontSize:10,fontWeight:700,color:'var(--s3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4 }}>${l}</div><div style=${{ fontSize:22,fontWeight:800,color:c,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>${v}</div></div>`)}
      </div>
      <div class="card" style=${{ padding:12, marginBottom:12 }}><div style=${{fontSize:11,fontWeight:800,color:'var(--s2)',textTransform:'uppercase',marginBottom:8}}>Totais por unidade</div><div style=${{display:'flex',flexWrap:'wrap',gap:6}}>${Object.entries(totaisUnidade).map(([u,v])=>html`<span class=${`badge ${Math.abs(v.recebido-v.pedido)<.0001?'bgr2':'bam'}`}>${u}: ${Number(v.pedido.toFixed(2))} → ${Number(v.recebido.toFixed(2))}</span>`)}</div></div>
      <div class="card" style=${{ overflow: 'hidden', marginBottom: 12 }}>
        <div class="ghdr" style=${{ gridTemplateColumns: '1fr 64px 150px' }}><span>Produto</span><span style=${{ textAlign: 'center' }}>Ped.</span><span style=${{ textAlign: 'center' }}>Recebido</span></div>
        ${itens.map((item, idx) => { const qR = nonNeg(qtdsR[item.nome]), diff = qR - item.qtd; return html`
          <div key=${item.nome} class="irow" style=${{ gridTemplateColumns: '1fr 64px 150px', borderTop: idx > 0 ? '1px solid var(--bd)' : 'none', background: diff < 0 ? 'var(--rd3)' : diff > 0 ? 'var(--am3)' : '#fff' }}>
            <div><div style=${{ fontSize: 13, fontWeight: 500 }}>${item.nome}</div><div style=${{ fontSize: 11, color: 'var(--s3)' }}>${item.unit}${diff !== 0 ? html` · <span style=${{ fontWeight: 700, color: diff < 0 ? 'var(--rd)' : 'var(--am)' }}>${diff > 0 ? '+' : ''}${diff}</span>` : ''}</div></div>
            <div style=${{ textAlign: 'center', fontWeight: 600, color: 'var(--s2)' }}>${item.qtd}</div>
            <div style=${{ display: 'flex', justifyContent: 'center', gap:6, alignItems:'center' }}><button class="btn bs bsm" disabled=${locked} style=${{ padding:'7px 9px' }} onClick=${()=>setQtdsR(p=>({ ...p, [item.nome]: String(item.qtd) }))}>Tudo</button><input type="number" min="0" class="inp-n" value=${qtdsR[item.nome] ?? ''} disabled=${locked} onInput=${e => setQtdsR(p => ({ ...p, [item.nome]: e.target.value }))} style=${{ borderColor: diff !== 0 ? (diff < 0 ? 'var(--rd)' : 'var(--am)') : undefined }}/></div>
          </div>`; })}
      </div>
      <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
        <label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>RNC em caso de divergência</label>
        <select class="inp" value=${abrirRncAuto} disabled=${locked} onChange=${e => { setAbrirRncAuto(e.target.value); const c = LS.get('config') || {}; LS.set('config', { ...c, abrirRncDivergencia: e.target.value }); }} style=${{ marginBottom: 10 }}>
          <option value="perguntar">Perguntar ao finalizar</option><option value="sempre">Abrir automaticamente</option><option value="nunca">Não abrir automaticamente</option>
        </select>
        <div style=${{fontSize:11,color:'var(--s2)',margin:'-4px 0 12px'}}>Cada produto divergente gera uma RNC própria. Ao editar, a RNC existente é atualizada em vez de duplicada.</div>
        <label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Observações</label>
        <textarea class="inp" value=${obs} disabled=${locked} onInput=${e => setObs(e.target.value)} rows="3" placeholder="Divergências, ocorrências, observações importantes..."/>
      </div>
    </div>
    ${!locked && html`<div style=${{ position: 'sticky', bottom: 72, background: '#fff', borderTop: '1px solid var(--bd)', padding: '12px 16px' }}><button class="btn bgr" style=${{ width: '100%', padding: 14, borderRadius: 12, fontSize: 15 }} onClick=${finalizar}><${Ic} n="chk" s=${16}/>${finalizado ? 'Salvar alterações do recebimento' : 'Finalizar recebimento'}</button></div>`}
  </div>`;
}


/* ══════════════════════════════════════
   RNC
══════════════════════════════════════ */
function RncTab({ toast }) {
  const [view, setView] = useState('lista');
  const [rncs, setRncs] = useState(() => LS.get('rncs') || []);
  const [editing, setEditing] = useState(null);
  const [fBusca, setFBusca] = useState(''); const [fOrig, setFOrig] = useState('TODOS'); const [fStatus, setFStatus] = useState('TODOS'); const [limit, setLimit] = useState(30);
  useEffect(() => { const openTarget=()=>{ const t=LS.get('openTarget'); if(t?.tab==='rnc'){ const rec=(LS.get('rncs')||[]).find(x=>x.id===t.id); if(rec){ setEditing(rec); setView('editor'); } LS.del('openTarget'); } }; openTarget(); window.addEventListener('nx-open-target',openTarget); return()=>window.removeEventListener('nx-open-target',openTarget); }, []);
  const cat = useMemo(getCatalog, []);
  const allItems = useMemo(() => flatCatalog(cat), [cat]);
  const save = r => {
    if (!ensureWeekOpen(recordWeek(r), toast, 'salvar a RNC')) return false;
    const upd = upsertById(rncs, r);
    if (!LS.set('rncs', upd)) return false;
    setRncs(upd); auditLog(rncs.some(x => x.id === r.id) ? 'RNC atualizada' : 'RNC criada', `${r.numero} · ${r.produto} · ${r.status}`); return true;
  };
  const del = id => {
    const rec = rncs.find(r => r.id === id);
    if (!rec || !ensureWeekOpen(recordWeek(rec), toast, 'excluir a RNC')) return false;
    const trash = LS.get('trash') || [];
    const upd = rncs.filter(r => r.id !== id);
    const entry = { id:uid(), type:'rnc', record:rec, motivo:'Exclusão administrativa', apagadoEm:new Date().toISOString() };
    if (!commitLocal({ rncs:upd, trash:[entry,...trash].slice(0,300) })) return false;
    setRncs(upd); auditLog('RNC excluída', `${rec.numero} · ${rec.produto}`); return true;
  };
  const genNum = orig => nextRncNumber(orig, rncs);
  if (view === 'editor') return html`<${RncEditor} rnc=${editing} allItems=${allItems} toast=${toast} genNum=${genNum}
    onBack=${() => { setView('lista'); setEditing(null); }}
    onSave=${r => { if (save(r)) { toast.show('RNC salva'); setView('lista'); setEditing(null); } }}
    onDelete=${id => { if (del(id)) { toast.show('Excluída'); setView('lista'); setEditing(null); } }}/>`;
  const term=fBusca.trim().toLowerCase();
  const filtradas=rncs.filter(r=>(fOrig==='TODOS'||r.origem===fOrig)&&(fStatus==='TODOS'||r.status===fStatus)&&(!term||`${r.numero||''} ${r.produto||''} ${r.fornecedor||''} ${r.responsavel||''} ${r.tipo||''} ${r.lote||''} ${r.notaFiscal||''}`.toLowerCase().includes(term)));
  const abertasAll=filtradas.filter(r=>r.status==='aberta'||r.status==='analise').sort((a,b)=>new Date(b.data||0)-new Date(a.data||0));
  const resAll=filtradas.filter(r=>r.status==='resolvida'||r.status==='cancelada').sort((a,b)=>new Date(b.encerradoEm||b.atualizadoEm||b.data||0)-new Date(a.encerradoEm||a.atualizadoEm||a.data||0));
  const abertas=abertasAll.slice(0,limit), res=resAll.slice(0,limit);
  const resetLimit=fn=>v=>{fn(v);setLimit(30)};
  return html`<div class="page">
    <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 16 }}>
      <div><h2 style=${{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", margin: 0 }}>RNC</h2><p style=${{ fontSize: 13, color: 'var(--s2)', margin: '2px 0 0' }}>Registros de Não Conformidade</p></div>
      <button class="btn bp bsm" onClick=${() => { setEditing(null); setView('editor'); }}><${Ic} n="plus" s=${14}/>Nova RNC</button>
    </div>
    ${rncs.length>0 && html`<${RecordsFilter} busca=${fBusca} setBusca=${resetLimit(setFBusca)} origem=${fOrig} setOrigem=${resetLimit(setFOrig)} status=${fStatus} setStatus=${resetLimit(setFStatus)} statusOpts=${[{v:'aberta',l:'Aberta'},{v:'analise',l:'Em acompanhamento'},{v:'resolvida',l:'Concluída'},{v:'cancelada',l:'Cancelada'}]}/>`}
    ${rncs.length === 0 && html`<div class="empty"><${Ic} n="rnc" s=${40} style=${{ color: 'var(--s3)' }}/><p>Nenhuma RNC registrada.</p><button class="btn bp" style=${{ marginTop: 8 }} onClick=${() => setView('editor')}><${Ic} n="plus" s=${16}/>Abrir RNC</button></div>`}
    ${rncs.length>0 && filtradas.length===0 && html`<div class="empty"><p>Nenhuma RNC corresponde aos filtros.</p></div>`}
    ${abertasAll.length > 0 && html`<span class="slbl">Em aberto (${abertasAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>${abertas.map(r => html`<${RncCard} key=${r.id} rnc=${r} onClick=${() => { setEditing(r); setView('editor'); }}/>`)}<${MoreResults} total=${abertasAll.length} shown=${abertas.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
    ${resAll.length > 0 && html`<span class="slbl">Concluídas / Canceladas (${resAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${res.map(r => html`<${RncCard} key=${r.id} rnc=${r} onClick=${() => { setEditing(r); setView('editor'); }}/>`)}<${MoreResults} total=${resAll.length} shown=${res.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
  </div>`;
}

function RncCard({ rnc, onClick }) {
  const st = ST_RNC[rnc.status] || { l: rnc.status, c: 'bgy' };
  return html`<button class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer', opacity: ['resolvida','cancelada'].includes(rnc.status) ? .85 : 1 }} onClick=${onClick}>
    <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span>${rnc.origem && html`<span class="badge bor">${rnc.origem}</span>`}</div><div style=${{ fontWeight: 700, fontSize: 14 }}>${rnc.numero}</div><div style=${{ fontSize: 12, color: 'var(--s2)', marginTop: 2 }}>${rnc.produto || '—'} · ${fDate(rnc.data)}</div></div>
    <${Ic} n="cr" s=${16} style=${{ color: 'var(--s3)' }}/>
  </button>`;
}

/* SignaturePad — canvas de assinatura digital reutilizável.
   Retorna dataURL via onChange (PNG transparente, traço escuro). */
function SignaturePad({ value, onChange, label='Assinatura' }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const dirtyRef = useRef(false);

  // Inicializa o canvas com a resolução visual correta (DPR)
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = 140;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111827';
    // se já tinha assinatura salva, redesenha
    if (value) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, w, h); dirtyRef.current = true; };
      img.src = value;
    }
  }, []); // só uma vez na montagem; tamanho fixo no editor

  const pos = (e) => {
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    const touch = e.touches?.[0];
    const x = (touch ? touch.clientX : e.clientX) - rect.left;
    const y = (touch ? touch.clientY : e.clientY) - rect.top;
    return { x, y };
  };
  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = pos(e);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    dirtyRef.current = true;
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (dirtyRef.current) {
      const data = canvasRef.current.toDataURL('image/png');
      onChange?.(data);
    }
  };
  const clear = () => {
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    dirtyRef.current = false;
    onChange?.(null);
  };

  return html`<div ref=${wrapRef} style=${{ width: '100%' }}>
    <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 8 }}>
      <span style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>${label}</span>
      <button class="btn bg0 bsm" onClick=${clear} style=${{ color: 'var(--s2)' }}><${Ic} n="x" s=${12}/>Limpar</button>
    </div>
    <div style=${{ position: 'relative', border: '1.5px dashed var(--bd)', borderRadius: 10, background: '#FAFAFA', overflow: 'hidden' }}>
      <canvas
        ref=${canvasRef}
        onMouseDown=${start}
        onMouseMove=${move}
        onMouseUp=${end}
        onMouseLeave=${end}
        onTouchStart=${start}
        onTouchMove=${move}
        onTouchEnd=${end}
        style=${{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
      />
      ${!value && !dirtyRef.current && html`<div style=${{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--s3)', fontSize: 12, pointerEvents: 'none', fontStyle: 'italic' }}>Assine aqui</div>`}
    </div>
  </div>`;
}

function RncEditor({ rnc, allItems, toast, genNum, onBack, onSave, onDelete }) {
  const isEdit = !!rnc?.id;
  const [step, setStep] = useState(1);

  // --- Estado dos campos ---
  const [orig, setOrig] = useState(rnc?.origem || 'CD');
  const [setor, setSetor] = useState(rnc?.setor || '');
  const [setorCustom, setSetorCustom] = useState(!!(rnc?.setor && !['CD','CP'].includes(rnc.setor)));
  const [data, setData] = useState(rnc?.data || todayISO());
  const [status, setStatus] = useState(rnc?.status || 'aberta');
  const [resp, setResp] = useState(rnc?.responsavel || (LS.get('config') || {}).responsavel || '');

  const [produto, setProduto] = useState(rnc?.produto || '');
  const [fornecedor, setFornecedor] = useState(rnc?.fornecedor || '');
  const [unit, setUnit] = useState(rnc?.unidade || 'UND');
  const [qtd, setQtd] = useState(String(rnc?.quantidade || ''));

  const [tipo, setTipo] = useState(rnc?.tipo || '');
  const [tipoCustom, setTipoCustom] = useState(rnc?.tipoCustom || '');
  const [desc, setDesc] = useState(rnc?.descricao || '');

  const [acao, setAcao] = useState(rnc?.acao || '');
  const [obsAcao, setObsAcao] = useState(rnc?.obsAcao || '');
  const [notaFiscal, setNotaFiscal] = useState(rnc?.notaFiscal || '');
  const [lote, setLote] = useState(rnc?.lote || '');
  const [fabricacao, setFabricacao] = useState(rnc?.fabricacao || '');
  const [validade, setValidade] = useState(rnc?.validade || '');
  const [temperatura, setTemperatura] = useState(rnc?.temperatura ?? '');
  const [qtdPedida, setQtdPedida] = useState(String(rnc?.qtdPedida ?? ''));
  const [qtdRecebida, setQtdRecebida] = useState(String(rnc?.qtdRecebida ?? ''));
  const [qtdRecusada, setQtdRecusada] = useState(String(rnc?.qtdRecusada ?? ''));
  const [gravidade, setGravidade] = useState(rnc?.gravidade || 'Média');
  const [impactoFinanceiro, setImpactoFinanceiro] = useState(String(rnc?.impactoFinanceiro ?? ''));
  const [respostaFornecedor, setRespostaFornecedor] = useState(rnc?.respostaFornecedor || '');
  const [medidaRealizada, setMedidaRealizada] = useState(rnc?.medidaRealizada || (rnc?.status === 'resolvida' ? (rnc?.verificacaoEficacia || rnc?.planoAcao || '') : ''));

  const [fotos, setFotos] = useState(rnc?.fotos || []);
  const [assinatura, setAssinatura] = useState(rnc?.assinatura || null);
  const fotoRef = useRef(null);

  const TIPOS = [
    { v: 'Produto fora do prazo', ic: 'orc' },
    { v: 'Produto com avaria', ic: 'rnc' },
    { v: 'Quantidade incorreta', ic: 'recv' },
    { v: 'Produto fora do padrão de qualidade', ic: 'rnc' },
    { v: 'Temperatura inadequada', ic: 'rnc' },
    { v: 'Embalagem danificada', ic: 'rnc' },
    { v: 'Outro (descrever)', ic: 'pen' },
  ];
  const ACOES = [
    { v: 'Devolução ao fornecedor', desc: 'Material será devolvido na próxima entrega' },
    { v: 'Substituição imediata', desc: 'Fornecedor deve repor o item' },
    { v: 'Crédito em nota', desc: 'Abatimento no próximo faturamento' },
    { v: 'Desconto na próxima entrega', desc: 'Negociar abatimento futuro' },
    { v: 'Apenas registrar ocorrência', desc: 'Sem providência imediata, apenas histórico' },
  ];
  const STATUS_OPTS = [
    { v: 'aberta', l: 'Aberta', desc: 'PDF enviado ou aguardando resposta do fornecedor', c: 'brd2' },
    { v: 'analise', l: 'Em acompanhamento', desc: 'Fornecedor respondeu; troca, crédito ou correção ainda está pendente', c: 'bam' },
    { v: 'resolvida', l: 'Concluída', desc: 'A providência foi efetivada e a RNC pode ser encerrada', c: 'bgr2' },
    { v: 'cancelada', l: 'Cancelada', desc: 'Registro encerrado sem prosseguimento', c: 'bgy' },
  ];

  const addFoto = file => {
    if (!file) return;
    if (fotos.length >= 3) { toast.show('Limite de 3 fotos por RNC.'); return; }
    if (file.size > 12 * 1024 * 1024) { toast.show('A imagem excede 12 MB.'); return; }
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const max = 900;
        let w = img.width, h = img.height;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        if (h > max) { w = Math.round(w * max / h); h = max; }
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        let data = c.toDataURL('image/webp', .68);
        if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', .68);
        const projectedMb = storageUsage().mb + (data.length * 2 / 1024 / 1024);
        if (projectedMb > 4.5) { toast.show('A foto não foi adicionada porque o armazenamento local está quase cheio. Exporte um backup e remova fotos antigas.'); return; }
        setFotos(p => [...p, data].slice(0,3));
      };
      img.onerror = () => toast.show('Não foi possível processar a imagem.');
      img.src = e.target.result;
    };
    r.onerror = () => toast.show('Não foi possível ler a imagem.');
    r.readAsDataURL(file);
  };

  const itemsOrig = allItems.filter(i => i.orig === orig);

  // --- Validações por etapa ---
  const v1 = !!(orig && data && resp.trim());
  const v2 = !!(produto.trim() && parseFloat(qtd) > 0 && (tipo && (tipo !== 'Outro (descrever)' || tipoCustom.trim())) && desc.trim());
  const conclusaoOk = status !== 'resolvida' || !!medidaRealizada.trim();
  const cancelamentoOk = status !== 'cancelada' || !!obsAcao.trim();
  const v3 = !!(acao && conclusaoOk && cancelamentoOk);
  const podeRegistrar = v1 && v2 && v3;
  const semanaRegistro = rnc?.pedidoId && rnc?.semana ? rnc.semana : dateToWeek(data);
  const locked = isWeekClosed(semanaRegistro);

  const tipoFinal = tipo === 'Outro (descrever)' && tipoCustom ? tipoCustom : tipo;

  const snapshot = JSON.stringify({ orig,setor,setorCustom,data,status,resp,produto,fornecedor,unit,qtd,tipo,tipoCustom,desc,acao,obsAcao,notaFiscal,lote,fabricacao,validade,temperatura,qtdPedida,qtdRecebida,qtdRecusada,gravidade,impactoFinanceiro,respostaFornecedor,medidaRealizada,fotos,assinatura });
  const guard = useDirtyGuard(snapshot);
  const salvar = () => {
    if (!ensureWeekOpen(semanaRegistro, toast, 'salvar a RNC')) return;
    if (!podeRegistrar) {
      toast.show(status === 'resolvida' && !conclusaoOk ? 'Para concluir, informe a medida que foi efetivamente realizada.' : status === 'cancelada' && !cancelamentoOk ? 'Informe o motivo do cancelamento nas observações da solicitação.' : 'Preencha os campos obrigatórios');
      return;
    }
    const agora = new Date().toISOString();
    const historicoAnterior = Array.isArray(rnc?.historicoStatus) ? rnc.historicoStatus : [];
    const historicoStatus = (!rnc || rnc.status !== status)
      ? [...historicoAnterior, { de:rnc?.status || null, para:status, em:agora, usuario:resp.trim() || 'Usuário local' }]
      : (historicoAnterior.length ? historicoAnterior : [{ de:null, para:status, em:rnc?.criadoEm || agora, usuario:resp.trim() || 'Usuário local' }]);
    guard.clean();
    onSave({
      ...(rnc || {}),
      id: rnc?.id || uid(),
      numero: rnc?.numero || genNum(orig),
      data, semana:semanaRegistro, responsavel: resp, origem: orig, setor: (setor || '').trim(),
      produto: produto.trim(), fornecedor: fornecedor.trim(), unidade: unit, quantidade: nonNeg(qtd),
      qtdPedida:nonNeg(qtdPedida), qtdRecebida:nonNeg(qtdRecebida), qtdRecusada:nonNeg(qtdRecusada),
      notaFiscal:notaFiscal.trim(), lote:lote.trim(), fabricacao, validade, temperatura:temperatura === '' ? null : parseFloat(temperatura),
      gravidade, impactoFinanceiro:nonNeg(impactoFinanceiro),
      tipo: tipoFinal, tipoCustom, descricao: desc.trim(),
      acao, obsAcao: obsAcao.trim(),
      respostaFornecedor:respostaFornecedor.trim(), medidaRealizada:medidaRealizada.trim(),
      causaRaiz:undefined, planoAcao:undefined, responsavelAcao:undefined, prazoAcao:undefined, verificacaoEficacia:undefined,
      status, encerradoEm:status === 'resolvida' ? (rnc?.encerradoEm || agora) : null, motivoCancelamento:status==='cancelada' ? obsAcao.trim() : '', historicoStatus,
      fotos, assinatura,
      criadoEm: rnc?.criadoEm || agora, atualizadoEm: agora,
    });
  };

  // --- Helpers visuais ---
  const stepHeader = (n, label) => html`<div class="row" style=${{ gap: 10, marginBottom: 14 }}>
    <div style=${{ width: 30, height: 30, borderRadius: '50%', background: 'var(--or)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>${n}</div>
    <div style=${{ fontWeight: 800, fontSize: 16, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>${label}</div>
  </div>`;

  const labelObrig = (txt) => html`<label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>${txt} <span style=${{ color: 'var(--rd)' }}>*</span></label>`;
  const labelOpt = (txt) => html`<label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>${txt}</label>`;

  const stStat = ST_RNC[status] || { l: status, c: 'bgy' };

  return html`<div style=${{ maxWidth: 'none', margin: '0 auto' }}>
    <div class="stk" style=${{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button class="btn bg0 bic" onClick=${() => guard.leave(onBack)}><${Ic} n="left" s=${20}/></button>
      <div style=${{ flex: 1, minWidth: 0 }}>
        <div class="row" style=${{ gap: 6, marginBottom: 2 }}>
          <span class=${`badge ${stStat.c}`}>${stStat.l}</span>
          ${orig && html`<span class="badge bor">${orig}</span>`}
        </div>
        <div style=${{ fontWeight: 800, fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>${isEdit ? rnc.numero : 'Nova RNC'}</div>
        <div style=${{ fontSize: 11, color: 'var(--s2)' }}>Registro de Não Conformidade</div>
      </div>
      ${isEdit && !locked && html`<button class="btn bg0 bic" style=${{ color: 'var(--rd)' }} onClick=${() => { if (strongConfirm('Excluir registro')) onDelete(rnc.id); }}><${Ic} n="trash" s=${18}/></button>`}
    </div>

    ${locked && html`<div class="nx-lock-note">Esta semana está fechada. A RNC está em modo somente leitura.</div>`}

    <!-- Stepper visual -->
    <div style=${{ padding: '12px 16px 4px', background: '#fff', borderBottom: '1px solid var(--bd)' }}>
      <div class="row" style=${{ gap: 4, justifyContent: 'space-between' }}>
        ${[
          { n: 1, l: 'Identificação', ok: v1 },
          { n: 2, l: 'Ocorrência', ok: v2 },
          { n: 3, l: 'Ação', ok: v3 },
          { n: 4, l: 'Evidências', ok: true },
        ].map(s => html`<button key=${s.n} onClick=${() => setStep(s.n)} style=${{
          flex: 1, padding: '6px 4px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: `3px solid ${step === s.n ? 'var(--or)' : 'transparent'}`,
          opacity: step === s.n ? 1 : .55,
        }}>
          <div class="row" style=${{ gap: 4, justifyContent: 'center', marginBottom: 2 }}>
            <div style=${{ width: 18, height: 18, borderRadius: '50%', background: s.ok ? 'var(--gr)' : (step === s.n ? 'var(--or)' : 'var(--bd)'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>${s.ok ? '✓' : s.n}</div>
          </div>
          <div style=${{ fontSize: 10, fontWeight: 700, color: step === s.n ? 'var(--ink)' : 'var(--s2)' }}>${s.l}</div>
        </button>`)}
      </div>
    </div>

    <fieldset disabled=${locked} class="page" style=${{ paddingBottom:140, border:'none', minWidth:0, pointerEvents:locked?'none':'auto', opacity:locked?.82:1 }}>

      ${step === 1 && html`<div>
        ${stepHeader(1, 'Identificação do registro')}

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          ${labelObrig('Origem do produto')}
          <div style=${{ fontSize: 11, color: 'var(--s2)', margin: '-2px 0 8px' }}>De onde o produto é. Define o código da RNC (RNC-CD ou RNC-CP).</div>
          <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            ${['CD','CP'].map(o => html`<button key=${o} onClick=${() => setOrig(o)} style=${{
              padding: '12px', borderRadius: 10,
              border: `2px solid ${orig === o ? 'var(--or)' : 'var(--bd)'}`,
              background: orig === o ? 'var(--or3)' : '#fff',
              fontWeight: 800, fontSize: 13, cursor: 'pointer',
              color: orig === o ? 'var(--or2)' : 'var(--ink)',
              display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
            }}>
              <span>${o}</span>
              <span style=${{ fontSize: 10, fontWeight: 500, color: 'var(--s2)' }}>${o === 'CD' ? 'Centro de Distribuição' : 'Cozinha de Produção'}</span>
            </button>`)}
          </div>

          ${labelOpt('Setor de origem')}
          <div style=${{ fontSize: 11, color: 'var(--s2)', margin: '-2px 0 8px' }}>Onde a não conformidade foi identificada. Escolha ou escreva.</div>
          <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            ${['CD','CP','Outro'].map(s => {
              const active = s === 'Outro' ? setorCustom : (!setorCustom && setor === s);
              return html`<button key=${s} onClick=${() => {
                if (s === 'Outro') {
                  setSetorCustom(true);
                  if (['CD','CP'].includes(setor)) setSetor('');
                } else {
                  setSetorCustom(false);
                  setSetor(s);
                }
              }} style=${{
                padding: '9px 16px', borderRadius: 20,
                border: `1.5px solid ${active ? 'var(--or)' : 'var(--bd)'}`,
                background: active ? 'var(--or3)' : '#fff',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                color: active ? 'var(--or2)' : 'var(--ink)',
              }}>${s}</button>`;
            })}
          </div>
          ${setorCustom && html`<input class="inp" value=${setor} onInput=${e => setSetor(e.target.value)} placeholder="Digite o setor (ex: Recebimento, Salão, Câmara fria...)" style=${{ marginBottom: 4 }}/>`}

          <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div>${labelObrig('Data da ocorrência')}<input type="date" class="inp" value=${data} onInput=${e => setData(e.target.value)}/></div>
            <div>${labelObrig('Status')}<select class="inp" value=${status} onChange=${e => setStatus(e.target.value)}>${STATUS_OPTS.map(s => html`<option key=${s.v} value=${s.v}>${s.l}</option>`)}</select></div>
          </div>
          <div style=${{ fontSize: 11, color: 'var(--s2)', marginTop: 6 }}>${STATUS_OPTS.find(s => s.v === status)?.desc || ''}</div>
        </div>

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          <div style=${{fontWeight:800,fontSize:14,marginBottom:12}}>Rastreabilidade do produto</div>
          <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div>${labelOpt('Nota fiscal')}<input class="inp" value=${notaFiscal} onInput=${e=>setNotaFiscal(e.target.value)} placeholder="Número da NF"/></div>
            <div>${labelOpt('Lote')}<input class="inp" value=${lote} onInput=${e=>setLote(e.target.value)} placeholder="Lote do produto"/></div>
            <div>${labelOpt('Fabricação')}<input type="date" class="inp" value=${fabricacao} onInput=${e=>setFabricacao(e.target.value)}/></div>
            <div>${labelOpt('Validade')}<input type="date" class="inp" value=${validade} onInput=${e=>setValidade(e.target.value)}/></div>
          </div>
          ${labelOpt('Temperatura no recebimento (°C)')}<input type="number" step="0.1" class="inp" value=${temperatura} onInput=${e=>setTemperatura(e.target.value)} placeholder="Ex: -12,5"/>
          ${(rnc?.pedidoId || rnc?.recebimentoId || rnc?.orcamentoId) && html`<div style=${{fontSize:11,color:'var(--s2)',marginTop:10}}>Vínculos: Pedido ${rnc?.pedidoId || '—'} · Recebimento ${rnc?.recebimentoId || '—'} · Orçamento ${rnc?.orcamentoId || '—'}</div>`}
        </div>

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          ${labelObrig('Responsável pelo registro')}
          <input class="inp" value=${resp} onInput=${e => setResp(e.target.value)} placeholder="Nome completo"/>
          <div style=${{ fontSize: 11, color: 'var(--s2)', marginTop: 6 }}>Quem identificou a não conformidade e está registrando este documento.</div>
        </div>
      </div>`}

      ${step === 2 && html`<div>
        ${stepHeader(2, 'Detalhes da ocorrência')}

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          ${labelObrig('Produto')}
          <input
            class="inp"
            list="rnc-produtos"
            value=${produto}
            onInput=${e => setProduto(e.target.value)}
            placeholder="Selecione ou digite o nome do produto"
            style=${{ marginBottom: 12 }}
          />
          <datalist id="rnc-produtos">
            ${itemsOrig.map(i => html`<option key=${i.name} value=${i.name}/>`)}
          </datalist>

          <div style=${{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>${labelObrig('Quantidade afetada')}<input type="number" min="0" step="any" class="inp" value=${qtd} onInput=${e => setQtd(e.target.value)} placeholder="0"/></div>
            <div>${labelObrig('Unidade')}<select class="inp" value=${unit} onChange=${e => setUnit(e.target.value)}>${['UND','KG','G','L','ML','PCT','CX','PCS'].map(u => html`<option key=${u} value=${u}>${u}</option>`)}</select></div>
          </div>
          <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
            <div>${labelOpt('Qtd. pedida')}<input type="number" min="0" step="any" class="inp" value=${qtdPedida} onInput=${e=>setQtdPedida(e.target.value)}/></div>
            <div>${labelOpt('Qtd. recebida')}<input type="number" min="0" step="any" class="inp" value=${qtdRecebida} onInput=${e=>setQtdRecebida(e.target.value)}/></div>
            <div>${labelOpt('Qtd. recusada')}<input type="number" min="0" step="any" class="inp" value=${qtdRecusada} onInput=${e=>setQtdRecusada(e.target.value)}/></div>
          </div>
          <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            <div>${labelObrig('Gravidade')}<select class="inp" value=${gravidade} onChange=${e=>setGravidade(e.target.value)}>${['Baixa','Média','Alta','Crítica'].map(g=>html`<option key=${g}>${g}</option>`)}</select></div>
            <div>${labelOpt('Impacto financeiro (R$)')}<input type="number" min="0" step="0.01" class="inp" value=${impactoFinanceiro} onInput=${e=>setImpactoFinanceiro(e.target.value)} placeholder="0,00"/></div>
          </div>

          ${labelOpt('Fornecedor')}
          <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            ${[['CD','Centro de Distribuição (CD)'],['CP','Cozinha de Produção (CP)']].map(([k,full]) => html`<button key=${k} onClick=${() => setFornecedor(fornecedor === full ? '' : full)} style=${{
              padding: '8px 14px', borderRadius: 20,
              border: `1.5px solid ${fornecedor === full ? 'var(--or)' : 'var(--bd)'}`,
              background: fornecedor === full ? 'var(--or3)' : '#fff',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
              color: fornecedor === full ? 'var(--or2)' : 'var(--ink)',
            }}>${k}</button>`)}
          </div>
          <input class="inp" value=${fornecedor} onInput=${e => setFornecedor(e.target.value)} placeholder="Nome do fornecedor (opcional) — ou use CD/CP acima"/>
        </div>

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          ${labelObrig('Tipo de não conformidade')}
          <div style=${{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            ${TIPOS.map(t => html`<button key=${t.v} onClick=${() => setTipo(t.v)} style=${{
              padding: '12px 14px', borderRadius: 10,
              border: `1.5px solid ${tipo === t.v ? 'var(--or)' : 'var(--bd)'}`,
              background: tipo === t.v ? 'var(--or3)' : '#fff',
              textAlign: 'left', fontSize: 13,
              fontWeight: tipo === t.v ? 700 : 500,
              color: tipo === t.v ? 'var(--or2)' : 'var(--ink)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <${Ic} n=${t.ic} s=${16}/>
              <span style=${{ flex: 1 }}>${t.v}</span>
              ${tipo === t.v && html`<${Ic} n="chk" s=${16}/>`}
            </button>`)}
          </div>
          ${tipo === 'Outro (descrever)' && html`<input class="inp" value=${tipoCustom} onInput=${e => setTipoCustom(e.target.value)} placeholder="Descreva brevemente o tipo do problema..." style=${{ marginBottom: 12 }}/>`}

          ${labelObrig('Descrição')}
          <textarea class="inp" value=${desc} onInput=${e => setDesc(e.target.value)} rows="4" placeholder="Descreva o que foi identificado: o que estava errado, quando notou, em que estado o produto chegou, etc."/>
          <div style=${{ fontSize: 11, color: 'var(--s2)', marginTop: 6 }}>Quanto mais detalhado, mais útil para a gestão e o fornecedor.</div>
        </div>
      </div>`}

      ${step === 3 && html`<div>
        ${stepHeader(3, 'Providência e acompanhamento')}

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          ${labelObrig('Providência solicitada ao fornecedor')}
          <div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            ${ACOES.map(a => html`<button key=${a.v} onClick=${() => setAcao(a.v)} style=${{
              padding: '12px 14px', borderRadius: 10,
              border: `1.5px solid ${acao === a.v ? 'var(--or)' : 'var(--bd)'}`,
              background: acao === a.v ? 'var(--or3)' : '#fff',
              textAlign: 'left', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
            }}>
              <span style=${{ fontWeight: acao === a.v ? 800 : 700, fontSize: 13, color: acao === a.v ? 'var(--or2)' : 'var(--ink)' }}>${a.v}</span>
              <span style=${{ fontSize: 11, color: 'var(--s2)' }}>${a.desc}</span>
            </button>`)}
          </div>

          ${labelOpt('Detalhes da solicitação')}
          <textarea class="inp" value=${obsAcao} onInput=${e => setObsAcao(e.target.value)} rows="3" placeholder="Ex.: substituir até determinada data, retirar o produto, lançar crédito ou apenas registrar a ocorrência."/>
        </div>

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          <div style=${{fontWeight:800,fontSize:14,marginBottom:4}}>Acompanhamento interno do Ilha</div>
          <div style=${{fontSize:11,color:'var(--s2)',marginBottom:14}}>Registre apenas o retorno recebido pelo WhatsApp e o que foi efetivamente cumprido. O plano de ação interno do fornecedor não faz parte do NEXUS.</div>
          ${labelOpt('Retorno do fornecedor')}
          <textarea class="inp" value=${respostaFornecedor} onInput=${e=>setRespostaFornecedor(e.target.value)} rows="3" placeholder="Ex.: A troca será efetuada; o valor será abonado porque não há estoque; ainda não houve retorno." style=${{marginBottom:12}}/>
          ${status === 'resolvida' ? labelObrig('Medida efetivamente realizada') : labelOpt('Medida efetivamente realizada')}
          <textarea class="inp" value=${medidaRealizada} onInput=${e=>setMedidaRealizada(e.target.value)} rows="3" placeholder="Preencha quando a providência for concluída. Ex.: 200 unidades substituídas; crédito lançado na NF; produto recolhido."/>
          ${status !== 'resolvida' && html`<div style=${{fontSize:11,color:'var(--s2)',marginTop:6}}>Enquanto a troca, o crédito ou a correção não forem efetivados, mantenha a RNC aberta ou em acompanhamento.</div>`}
        </div>
      </div>`}

      ${step === 4 && html`<div>
        ${stepHeader(4, 'Evidências e assinatura')}

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style=${{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Fotos da ocorrência</div>
              <div style=${{ fontSize: 11, color: 'var(--s2)', marginTop: 2 }}>${fotos.length}/3 ${fotos.length === 1 ? 'evidência anexada' : 'evidências anexadas'}</div>
            </div>
            <button class="btn bs bsm" disabled=${fotos.length >= 3} onClick=${() => fotoRef.current?.click()}><${Ic} n="img" s=${14}/>Adicionar</button>
          </div>
          <input ref=${fotoRef} type="file" accept="image/*" capture="environment" style=${{ display: 'none' }} onChange=${e => { addFoto(e.target.files[0]); e.target.value = ''; }}/>
          ${fotos.length === 0
            ? html`<div style=${{ padding: '24px 12px', textAlign: 'center', border: '1.5px dashed var(--bd)', borderRadius: 10, color: 'var(--s2)' }}>
                <${Ic} n="img" s=${28} style=${{ color: 'var(--s3)' }}/>
                <div style=${{ fontSize: 12, marginTop: 6 }}>Anexe fotos do produto, da embalagem ou do prazo de validade</div>
              </div>`
            : html`<div style=${{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>${fotos.map((f, i) => html`<div key=${i} style=${{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--bd)' }}>
                <img src=${f} style=${{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                <div style=${{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,.65)', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>#${i+1}</div>
                <button onClick=${() => setFotos(p => p.filter((_, j) => j !== i))} style=${{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.7)', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}><${Ic} n="x" s=${12}/></button>
              </div>`)}</div>`
          }
        </div>

        <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
          <div style=${{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>Assinatura do responsável</div>
          <div style=${{ fontSize: 11, color: 'var(--s2)', marginBottom: 12 }}>Opcional — confere autenticidade ao registro impresso.</div>
          <${SignaturePad} value=${assinatura} onChange=${setAssinatura}/>
        </div>

        ${isEdit && Array.isArray(rnc?.historicoStatus) && rnc.historicoStatus.length > 0 && html`<div class="card" style=${{padding:16,marginBottom:12}}><div style=${{fontSize:13,fontWeight:800,marginBottom:10}}>Histórico de status</div><div style=${{display:'flex',flexDirection:'column',gap:8}}>${[...rnc.historicoStatus].reverse().map((h,i)=>html`<div key=${i} style=${{display:'grid',gridTemplateColumns:'140px 1fr',gap:10,fontSize:12,borderTop:i?'1px solid var(--bd)':'none',paddingTop:i?8:0}}><span style=${{color:'var(--s2)'}}>${fDateTime(h.em)}</span><span><strong>${h.de ? (ST_RNC[h.de]?.l || h.de) : 'Criação'}</strong> → <strong>${ST_RNC[h.para]?.l || h.para}</strong><br/><small style=${{color:'var(--s3)'}}>${h.usuario || 'Usuário local'}</small></span></div>`)}</div></div>`}

        <!-- Resumo final -->
        <div class="card" style=${{ padding: 16, marginBottom: 12, background: 'var(--or3)', border: '1.5px solid var(--or)' }}>
          <div style=${{ fontSize: 11, fontWeight: 800, color: 'var(--or2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Resumo do registro</div>
          ${[
            ['Número', rnc?.numero || '(será gerado ao salvar)'],
            ['Origem', orig],
            ['Data', fDate(data)],
            ['Responsável', resp || '—'],
            ['Produto', produto || '—'],
            ['Quantidade', qtd ? `${qtd} ${unit}` : '—'],
            ['Gravidade', gravidade],
            ['NF / Lote', [notaFiscal,lote].filter(Boolean).join(' / ') || '—'],
            ['Tipo', tipoFinal || '—'],
            ['Providência solicitada', acao || '—'],
            ['Evidências', `${fotos.length} foto(s)${assinatura ? ' · assinado' : ''}`],
          ].map(([k, v]) => html`<div key=${k} class="row" style=${{ padding: '6px 0', borderBottom: '1px dashed rgba(201, 120, 0, .25)', fontSize: 12 }}>
            <span style=${{ fontWeight: 700, color: 'var(--s2)', minWidth: 110 }}>${k}</span>
            <span style=${{ color: 'var(--ink)', fontWeight: 500, textAlign: 'right', flex: 1 }}>${v}</span>
          </div>`)}
        </div>
      </div>`}

    </fieldset>

    <!-- Footer fixo -->
    ${!locked && html`<div style=${{ position: 'sticky', bottom: 72, background: '#fff', borderTop: '1px solid var(--bd)', padding: '12px 16px', display: 'flex', gap: 8 }}>
      ${step > 1
        ? html`<button class="btn bs" style=${{ flex: 1 }} onClick=${() => setStep(s => s - 1)}><${Ic} n="left" s=${14}/>Voltar</button>`
        : html`<button class="btn bs" style=${{ flex: 1 }} onClick=${() => guard.leave(onBack)}>Cancelar</button>`
      }
      ${step < 4
        ? html`<button class="btn bp" style=${{ flex: 2, padding: 14, borderRadius: 12 }} onClick=${() => setStep(s => s + 1)}>Próxima etapa<${Ic} n="cr" s=${14}/></button>`
        : html`<button class="btn bp" style=${{ flex: 2, padding: 14, borderRadius: 12, opacity: podeRegistrar ? 1 : .55 }} onClick=${salvar}><${Ic} n="save" s=${16}/>${isEdit ? 'Salvar alterações' : `Registrar como ${stStat.l}`}</button>`
      }
    </div>`}
  </div>`;
}


/* ══════════════════════════════════════
   PDFS — geração segura local
══════════════════════════════════════ */
function getJsPDF() {
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDF) throw new Error('Biblioteca jsPDF não carregada');
  return jsPDF;
}
function pdfHeader(doc, titulo, subtitulo='') {
  doc.setFillColor(245,149,0); doc.rect(0,0,210,24,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont(undefined,'bold'); doc.text('NEXUS — Grupo Ilha', 14, 10);
  doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.text(titulo, 14, 18);
  doc.setTextColor(17,24,39); doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.text(titulo, 14, 34);
  if (subtitulo) { doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(107,114,128); doc.text(String(subtitulo), 14, 40); }
}
function pdfTable(doc, head, body, startY=48) {
  if (doc.autoTable) {
    doc.autoTable({ startY, head:[head], body, styles:{ fontSize:8, cellPadding:2 }, headStyles:{ fillColor:[245,149,0], textColor:255 }, alternateRowStyles:{ fillColor:[249,250,251] }, margin:{ left:14, right:14 } });
  } else {
    let y=startY; doc.setFontSize(8); doc.setFont(undefined,'bold'); doc.text(head.join(' | '),14,y); y+=6; doc.setFont(undefined,'normal');
    body.forEach(r=>{ if(y>280){doc.addPage(); y=18;} doc.text(r.map(x=>String(x??'')).join(' | ').slice(0,115),14,y); y+=5; });
  }
}
function pdfFooter(doc) { const p=doc.internal.getNumberOfPages(); for(let i=1;i<=p;i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(156,163,175); doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')} · Página ${i}/${p}`,14,290); } }
function savePdf(doc, name) { pdfFooter(doc); doc.save(name.replace(/[\\/:*?"<>|]+/g,'_') + '.pdf'); }
function pdfPedido(p) {
  const Doc=getJsPDF(); const doc=new Doc({ orientation:'p', unit:'mm', format:'a4' });
  pdfHeader(doc,'Pedido',`${p.origem || ''} · ${wLbl(p.semana)} · ${fDate(p.data || p.criadoEm)} · Status: ${p.status || ''}`);
  if (p.responsavel) { doc.setFontSize(9); doc.setTextColor(107,114,128); doc.text(`Responsável: ${p.responsavel}`,14,45); }
  pdfTable(doc,['Item','Categoria','Qtd. solicitada','Unid.'],(p.itens||[]).map(i=>[i.nome||'',i.cat||'',i.qtd??'',i.unit||'']), p.responsavel ? 52 : 48);
  savePdf(doc,`NEXUS_Pedido_${p.origem||''}_${p.semana||''}`);
}
function pdfRecebimento(p) {
  const Doc=getJsPDF(); const doc=new Doc({ orientation:'p', unit:'mm', format:'a4' });
  const rec=p.recebimento || {};
  pdfHeader(doc,'Recebimento',`${p.origem || ''} · ${wLbl(p.semana)} · ${fDate(rec.finalizadoEm || rec.data || p.data || p.criadoEm)}`);

  // A observação escrita na tela de recebimento fica salva em rec.observacoes.
  // Antes, o PDF ignorava esse campo e mostrava uma coluna "Justificativa" vazia.
  // Agora o PDF imprime sempre as observações gerais do recebimento abaixo da tabela.
  const itensPdf = (rec.itens || p.itens || []).map(i => {
    const sol = Number(i.qtd || 0);
    const ent = Number((i.qtdRecebida ?? i.qtd) || 0);
    return [i.nome || '', sol, ent, ent - sol];
  });

  pdfTable(doc, ['Item','Qtd. solicitada','Qtd. recebida','Diferença'], itensPdf, 48);

  let y = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : 48 + itensPdf.length * 6 + 10) + 10;
  if (y > 250) { doc.addPage(); y = 20; }

  const obsTxt = String(rec.observacoes || p.observacoes || '').trim() || 'Sem observações registradas.';
  doc.setDrawColor(229,231,235);
  doc.setFillColor(249,250,251);
  doc.roundedRect(14, y - 5, 182, 32, 3, 3, 'FD');
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(17,24,39);
  doc.text('Observações do recebimento', 18, y);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(17,24,39);
  const obsLines = doc.splitTextToSize(obsTxt, 172);
  doc.text(obsLines, 18, y + 7);

  savePdf(doc,`NEXUS_Recebimento_${p.origem||''}_${p.semana||''}`);
}
function pdfOrcamento(o) {
  const Doc=getJsPDF(); const doc=new Doc({ orientation:'p', unit:'mm', format:'a4' });
  pdfHeader(doc,'Orçamento',`${o.origem || ''} · ${wLbl(o.semana)} · Total: ${fMoeda(o.total || 0)} · Status: ${o.status || ''}`);
  pdfTable(doc,['Item','Categoria','Qtd.','Preço unit.','Subtotal'],(o.itens||[]).map(i=>[i.nome||'',i.cat||'',i.qtd??'',fMoeda(i.precoUnit||0),fMoeda((Number(i.qtd||0)*Number(i.precoUnit||0)))]),48);
  savePdf(doc,`NEXUS_Orcamento_${o.origem||''}_${o.semana||''}`);
}
// ══════════════════════════════════════
//   PDF · RNC (Registro de Não Conformidade)
// ══════════════════════════════════════

let _rncLogoCache = undefined;
function loadRncLogo() {
  if (_rncLogoCache !== undefined) return Promise.resolve(_rncLogoCache);
  const sources = ['logo-rnc-white.png', 'logo-ilha-clean.png', 'logo-ilha.png'];
  const tryLoad = (idx) => new Promise(resolve => {
    if (idx >= sources.length) { _rncLogoCache = null; return resolve(null); }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        _rncLogoCache = { data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
        resolve(_rncLogoCache);
      } catch (e) { resolve(tryLoad(idx + 1)); }
    };
    img.onerror = () => resolve(tryLoad(idx + 1));
    img.src = sources[idx];
  });
  return tryLoad(0);
}

async function pdfRnc(r) {
  const logo = await loadRncLogo();
  const Doc = getJsPDF();
  const doc = new Doc({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, M = 13, CW = pageW - M * 2;
  const footerY = pageH - 14;
  const contentBottom = footerY - 7;

  const OR = [245, 149, 0];
  const OR_D = [190, 111, 0];
  const OR_BG = [255, 249, 240];
  const INK = [24, 24, 27];
  const S1 = [82, 82, 91];
  const S2 = [113, 113, 122];
  const S3 = [161, 161, 170];
  const BD = [226, 226, 232];
  const BG = [249, 250, 251];
  const RD = [220, 38, 38];
  const RD_BG = [254, 242, 242];
  const AM = [217, 119, 6];
  const AM_BG = [255, 251, 235];
  const GR = [22, 163, 74];
  const GR_BG = [240, 253, 244];

  const statusMeta = {
    aberta: { label: 'ABERTA', detail: 'Aguardando retorno do fornecedor', color: RD, fill: RD_BG },
    analise: { label: 'EM ACOMPANHAMENTO', detail: 'Reposição, crédito ou correção em andamento', color: AM, fill: AM_BG },
    resolvida: { label: 'CONCLUÍDA', detail: 'Providência efetivada', color: GR, fill: GR_BG },
    cancelada: { label: 'CANCELADA', detail: 'Registro encerrado sem prosseguimento', color: S2, fill: BG },
  }[r.status] || { label: String(r.status || 'SEM STATUS').toUpperCase(), detail: '', color: S2, fill: BG };

  const numStr = r.numero || '—';
  const origemLabel = r.origem === 'CD'
    ? 'CD · Centro de Distribuição'
    : r.origem === 'CP'
      ? 'CP · Cozinha de Produção'
      : (r.origem || '—');

  const cleanValue = (value, fallback = '—') => {
    if (value == null) return fallback;
    const txt = String(value).trim();
    if (!txt) return fallback;
    if (/^(sem|não|nao)/i.test(txt)) return fallback;
    return txt;
  };
  const normalize = (value, fallback = '—') => cleanValue(value, fallback);
  const nfTxt = normalize(r.notaFiscal, 'Não informada');
  const loteTxt = normalize(r.lote, 'Não informado');
  const tempTxt = r.temperatura == null || String(r.temperatura).trim() === '' ? '—' : `${r.temperatura} °C`;
  const qtdAfectada = r.quantidade ? `${r.quantidade} ${r.unidade || ''}` : '—';
  const fabricacaoTxt = r.fabricacao ? fDate(r.fabricacao) : '—';
  const validadeTxt = r.validade ? fDate(r.validade) : '—';
  const impactoTxt = `${r.gravidade || '—'} · ${fMoeda(r.impactoFinanceiro || 0)}`;
  const quantidadeAceita = Math.max(0, Number(r.qtdRecebida || 0) - Number(r.qtdRecusada || 0));
  const tipoTxt = (r.tipoCustom && r.tipo === 'Outro (descrever)') ? r.tipoCustom : (r.tipo || 'Não informado');

  let y = 33;

  const newPage = (context = 'Continuação do registro') => {
    doc.addPage();
    drawHeader(context);
    y = 33;
  };
  const ensureSpace = (h, context = 'Continuação do registro') => {
    if (y + h > contentBottom) newPage(context);
  };

  function drawHeader(context = 'Documento de ocorrência e acompanhamento') {
    doc.setFillColor(255,255,255);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setFillColor(...OR);
    doc.rect(0, 0, pageW, 3, 'F');

    const logoBox = { x: M, y: 7.5, w: 24, h: 14 };
    doc.setFillColor(...OR);
    doc.roundedRect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, 2.3, 2.3, 'F');
    if (logo && logo.data) {
      const pad = 1.8;
      const maxW = logoBox.w - pad * 2;
      const maxH = logoBox.h - pad * 2;
      const ratio = logo.w && logo.h ? logo.w / logo.h : 1.7;
      let w = maxW, h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      const lx = logoBox.x + (logoBox.w - w) / 2;
      const ly = logoBox.y + (logoBox.h - h) / 2;
      try { doc.addImage(logo.data, 'PNG', lx, ly, w, h); } catch (e) {}
    }

    const titleX = M + 29;
    const titleMaxW = 96;
    let titleSize = 12.6;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(titleSize);
    while (doc.getTextWidth('REGISTRO DE NÃO CONFORMIDADE') > titleMaxW && titleSize > 10.5) {
      titleSize -= 0.3;
      doc.setFontSize(titleSize);
    }
    doc.setTextColor(...INK);
    doc.text('REGISTRO DE NÃO CONFORMIDADE', titleX, 13);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...S2);
    doc.text(context, titleX, 17.8);
    doc.text('Grupo Ilha · Gestão Operacional NEXUS', titleX, 21.9);

    const boxW = 50, boxH = 15, boxX = pageW - M - boxW, boxY = 7;
    doc.setFillColor(255,255,255);
    doc.setDrawColor(...BD);
    doc.setLineWidth(0.25);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2.2, 2.2, 'FD');
    doc.setTextColor(...S2);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(5.8);
    doc.text('DOCUMENTO', boxX + 4, boxY + 4.2);
    doc.setTextColor(...INK);
    doc.setFontSize(9.1);
    doc.text(String(numStr), boxX + 4, boxY + 8.9);
    doc.setFillColor(...statusMeta.fill);
    doc.setDrawColor(...statusMeta.color);
    doc.roundedRect(boxX + 4, boxY + 10, boxW - 8, 3.7, 1.8, 1.8, 'FD');
    doc.setTextColor(...statusMeta.color);
    doc.setFontSize(statusMeta.label.length > 16 ? 5.2 : 6.2);
    doc.text(statusMeta.label, boxX + boxW / 2, boxY + 12.7, { align: 'center' });

    doc.setDrawColor(...BD);
    doc.line(M, 26, pageW - M, 26);
  }

  function sectionTitle(title) {
    ensureSpace(7);
    doc.setFillColor(...OR);
    doc.roundedRect(M, y - 3.2, 1.8, 6, 0.8, 0.8, 'F');
    doc.setTextColor(...INK);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(9.8);
    doc.text(String(title), M + 4.5, y + 0.1);
    doc.setDrawColor(...BD);
    doc.setLineWidth(0.2);
    const lineStart = Math.min(pageW - M - 5, M + 4.5 + doc.getTextWidth(String(title)) + 4);
    doc.line(lineStart, y - 0.2, pageW - M, y - 0.2);
    y += 4.2;
  }

  function drawGrid(fields, cols = 2, options = {}) {
    const colW = CW / cols;
    const rows = [];
    for (let i = 0; i < fields.length; i += cols) rows.push(fields.slice(i, i + cols));
    const labelSize = options.labelSize || 5.5;
    const valueSize = options.valueSize || 8.2;
    const basePad = options.basePad || 4.2;
    const rowHeights = rows.map(row => {
      return Math.max(options.minRowH || 11, ...row.map(item => {
        const text = cleanValue(item[1], '—');
        const lines = doc.splitTextToSize(text, colW - 10).slice(0, options.maxLines || 3);
        return 6.8 + lines.length * 3.3;
      }));
    });
    const totalH = basePad + rowHeights.reduce((a,b)=>a+b,0);
    ensureSpace(totalH + 3.2, options.context || 'Continuação do registro');
    doc.setFillColor(...(options.fill || [255,255,255]));
    doc.setDrawColor(...BD);
    doc.setLineWidth(0.22);
    doc.roundedRect(M, y, CW, totalH, 1.8, 1.8, 'FD');
    let yy = y + 4.2;
    rows.forEach((row, ridx) => {
      row.forEach((item, cidx) => {
        const x = M + cidx * colW + 4.3;
        doc.setTextColor(...S2);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(labelSize);
        doc.text(String(item[0]).toUpperCase(), x, yy);
        doc.setTextColor(...(item[2] || INK));
        doc.setFont(undefined, item[3] ? 'bold' : 'normal');
        doc.setFontSize(item[4] || valueSize);
        const lines = doc.splitTextToSize(cleanValue(item[1], '—'), colW - 10).slice(0, options.maxLines || 3);
        doc.text(lines, x, yy + 3.5);
      });
      yy += rowHeights[ridx];
      if (ridx < rows.length - 1) {
        doc.setDrawColor(...BD);
        doc.line(M + 3, yy - 2.3, M + CW - 3, yy - 2.3);
      }
    });
    y += totalH + 3.2;
  }

  function drawFullField(label, value, options = {}) {
    const lines = doc.splitTextToSize(cleanValue(value, '—'), CW - 12);
    const h = Math.max(options.minH || 12.5, 8.3 + lines.length * (options.lineH || 3.6));
    ensureSpace(h + 3.2, options.context || 'Continuação do registro');
    doc.setFillColor(...(options.fill || [255,255,255]));
    doc.setDrawColor(...(options.border || BD));
    doc.setLineWidth(0.22);
    doc.roundedRect(M, y, CW, h, 1.8, 1.8, 'FD');
    if (options.accent) {
      doc.setFillColor(...options.accent);
      doc.roundedRect(M, y, 1.8, h, 0.8, 0.8, 'F');
    }
    doc.setTextColor(...(options.labelColor || S2));
    doc.setFont(undefined, 'bold');
    doc.setFontSize(5.8);
    doc.text(String(label).toUpperCase(), M + 5.2, y + 4.6);
    doc.setTextColor(...(options.textColor || INK));
    doc.setFont(undefined, options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size || 8.7);
    doc.text(lines, M + 5.2, y + 8.2);
    y += h + 3.2;
  }

  function drawBadge(text, color, fill) {
    const w = Math.min(CW, doc.getTextWidth(text) + 12);
    ensureSpace(8, 'Continuação do registro');
    doc.setFillColor(...fill);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.22);
    doc.roundedRect(M, y, w, 6.5, 3.1, 3.1, 'FD');
    doc.setTextColor(...color);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(6.8);
    doc.text(String(text), M + 4.7, y + 4.3);
    y += 8.4;
  }

  function drawStatusBox(label, text, color, fill) {
    const lines = doc.splitTextToSize(text, CW - 14);
    const h = Math.max(11.5, 7 + lines.length * 3.4);
    ensureSpace(h + 3.2, 'Continuação do acompanhamento');
    doc.setFillColor(...fill);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.22);
    doc.roundedRect(M, y, CW, h, 1.8, 1.8, 'FD');
    doc.setFillColor(...color);
    doc.roundedRect(M, y, 1.8, h, 0.8, 0.8, 'F');
    doc.setTextColor(...S2);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(5.8);
    doc.text(String(label).toUpperCase(), M + 5.2, y + 4.6);
    doc.setTextColor(...INK);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(8.4);
    doc.text(lines, M + 5.2, y + 8.4);
    y += h + 3.2;
  }

  function drawSignatures() {
    const sigH = 17.5, gap = 4.5, sigW = (CW - gap) / 2;
    ensureSpace(sigH + 3.2, 'Validação do registro');
    const boxes = [
      { x: M, label: 'Responsável pelo registro', value: cleanValue(r.responsavel, '—') },
      { x: M + sigW + gap, label: 'Ciência da gestão', value: '' },
    ];
    boxes.forEach(b => {
      doc.setFillColor(255,255,255);
      doc.setDrawColor(...BD);
      doc.setLineWidth(0.22);
      doc.roundedRect(b.x, y, sigW, sigH, 1.8, 1.8, 'FD');
      doc.setLineDashPattern([1.1, 1.1], 0);
      doc.line(b.x + 6, y + 9.4, b.x + sigW - 6, y + 9.4);
      doc.setLineDashPattern([], 0);
      if (b.x === M && r.assinatura) {
        try { doc.addImage(r.assinatura, 'PNG', b.x + 4.5, y + 1.5, sigW - 9, 7.2); } catch(e) {}
      }
      doc.setTextColor(...S2);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(5.6);
      doc.text(String(b.label).toUpperCase(), b.x + 4.5, y + 12.6);
      if (b.value) {
        doc.setTextColor(...INK);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7.8);
        doc.text(doc.splitTextToSize(b.value, sigW - 9).slice(0,1), b.x + 4.5, y + 15.4);
      }
    });
    y += sigH + 3.2;
  }

  drawHeader();

  sectionTitle('Identificação');
  drawGrid([
    ['Origem do produto', origemLabel, INK, true],
    ['Setor de origem', cleanValue(r.setor, '—'), INK, true],
    ['Data da ocorrência', fDate(r.data) || '—'],
    ['Responsável pelo registro', cleanValue(r.responsavel, '—')],
  ], 2, { minRowH: 10.5, basePad: 4.1 });

  sectionTitle('Produto e rastreabilidade');
  drawFullField('Produto / item afetado', cleanValue(r.produto, '—'), { minH: 11.8, bold: true, size: 9.5 });
  drawGrid([
    ['Fornecedor', cleanValue(r.fornecedor, '—')],
    ['Quantidade afetada', qtdAfectada],
    ['Nota fiscal', nfTxt],
    ['Lote', loteTxt],
    ['Fabricação', fabricacaoTxt],
    ['Validade', validadeTxt],
    ['Temperatura', tempTxt],
    ['Gravidade / impacto', impactoTxt],
  ], 2, { minRowH: 10.8, maxLines: 2, basePad: 4.1 });
  drawGrid([
    ['Pedida', `${Number(r.qtdPedida || 0)} ${r.unidade || ''}`],
    ['Recebida', `${Number(r.qtdRecebida || 0)} ${r.unidade || ''}`],
    ['Recusada', `${Number(r.qtdRecusada || 0)} ${r.unidade || ''}`],
    ['Aceita', `${quantidadeAceita} ${r.unidade || ''}`],
  ], 4, { minRowH: 9.8, valueSize: 8.2, labelSize: 5.2, basePad: 4, maxLines: 1, fill: BG });

  sectionTitle('Não conformidade identificada');
  drawBadge(tipoTxt, RD, RD_BG);
  drawFullField('Descrição da ocorrência', cleanValue(r.descricao, 'Sem descrição registrada.'), { accent: RD, minH: 13.8 });

  sectionTitle('Providência solicitada ao fornecedor');
  drawFullField('Solicitação', cleanValue(r.acao, '—'), { accent: OR, fill: OR_BG, border: OR, textColor: OR_D, bold: true, size: 9.3, minH: 12.5 });
  if (String(r.obsAcao || '').trim()) {
    drawFullField('Detalhes da solicitação', r.obsAcao, { minH: 12.5 });
  }

  sectionTitle('Acompanhamento');
  if (String(r.respostaFornecedor || '').trim()) {
    drawFullField('Retorno do fornecedor', r.respostaFornecedor, { minH: 12.5 });
  } else {
    drawStatusBox('Situação atual', 'Aguardando resposta do fornecedor.', OR, BG);
  }
  if (String(r.medidaRealizada || '').trim()) {
    const medidaPdf = r.status === 'resolvida' && r.encerradoEm
      ? `${r.medidaRealizada}
Concluída em ${fDateTime(r.encerradoEm)}.`
      : r.medidaRealizada;
    drawFullField('Medida efetivamente realizada', medidaPdf, { accent: GR, fill: GR_BG, border: GR, textColor: [21, 128, 61], minH: 12.8, bold: true });
  } else if (r.status === 'analise') {
    drawStatusBox('Situação atual', 'Resposta recebida. Reposição, crédito ou correção ainda em acompanhamento.', AM, AM_BG);
  } else if (r.status === 'cancelada' && (r.motivoCancelamento || r.obsAcao)) {
    drawStatusBox('Situação atual', `Motivo do cancelamento: ${r.motivoCancelamento || r.obsAcao}`, S1, BG);
  }

  sectionTitle('Validação do registro');
  drawSignatures();

  const fotos = Array.isArray(r.fotos) ? r.fotos : [];
  const medirImg = src => new Promise(resolve => {
    try {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
      im.onerror = () => resolve(null);
      im.src = src;
    } catch (e) { resolve(null); }
  });
  const dims = [];
  for (let i = 0; i < fotos.length; i++) dims[i] = await medirImg(fotos[i]);

  for (let i = 0; i < fotos.length; i++) {
    doc.addPage();
    drawHeader(`Evidência fotográfica ${i + 1} de ${fotos.length}`);
    y = 33;
    sectionTitle(`Evidência fotográfica ${i + 1}`);
    const areaX = M, areaY = y, areaW = CW, areaH = pageH - y - 22;
    doc.setFillColor(255,255,255);
    doc.setDrawColor(...BD);
    doc.setLineWidth(0.22);
    doc.roundedRect(areaX, areaY, areaW, areaH, 1.8, 1.8, 'FD');
    const pad = 7, labelH = 8;
    const maxW = areaW - pad * 2, maxH = areaH - pad * 2 - labelH;
    const d = dims[i];
    let drawW = maxW, drawH = maxH;
    if (d && d.w && d.h) {
      const ratio = d.w / d.h;
      drawH = drawW / ratio;
      if (drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }
    }
    const imgX = areaX + (areaW - drawW) / 2;
    const imgY = areaY + pad + (maxH - drawH) / 2;
    let ok = false;
    for (const format of ['JPEG', 'PNG', 'WEBP']) {
      try { doc.addImage(fotos[i], format, imgX, imgY, drawW, drawH); ok = true; break; } catch (e) {}
    }
    if (!ok) {
      try { doc.addImage(fotos[i], imgX, imgY, drawW, drawH); ok = true; } catch (e) {}
    }
    if (!ok) {
      doc.setTextColor(...S3);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8.6);
      doc.text('Imagem indisponível', areaX + areaW / 2, areaY + areaH / 2, { align: 'center' });
    }
    doc.setTextColor(...S2);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(6.4);
    doc.text(`EVIDÊNCIA ${i + 1}`, areaX + pad, areaY + areaH - 4.6);
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...BD);
    doc.setLineWidth(0.18);
    doc.line(M, footerY, pageW - M, footerY);
    doc.setTextColor(...S3);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(6.4);
    doc.text(`NEXUS · Grupo Ilha · ${numStr}`, M, pageH - 9.1);
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, M, pageH - 5.1);
    doc.text(`Página ${p} de ${totalPages}`, pageW - M, pageH - 9.1, { align: 'right' });
  }

  doc.save(`NEXUS_RNC_${(numStr || r.id || '').replace(/[\/:*?"<>|]+/g, '_')}.pdf`);
}

/* ══════════════════════════════════════
   RELATÓRIOS
══════════════════════════════════════ */
function RelatoriosTab({ toast }) {
  const [secao, setSecao] = useState('pedidos');
  const pedidos = LS.get('pedidos') || [];
  const rncs = LS.get('rncs') || [];
  const orcamentos = LS.get('orcamentos') || [];
  const SECS = [{ id: 'pedidos', l: 'Pedidos' }, { id: 'recebimento', l: 'Recebimento' }, { id: 'rnc', l: 'RNC' }, { id: 'orcamentos', l: 'Orçamentos' }];
  const recebimentos = pedidos.filter(p => p.recebimento);
  return html`<div class="page">
    <div style=${{ marginBottom: 16 }}><h2 style=${{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", margin: 0 }}>Relatórios</h2></div>
    <div class="ptab" style=${{ marginBottom: 16 }}>${SECS.map(s => html`<button key=${s.id} class=${secao === s.id ? 'on' : ''} onClick=${() => setSecao(s.id)}>${s.l}</button>`)}</div>
    ${secao === 'pedidos' && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      ${pedidos.length === 0 && html`<div class="empty"><${Ic} n="orders" s=${32} style=${{ color: 'var(--s3)' }}/><p>Nenhum pedido.</p></div>`}
      ${[...pedidos].sort((a,b)=>new Date(b.criadoEm||0)-new Date(a.criadoEm||0)).map(p => { const st = ST_PED[p.status] || { l: p.status, c: 'bgy' }; return html`
        <div key=${p.id} class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span><span class="badge bor">${p.origem}</span></div><div style=${{ fontWeight: 700, fontSize: 14 }}>${wLbl(p.semana)}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${(p.itens||[]).length} itens · ${fDate(p.criadoEm)}</div></div>
          <button class="btn bs bsm" onClick=${() => { try { pdfPedido(p); toast.show('PDF gerado'); } catch(e) { toast.show('Erro'); } }}><${Ic} n="pdf" s=${14}/>PDF</button>
        </div>`; })}
    </div>`}
    ${secao === 'recebimento' && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      ${recebimentos.length === 0 && html`<div class="empty"><${Ic} n="recv" s=${32} style=${{ color: 'var(--s3)' }}/><p>Nenhum recebimento.</p></div>`}
      ${recebimentos.sort((a,b)=>new Date(b.recebimento?.finalizadoEm||0)-new Date(a.recebimento?.finalizadoEm||0)).map(p => { const st = ST_PED[p.status] || { l: p.status, c: 'bgy' }; return html`
        <div key=${p.id} class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span><span class="badge bor">${p.origem}</span></div><div style=${{ fontWeight: 700, fontSize: 14 }}>${wLbl(p.semana)}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${p.recebimento?.responsavel||'—'} · ${fDate(p.recebimento?.finalizadoEm)}</div></div>
          <button class="btn bs bsm" onClick=${() => { try { pdfRecebimento(p); toast.show('PDF gerado'); } catch(e) { toast.show('Erro'); } }}><${Ic} n="pdf" s=${14}/>PDF</button>
        </div>`; })}
    </div>`}
    ${secao === 'rnc' && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      ${rncs.length === 0 && html`<div class="empty"><${Ic} n="rnc" s=${32} style=${{ color: 'var(--s3)' }}/><p>Nenhuma RNC.</p></div>`}
      ${[...rncs].sort((a,b)=>new Date(b.criadoEm||0)-new Date(a.criadoEm||0)).map(r => { const st = ST_RNC[r.status] || { l: r.status, c: 'bgy' }; return html`
        <div key=${r.id} class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span>${r.origem&&html`<span class="badge bor">${r.origem}</span>`}</div><div style=${{ fontWeight: 700, fontSize: 14 }}>${r.numero}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${r.produto||'—'} · ${fDate(r.data)}</div></div>
          <button class="btn bs bsm" onClick=${async () => { try { await pdfRnc(r); toast.show('PDF gerado'); } catch(e) { toast.show('Erro'); } }}><${Ic} n="pdf" s=${14}/>PDF</button>
        </div>`; })}
    </div>`}
    ${secao === 'orcamentos' && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      ${orcamentos.length === 0 && html`<div class="empty"><${Ic} n="money" s=${32} style=${{ color: 'var(--s3)' }}/><p>Nenhum orçamento.</p></div>`}
      ${orcamentos.map(o => html`
        <div key=${o.id} class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${o.status==='autorizado'?'bgr2':'bam'}`}>${o.status}</span><span class="badge bor">${o.origem}</span></div><div style=${{ fontWeight: 700, fontSize: 14 }}>${wLbl(o.semana)}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${fMoeda(o.total||0)}</div></div>
          <button class="btn bs bsm" onClick=${() => { try { pdfOrcamento(o); toast.show('PDF gerado'); } catch(e) { toast.show('Erro'); } }}><${Ic} n="pdf" s=${14}/>PDF</button>
        </div>`)}
    </div>`}
  </div>`;
}

/* ══════════════════════════════════════
   ANÁLISE
══════════════════════════════════════ */

function AnaliseTab() {
  const pedidos = LS.get('pedidos') || [];
  const rncs = LS.get('rncs') || [];
  const tPrecos = LS.get('tabPrecos') || {};
  const cat = useMemo(getCatalog, []);
  const allItems = useMemo(() => flatCatalog(cat), [cat]);
  const [view, setView] = useState('compras');

  const semanas = useMemo(() => [...new Set([
    ...pedidos.map(p => p.semana).filter(Boolean),
    ...rncs.map(r => dateToWeek(r.data)).filter(Boolean),
    ...Object.keys(tPrecos || {})
  ])].sort(), [pedidos, rncs, tPrecos]);
  const [semIni, setSemIni] = useState(semanas.length > 6 ? semanas[semanas.length - 6] : (semanas[0] || ''));
  const [semFim, setSemFim] = useState(semanas[semanas.length - 1] || '');
  const [origem, setOrigem] = useState('TODOS');
  const [categoria, setCategoria] = useState('TODAS');
  const [buscaItem, setBuscaItem] = useState('');
  const [itemSel, setItemSel] = useState('');

  const inRange = w => (!semIni || w >= semIni) && (!semFim || w <= semFim);
  const origemOk = o => origem === 'TODOS' || o === origem;
  const meta = nome => allItems.find(i => i.name === nome) || {};
  const categorias = useMemo(() => [...new Set(allItems.filter(i => origem === 'TODOS' || i.orig === origem).map(i => i.cat))].sort(), [allItems, origem]);
  const itemOk = nome => { const m = meta(nome); return origemOk(m.orig) && (categoria === 'TODAS' || !categoria || m.cat === categoria); };
  const ultimoPreco = (nome, semanaRef = '') => {
    const ws = Object.keys(tPrecos || {}).filter(w => !semanaRef || w <= semanaRef).sort().reverse();
    for (const w of ws) if (tPrecos[w]?.[nome]) return parseFloat(tPrecos[w][nome]);
    return 0;
  };

  // ─── COMPRAS: pedido x recebido por item ───
  const pedidosPeriodo = useMemo(() => pedidos.filter(p => p.semana && inRange(p.semana) && origemOk(p.origem)), [pedidos, semIni, semFim, origem]);
  const linhasCompra = useMemo(() => {
    const linhas = [];
    pedidosPeriodo.forEach(p => {
      const rec = p.recebimento?.itens || [];
      (p.itens || []).forEach(i => {
        if (!itemOk(i.nome)) return;
        const r = rec.find(x => x.nome === i.nome);
        const pedido = parseFloat(i.qtd || 0);
        const recebido = p.recebimento ? parseFloat(r?.qtdRecebida ?? 0) : null; // null = ainda não recebido
        const preco = ultimoPreco(i.nome, p.semana);
        linhas.push({
          nome: i.nome, origem: p.origem, categoria: meta(i.nome).cat || i.cat || 'Geral',
          semana: p.semana, pedido, recebido, preco,
          custoPedido: pedido * preco,
          custoRecebido: (recebido == null ? pedido : recebido) * preco,
          divergente: recebido != null && recebido !== pedido,
          statusPed: p.status,
        });
      });
    });
    return linhas;
  }, [pedidosPeriodo, categoria, origem]);

  const rankingCompra = useMemo(() => {
    const m = {};
    linhasCompra.forEach(c => {
      if (!m[c.nome]) m[c.nome] = { nome: c.nome, origem: meta(c.nome).orig || c.origem, categoria: c.categoria, pedido: 0, recebido: 0, custo: 0, semanas: new Set(), divs: 0 };
      m[c.nome].pedido += c.pedido;
      m[c.nome].recebido += (c.recebido == null ? 0 : c.recebido);
      m[c.nome].custo += c.custoRecebido;
      m[c.nome].semanas.add(c.semana);
      if (c.divergente) m[c.nome].divs += 1;
    });
    return Object.values(m).map(x => ({ ...x, semanas: x.semanas.size })).sort((a, b) => b.custo - a.custo);
  }, [linhasCompra]);

  const comprasPorSemana = useMemo(() => {
    const m = {};
    semanas.filter(inRange).forEach(w => m[w] = { semana: w, label: w.replace(/\d{4}-W/, 'W'), pedidoCusto: 0, recebidoCusto: 0, itens: 0, divs: 0 });
    linhasCompra.forEach(c => {
      if (!m[c.semana]) m[c.semana] = { semana: c.semana, label: c.semana.replace(/\d{4}-W/, 'W'), pedidoCusto: 0, recebidoCusto: 0, itens: 0, divs: 0 };
      m[c.semana].pedidoCusto += c.custoPedido;
      m[c.semana].recebidoCusto += c.custoRecebido;
      m[c.semana].itens += 1;
      if (c.divergente) m[c.semana].divs += 1;
    });
    return Object.values(m).sort((a, b) => a.semana.localeCompare(b.semana));
  }, [semanas, semIni, semFim, linhasCompra]);

  const totalPedido = linhasCompra.reduce((s, c) => s + c.custoPedido, 0);
  const totalRecebido = linhasCompra.reduce((s, c) => s + c.custoRecebido, 0);
  const totalDivergencias = linhasCompra.filter(c => c.divergente).length;
  const totalRecebidosItens = linhasCompra.filter(c => c.recebido != null).length;
  const taxaDivergencia = totalRecebidosItens ? (totalDivergencias / totalRecebidosItens * 100) : 0;

  // ─── RNC: ocorrências por insumo / tipo / fornecedor / origem ───
  const rncsPeriodo = useMemo(() => rncs.filter(r => { const w = dateToWeek(r.data); return inRange(w) && origemOk(r.origem); }), [rncs, semIni, semFim, origem]);
  const rncPorItem = useMemo(() => {
    const m = {};
    rncsPeriodo.forEach(r => {
      const nome = (r.produto || '—').trim();
      if (categoria !== 'TODAS' && meta(nome).cat && meta(nome).cat !== categoria) return;
      if (!m[nome]) m[nome] = { nome, qtd: 0, fornecedores: new Set(), tipos: {}, origens: new Set(), abertas: 0, resolvidas: 0 };
      m[nome].qtd += 1;
      if (r.fornecedor) m[nome].fornecedores.add(r.fornecedor);
      if (r.origem) m[nome].origens.add(r.origem);
      const t = (r.tipoCustom && r.tipo === 'Outro (descrever)') ? r.tipoCustom : (r.tipo || 'Não especificado');
      m[nome].tipos[t] = (m[nome].tipos[t] || 0) + 1;
      if (r.status === 'aberta' || r.status === 'analise') m[nome].abertas += 1;
      if (r.status === 'resolvida') m[nome].resolvidas += 1;
    });
    return Object.values(m).map(x => ({ ...x, fornecedores: [...x.fornecedores], origens: [...x.origens], tipoTop: Object.entries(x.tipos).sort((a, b) => b[1] - a[1])[0]?.[0] || '—' })).sort((a, b) => b.qtd - a.qtd);
  }, [rncsPeriodo, categoria]);
  const rncPorTipo = useMemo(() => {
    const m = {};
    rncsPeriodo.forEach(r => { const t = (r.tipoCustom && r.tipo === 'Outro (descrever)') ? r.tipoCustom : (r.tipo || 'Não especificado'); m[t] = (m[t] || 0) + 1; });
    return Object.entries(m).map(([label, qtd]) => ({ label, qtd })).sort((a, b) => b.qtd - a.qtd);
  }, [rncsPeriodo]);
  const rncPorFornecedor = useMemo(() => {
    const m = {};
    rncsPeriodo.forEach(r => { const f = (r.fornecedor || 'Não informado').trim(); m[f] = (m[f] || 0) + 1; });
    return Object.entries(m).map(([label, qtd]) => ({ label, qtd })).sort((a, b) => b.qtd - a.qtd);
  }, [rncsPeriodo]);
  const rncPorSemana = useMemo(() => {
    const m = {};
    semanas.filter(inRange).forEach(w => m[w] = { semana: w, label: w.replace(/\d{4}-W/, 'W'), qtd: 0 });
    rncsPeriodo.forEach(r => { const w = dateToWeek(r.data); if (!m[w]) m[w] = { semana: w, label: w.replace(/\d{4}-W/, 'W'), qtd: 0 }; m[w].qtd += 1; });
    return Object.values(m).sort((a, b) => a.semana.localeCompare(b.semana));
  }, [semanas, semIni, semFim, rncsPeriodo]);
  const totalRnc = rncsPeriodo.length;
  const rncAbertas = rncsPeriodo.filter(r => r.status === 'aberta' || r.status === 'analise').length;
  const insumoCritico = rncPorItem[0];

  // ─── HISTÓRICO POR ITEM ───
  const itensLista = useMemo(() => allItems.filter(i => origemOk(i.orig) && (categoria === 'TODAS' || i.cat === categoria)).filter(i => !buscaItem || `${i.name} ${i.cat}`.toLowerCase().includes(buscaItem.toLowerCase())).slice(0, 40), [allItems, origem, categoria, buscaItem]);
  const historicoItem = useMemo(() => {
    if (!itemSel) return [];
    const linhas = [];
    pedidos.forEach(p => {
      if (!p.semana || !inRange(p.semana) || !origemOk(p.origem)) return;
      (p.itens || []).filter(i => i.nome === itemSel).forEach(i => {
        const r = (p.recebimento?.itens || []).find(x => x.nome === itemSel);
        const rec = p.recebimento ? (r?.qtdRecebida ?? 0) : null;
        linhas.push({ data: p.criadoEm, tipo: 'Pedido', origem: p.origem, texto: `Pedido: ${i.qtd} ${i.unit || meta(itemSel).unit || ''}${rec != null ? ` · Recebido: ${rec}${rec != i.qtd ? ' ⚠ divergência' : ''}` : ' · aguardando recebimento'}`, semana: p.semana });
      });
    });
    rncs.forEach(r => {
      if ((r.produto || '').trim() !== itemSel) return;
      const w = dateToWeek(r.data);
      if (!inRange(w) || !origemOk(r.origem)) return;
      const t = (r.tipoCustom && r.tipo === 'Outro (descrever)') ? r.tipoCustom : (r.tipo || '');
      linhas.push({ data: r.data, tipo: 'RNC', origem: r.origem, texto: `${r.numero} · ${t}${r.fornecedor ? ' · ' + r.fornecedor : ''}`, semana: w });
    });
    return linhas.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
  }, [itemSel, pedidos, rncs, semIni, semFim, origem]);
  const rncItemSel = historicoItem.filter(h => h.tipo === 'RNC').length;

  const fmtK = v => v >= 1000 ? 'R$' + (v / 1000).toFixed(1) + 'k' : 'R$' + Math.round(v || 0);

  function Kpi({ label, value, sub, color }) {
    return html`<div class="card" style=${{ padding: 16 }}>
      <div style=${{ fontSize: 10, fontWeight: 800, color: 'var(--s3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>${label}</div>
      <div style=${{ fontSize: 24, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", color: color || 'var(--ink)' }}>${value}</div>
      ${sub && html`<div style=${{ fontSize: 12, color: 'var(--s2)', marginTop: 4 }}>${sub}</div>`}
    </div>`;
  }
  function BarList({ rows, valueKey = 'qtd', money = false, maxRows = 10, color = 'var(--or)' }) {
    const data = rows.slice(0, maxRows);
    const max = Math.max(...data.map(r => Number(r[valueKey] || 0)), 1);
    return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${data.map((r, idx) => html`<div key=${r.nome || r.label || idx}><div class="row" style=${{ justifyContent: 'space-between', gap: 10, marginBottom: 4 }}><div style=${{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${idx + 1}. ${r.nome || r.label}</div><div style=${{ fontSize: 12, fontWeight: 800, color, flexShrink: 0 }}>${money ? fMoeda(r[valueKey] || 0) : Number(r[valueKey] || 0).toLocaleString('pt-BR')}</div></div><div style=${{ height: 8, background: 'var(--bd2)', borderRadius: 20, overflow: 'hidden' }}><div style=${{ width: Math.max(4, (Number(r[valueKey] || 0) / max) * 100) + '%', height: '100%', background: color, borderRadius: 20 }}></div></div></div>`)}</div>`;
  }
  function DuoChart({ rows, kA, kB, labelA, labelB, colorA = 'var(--or)', colorB = '#2563EB' }) {
    const max = Math.max(...rows.map(r => Math.max(r[kA], r[kB])), 1);
    return html`<div><div class="row" style=${{ gap: 16, marginBottom: 12, fontSize: 12 }}><span class="row" style=${{ gap: 5 }}><span style=${{ width: 12, height: 12, borderRadius: 3, background: colorA, display: 'inline-block' }}></span>${labelA}</span><span class="row" style=${{ gap: 5 }}><span style=${{ width: 12, height: 12, borderRadius: 3, background: colorB, display: 'inline-block' }}></span>${labelB}</span></div>
    <div style=${{ display: 'flex', alignItems: 'end', gap: 10, minHeight: 200, paddingTop: 8 }}>${rows.map(r => html`<div key=${r.semana} style=${{ flex: 1, minWidth: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><div style=${{ height: 160, width: '100%', display: 'flex', alignItems: 'end', gap: 4, justifyContent: 'center' }}><div title=${labelA} style=${{ width: '42%', height: Math.max(4, r[kA] / max * 160) + 'px', background: colorA, borderRadius: '6px 6px 2px 2px' }}></div><div title=${labelB} style=${{ width: '42%', height: Math.max(4, r[kB] / max * 160) + 'px', background: colorB, borderRadius: '6px 6px 2px 2px' }}></div></div><div style=${{ fontSize: 11, fontWeight: 800, color: 'var(--s2)' }}>${r.label}</div></div>`)}</div></div>`;
  }
  function MonoChart({ rows, k = 'qtd', color = 'var(--rd)' }) {
    const max = Math.max(...rows.map(r => r[k]), 1);
    return html`<div style=${{ display: 'flex', alignItems: 'end', gap: 10, minHeight: 180, paddingTop: 8 }}>${rows.map(r => html`<div key=${r.semana} style=${{ flex: 1, minWidth: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><div style=${{ fontSize: 11, fontWeight: 800, color: 'var(--s2)' }}>${r[k] || ''}</div><div style=${{ height: 140, width: '60%', display: 'flex', alignItems: 'end' }}><div style=${{ width: '100%', height: Math.max(3, r[k] / max * 140) + 'px', background: color, borderRadius: '6px 6px 2px 2px' }}></div></div><div style=${{ fontSize: 11, fontWeight: 800, color: 'var(--s2)' }}>${r.label}</div></div>`)}</div>`;
  }

  return html`<div class="page" style=${{ maxWidth: '1440px' }}>
    <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}><div><h2 style=${{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", margin: 0 }}>Análise</h2><p style=${{ fontSize: 13, color: 'var(--s2)', margin: '4px 0 0' }}>Compras (pedido × recebimento) e não conformidades por insumo, fornecedor e período.</p></div></div>

    <div class="card" style=${{ padding: 16, marginBottom: 16 }}><div style=${{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
      <div><label style=${{ fontSize: 10, fontWeight: 800, color: 'var(--s3)', textTransform: 'uppercase' }}>De</label><select class="inp" value=${semIni} onChange=${e => setSemIni(e.target.value)}><option value="">Primeira semana</option>${semanas.map(w => html`<option key=${w} value=${w}>${wLbl(w)}</option>`)}</select></div>
      <div><label style=${{ fontSize: 10, fontWeight: 800, color: 'var(--s3)', textTransform: 'uppercase' }}>Até</label><select class="inp" value=${semFim} onChange=${e => setSemFim(e.target.value)}><option value="">Última semana</option>${semanas.map(w => html`<option key=${w} value=${w}>${wLbl(w)}</option>`)}</select></div>
      <div><label style=${{ fontSize: 10, fontWeight: 800, color: 'var(--s3)', textTransform: 'uppercase' }}>Origem</label><select class="inp" value=${origem} onChange=${e => { setOrigem(e.target.value); setCategoria('TODAS'); }}><option value="TODOS">CD + CP</option><option value="CD">CD</option><option value="CP">CP</option></select></div>
      <div><label style=${{ fontSize: 10, fontWeight: 800, color: 'var(--s3)', textTransform: 'uppercase' }}>Categoria</label><select class="inp" value=${categoria} onChange=${e => setCategoria(e.target.value)}><option value="TODAS">Todas</option>${categorias.map(c => html`<option key=${c} value=${c}>${c}</option>`)}</select></div>
      <button class="btn bs" onClick=${() => { setSemIni(''); setSemFim(''); setOrigem('TODOS'); setCategoria('TODAS'); }}>Limpar filtros</button>
    </div></div>

    <div class="ptab" style=${{ marginBottom: 16 }}>${[{ id: 'compras', l: 'Compras' }, { id: 'rnc', l: 'Não conformidades' }, { id: 'item', l: 'Histórico por insumo' }].map(v => html`<button key=${v.id} class=${view === v.id ? 'on' : ''} onClick=${() => setView(v.id)}>${v.l}</button>`)}</div>

    ${view === 'compras' ? html`<div>
      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <${Kpi} label="Custo pedido" value=${fMoeda(totalPedido)} sub=${`${linhasCompra.length} linhas de pedido`}/>
        <${Kpi} label="Custo recebido" value=${fMoeda(totalRecebido)} sub="valorizado pelo último preço"/>
        <${Kpi} label="Divergências" value=${totalDivergencias} sub=${`${totalRecebidosItens} itens conferidos`} color=${totalDivergencias > 0 ? 'var(--rd)' : 'var(--gr)'}/>
        <${Kpi} label="Taxa de divergência" value=${taxaDivergencia.toFixed(1) + '%'} sub="recebido ≠ pedido" color=${taxaDivergencia > 10 ? 'var(--rd)' : taxaDivergencia > 0 ? 'var(--am)' : 'var(--gr)'}/>
      </div>
      <div style=${{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
        <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Pedido × recebido por semana</div><div style=${{ fontSize: 12, color: 'var(--s2)', marginBottom: 12 }}>Custo em R$ por semana.</div>${comprasPorSemana.length ? html`<${DuoChart} rows=${comprasPorSemana} kA="pedidoCusto" kB="recebidoCusto" labelA="Pedido" labelB="Recebido"/>` : html`<p style=${{ fontSize: 13, color: 'var(--s2)' }}>Sem dados no período.</p>`}</div>
        <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Top insumos comprados</div>${rankingCompra.length ? html`<${BarList} rows=${rankingCompra} valueKey="custo" money=${true} maxRows=${8}/>` : html`<p style=${{ fontSize: 13, color: 'var(--s2)' }}>Sem compras no período.</p>`}</div>
      </div>
      <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Detalhamento por insumo</div><div style=${{ overflowX: 'auto' }}><table style=${{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style=${{ borderBottom: '2px solid var(--bd)' }}>${['Insumo', 'Origem', 'Categoria', 'Pedido', 'Recebido', 'Custo', 'Diverg.', 'Semanas'].map((h, i) => html`<th key=${h} style=${{ textAlign: i < 3 ? 'left' : 'right', padding: '8px 6px', fontSize: 10, textTransform: 'uppercase', color: 'var(--s3)' }}>${h}</th>`)}</tr></thead><tbody>${rankingCompra.map((r, i) => html`<tr key=${r.nome} style=${{ borderBottom: '1px solid var(--bd)', background: i % 2 ? '#FAFAFA' : '#fff' }}><td style=${{ padding: '9px 6px', fontWeight: 700 }}>${r.nome}</td><td style=${{ padding: '9px 6px' }}>${r.origem}</td><td style=${{ padding: '9px 6px' }}>${r.categoria}</td><td style=${{ padding: '9px 6px', textAlign: 'right' }}>${Number(r.pedido.toFixed(2)).toLocaleString('pt-BR')}</td><td style=${{ padding: '9px 6px', textAlign: 'right' }}>${Number(r.recebido.toFixed(2)).toLocaleString('pt-BR')}</td><td style=${{ padding: '9px 6px', textAlign: 'right', fontWeight: 800 }}>${fMoeda(r.custo)}</td><td style=${{ padding: '9px 6px', textAlign: 'right', fontWeight: 800, color: r.divs > 0 ? 'var(--rd)' : 'var(--gr)' }}>${r.divs}</td><td style=${{ padding: '9px 6px', textAlign: 'right' }}>${r.semanas}</td></tr>`)}</tbody></table></div></div>
    </div>` : null}

    ${view === 'rnc' ? html`<div>
      ${insumoCritico && insumoCritico.qtd > 1 ? html`<div class="card" style=${{ padding: 16, marginBottom: 16, background: 'var(--rd3)', border: '1px solid rgba(220,38,38,.2)' }}><div class="row" style=${{ gap: 10 }}><${Ic} n="rnc" s=${20} style=${{ color: 'var(--rd)' }}/><div><div style=${{ fontWeight: 800, fontSize: 15, color: 'var(--rd)' }}>Insumo mais recorrente: ${insumoCritico.nome}</div><div style=${{ fontSize: 13, color: 'var(--s1)', marginTop: 2 }}>${insumoCritico.qtd} ocorrências no período · problema mais comum: ${insumoCritico.tipoTop}${insumoCritico.fornecedores.length ? ' · fornecedor(es): ' + insumoCritico.fornecedores.join(', ') : ''}</div></div></div></div>` : null}
      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <${Kpi} label="Total de RNCs" value=${totalRnc} sub="no período/filtros"/>
        <${Kpi} label="Em aberto" value=${rncAbertas} color=${rncAbertas > 0 ? 'var(--rd)' : 'var(--gr)'} sub="aberta ou em acompanhamento"/>
        <${Kpi} label="Insumos distintos" value=${rncPorItem.length} sub="com ocorrência"/>
        <${Kpi} label="Fornecedores" value=${rncPorFornecedor.filter(f => f.label !== 'Não informado').length} sub="citados nas RNCs"/>
      </div>
      <div style=${{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 12, marginBottom: 12 }}>
        <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Insumos com mais não conformidades</div><div style=${{ fontSize: 12, color: 'var(--s2)', marginBottom: 12 }}>Ranking por número de ocorrências — identifica o insumo problemático recorrente.</div>${rncPorItem.length ? html`<${BarList} rows=${rncPorItem} valueKey="qtd" maxRows=${12} color="var(--rd)"/>` : html`<p style=${{ fontSize: 13, color: 'var(--s2)' }}>Nenhuma RNC no período.</p>`}</div>
        <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Por tipo de problema</div>${rncPorTipo.length ? html`<${BarList} rows=${rncPorTipo} valueKey="qtd" maxRows=${10} color="var(--am)"/>` : html`<p style=${{ fontSize: 13, color: 'var(--s2)' }}>Sem dados.</p>`}</div>
      </div>
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Por fornecedor</div>${rncPorFornecedor.length ? html`<${BarList} rows=${rncPorFornecedor} valueKey="qtd" maxRows=${10} color="#2563EB"/>` : html`<p style=${{ fontSize: 13, color: 'var(--s2)' }}>Sem dados.</p>`}</div>
        <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Evolução por semana</div>${rncPorSemana.length ? html`<${MonoChart} rows=${rncPorSemana} k="qtd" color="var(--rd)"/>` : html`<p style=${{ fontSize: 13, color: 'var(--s2)' }}>Sem dados.</p>`}</div>
      </div>
      <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Detalhamento por insumo</div><div style=${{ overflowX: 'auto' }}><table style=${{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style=${{ borderBottom: '2px solid var(--bd)' }}>${['Insumo', 'Ocorrências', 'Problema mais comum', 'Fornecedor(es)', 'Origem', 'Abertas', 'Concluídas'].map((h, i) => html`<th key=${h} style=${{ textAlign: i === 0 ? 'left' : i === 1 || i > 4 ? 'right' : 'left', padding: '8px 6px', fontSize: 10, textTransform: 'uppercase', color: 'var(--s3)' }}>${h}</th>`)}</tr></thead><tbody>${rncPorItem.map((r, i) => html`<tr key=${r.nome} style=${{ borderBottom: '1px solid var(--bd)', background: i % 2 ? '#FAFAFA' : '#fff' }}><td style=${{ padding: '9px 6px', fontWeight: 700 }}>${r.nome}</td><td style=${{ padding: '9px 6px', textAlign: 'right', fontWeight: 800, color: r.qtd > 2 ? 'var(--rd)' : 'var(--ink)' }}>${r.qtd}</td><td style=${{ padding: '9px 6px' }}>${r.tipoTop}</td><td style=${{ padding: '9px 6px' }}>${r.fornecedores.join(', ') || '—'}</td><td style=${{ padding: '9px 6px' }}>${r.origens.join(', ') || '—'}</td><td style=${{ padding: '9px 6px', textAlign: 'right', color: r.abertas > 0 ? 'var(--rd)' : 'var(--s2)' }}>${r.abertas}</td><td style=${{ padding: '9px 6px', textAlign: 'right', color: 'var(--gr)' }}>${r.resolvidas}</td></tr>`)}</tbody></table></div></div>
    </div>` : null}

    ${view === 'item' ? html`<div style=${{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 12 }}>
      <div class="card" style=${{ padding: 16 }}><div style=${{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Buscar insumo</div><input class="inp" value=${buscaItem} onInput=${e => setBuscaItem(e.target.value)} placeholder="Digite o nome do insumo..." style=${{ marginBottom: 10 }}/><div style=${{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>${itensLista.map(i => html`<button key=${i.name} onClick=${() => setItemSel(i.name)} style=${{ padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${itemSel === i.name ? 'var(--or)' : 'var(--bd)'}`, background: itemSel === i.name ? 'var(--or3)' : '#fff', textAlign: 'left', cursor: 'pointer' }}><div style=${{ fontSize: 13, fontWeight: 700 }}>${i.name}</div><div style=${{ fontSize: 11, color: 'var(--s2)', marginTop: 2 }}>${i.orig} · ${i.cat} · ${i.unit}</div></button>`)}</div></div>
      <div class="card" style=${{ padding: 16 }}>${!itemSel ? html`<div class="empty"><${Ic} n="info" s=${36} style=${{ color: 'var(--s3)' }}/><p>Selecione um insumo para ver o histórico de compras e não conformidades.</p></div>` : html`<div><div style=${{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>${itemSel}</div><div style=${{ fontSize: 12, color: 'var(--s2)', marginBottom: 16 }}>${meta(itemSel).orig || ''} · ${meta(itemSel).cat || ''}${rncItemSel > 0 ? html` · <span style=${{ color: 'var(--rd)', fontWeight: 700 }}>${rncItemSel} RNC(s) no período</span>` : ''}</div>${historicoItem.length ? html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>${historicoItem.map((h, i) => html`<div key=${i} style=${{ display: 'grid', gridTemplateColumns: '110px 90px 1fr', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--bd)' : 'none' }}><div style=${{ fontSize: 12, fontWeight: 800 }}>${fDate(h.data)}</div><div><span class="badge ${h.tipo === 'RNC' ? 'brd2' : 'bgr2'}">${h.tipo}</span></div><div><div style=${{ fontSize: 13, fontWeight: 700 }}>${h.texto}</div><div style=${{ fontSize: 11, color: 'var(--s2)', marginTop: 2 }}>${h.origem} · ${wLbl(h.semana)}</div></div></div>`)}</div>` : html`<p style=${{ fontSize: 13, color: 'var(--s2)' }}>Nenhum histórico encontrado no período selecionado.</p>`}</div>`}</div>
    </div>` : null}
  </div>`;
}



/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
function ConfigTab({ toast }) {
  const cat = useMemo(getCatalog, []);
  const [custom, setCustom] = useState(() => LS.get('catalog') || { added: [], removed: [], addedCats: [] });
  const [config, setConfig] = useState(() => LS.get('config') || { responsavel: '', empresa: 'Grupo Ilha' });
  const [addingItem, setAddingItem] = useState(null);
  const [addingCat, setAddingCat] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const backupRef = useRef(null);
  const [usage, setUsage] = useState(() => storageUsage());
  const allItems = useMemo(() => flatCatalog(cat, { includeInactive: true }), [cat, custom]);

  const refreshUsage = () => setUsage(storageUsage());
  const saveCustom = c => { if (!LS.set('catalog', c)) return false; setCustom(c); refreshUsage(); return true; };
  const saveConfig = c => { if (!LS.set('config', c)) return false; setConfig(c); refreshUsage(); return true; };

  const isCustomItem = (orig, cat, name) => (custom.added || []).some(a => a.orig === orig && a.cat === cat && a.name === name);
  const isRemoved = (orig, cat, name) => (custom.removed || []).some(r => r.orig === orig && r.cat === cat && r.name === name);
  const isCustomCat = (orig, cat) => (custom.addedCats || []).some(c => c.orig === orig && c.cat === cat);

  const addItem = ({ orig, cat, name, unit }) => {
    const clean=name.trim(); if (!clean) return;
    if (allItems.some(i=>i.name.toLowerCase()===clean.toLowerCase())) { toast.show('Já existe um produto com este nome. Use um nome único para evitar conflitos em pedidos e relatórios.'); return; }
    const next = { ...custom, added: [...(custom.added || []), { orig, cat, name: clean, unit }] };
    if(saveCustom(next)){ auditLog('Item adicionado ao catálogo', `${orig} · ${cat} · ${clean} · ${unit}`); toast.show('Item adicionado'); setAddingItem(null); }
  };
  const removeItem = ({ orig, cat, name }) => { const isCus = isCustomItem(orig, cat, name); const next = isCus ? { ...custom, added: (custom.added || []).filter(a => !(a.orig === orig && a.cat === cat && a.name === name)) } : { ...custom, removed: [...(custom.removed || []).filter(r=>!(r.orig===orig&&r.cat===cat&&r.name===name)), { orig, cat, name }] }; if(saveCustom(next)){ auditLog('Item removido do catálogo', `${orig} · ${cat} · ${name}`); toast.show('Removido'); setConfirmDel(null); } };
  const restoreItem = ({ orig, cat, name }) => { if(allItems.some(i=>i.name.toLowerCase()===name.toLowerCase() && !(i.orig===orig && i.cat===cat))){ toast.show('Não é possível restaurar: já existe outro produto com este nome.'); return; } if(saveCustom({ ...custom, removed: (custom.removed || []).filter(r => !(r.orig === orig && r.cat === cat && r.name === name)) })){ auditLog('Item restaurado no catálogo', `${orig} · ${cat} · ${name}`); toast.show('Restaurado'); } };
  const addCat = ({ orig, cat, unit }) => { const clean=cat.trim(); if (!clean) return; if(Object.keys(getCatalog()[orig]?.cats||{}).some(c=>c.toLowerCase()===clean.toLowerCase())){ toast.show('Esta categoria já existe.'); return; } const next = { ...custom, addedCats: [...(custom.addedCats || []), { orig, cat: clean, unit }] }; if(saveCustom(next)){ auditLog('Categoria criada', `${orig} · ${clean} · ${unit}`); toast.show('Categoria criada'); setAddingCat(null); } };
  const removeCat = (orig, cat) => { if (!confirm(`Excluir categoria "${cat}"?`)) return; const next = { ...custom, addedCats: (custom.addedCats || []).filter(c => !(c.orig === orig && c.cat === cat)), added: (custom.added || []).filter(a => !(a.orig === orig && a.cat === cat)) }; if(saveCustom(next)){ auditLog('Categoria excluída', `${orig} · ${cat}`); toast.show('Categoria excluída'); } };
  const importar = async file => { if(!file) return; try { if(await importBackupFile(file)){ toast.show('Backup importado. Recarregando...'); setTimeout(()=>location.reload(),350); } } catch(e){ toast.show(e.message || 'Falha ao importar backup.'); } finally { if(backupRef.current) backupRef.current.value=''; } };

  return html`<div class="page">
    <div style=${{ marginBottom: 16 }}><h2 style=${{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", margin: 0 }}>Configurações</h2><p style=${{ fontSize: 13, color: "var(--s2)", margin: "4px 0 0" }}>Preferências, catálogo, itens inativos e padrões do sistema.</p></div>


    <div class="card" style=${{ padding: 16, marginBottom: 12 }}>
      <div style=${{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Perfil padrão</div>
      <label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Nome do responsável</label>
      <input class="inp" value=${config.responsavel || ''} onInput=${e => saveConfig({ ...config, responsavel: e.target.value })} placeholder="Seu nome completo"/>
      <p style=${{ fontSize: 12, color: 'var(--s2)', margin: '6px 0 12px' }}>Preenchido automaticamente em RNCs, pedidos e recebimentos.</p>
      <label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>RNC automática em divergências</label>
      <select class="inp" value=${config.abrirRncDivergencia || 'perguntar'} onChange=${e=>saveConfig({...config, abrirRncDivergencia:e.target.value})}>
        <option value="perguntar">Perguntar ao finalizar</option><option value="sempre">Gerar automaticamente</option><option value="nunca">Não gerar automaticamente</option>
      </select>
    </div>

    <div class="card" style=${{ padding:16, marginBottom:12 }}>
      <div class="row" style=${{ justifyContent:'space-between', gap:12, marginBottom:8 }}><div><div style=${{ fontWeight:800, fontSize:14 }}>Backup e armazenamento</div><div style=${{ fontSize:12,color:'var(--s2)',marginTop:3 }}>Dados locais ocupando aproximadamente ${usage.mb.toFixed(2)} MB neste navegador.</div></div><span class=${`badge ${usage.mb>4?'brd2':usage.mb>3?'bgy':'bgr2'}`}>${usage.mb>4?'Crítico':usage.mb>3?'Atenção':'Normal'}</span></div>
      <div class="nx-storage-note" style=${{ marginBottom:10 }}>Este modo local não sincroniza entre dispositivos. Exporte um backup regularmente, principalmente antes de atualizar o navegador ou limpar seus dados.</div>
      <div class="row" style=${{ gap:8, flexWrap:'wrap' }}>
        <button class="btn bp bsm" onClick=${()=>{exportBackup(); refreshUsage(); toast.show('Backup exportado');}}><${Ic} n="down" s=${14}/>Exportar backup</button>
        <button class="btn bs bsm" onClick=${()=>backupRef.current?.click()}><${Ic} n="up" s=${14}/>Importar backup</button>
        <button class="btn bs bsm" onClick=${refreshUsage}><${Ic} n="ref" s=${14}/>Atualizar uso</button>
        <input ref=${backupRef} type="file" accept="application/json,.json" style=${{display:'none'}} onChange=${e=>importar(e.target.files?.[0])}/>
      </div>
    </div>

    <div style=${{ marginBottom: 12 }}>
      <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div style=${{ fontWeight: 800, fontSize: 14 }}>Catálogo de produtos</div>
        <button class="btn bg0" style=${{ fontSize: 12, color: 'var(--rd)', padding: '6px 10px' }} onClick=${() => { if (confirm('Restaurar catálogo padrão? Customizações serão perdidas. Pedidos já feitos não serão afetados.')) { saveCustom({ added: [], removed: [], addedCats: [] }); toast.show('Catálogo restaurado'); } }}>Restaurar padrão</button>
      </div>
      <div class="card" style=${{ padding: 12, marginBottom: 8, background: 'var(--am3)', border: '1px solid rgba(217,119,6,.2)' }}>
        <p style=${{ fontSize: 12, color: 'var(--am)', margin: 0, fontWeight: 600 }}>Alterar o catálogo não afeta pedidos, orçamentos, recebimentos e RNCs já criados.</p>
      </div>
    </div>

    ${['CD', 'CP'].map(orig => html`
      <div key=${orig} style=${{ marginBottom: 20 }}>
        <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div style=${{ fontSize: 12, fontWeight: 800, color: 'var(--or2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>${orig} · ${cat[orig].label}</div>
          <button class="btn bs bsm" onClick=${() => setAddingCat({ orig })}><${Ic} n="plus" s=${12}/>Nova categoria</button>
        </div>
        ${Object.entries(cat[orig].cats).map(([catN, catV]) => html`
          <details key=${catN + orig} style=${{ marginBottom: 8 }}>
            <summary class="cat-hdr">
              <${Ic} n="cr" s=${14} c="chv" style=${{ color: 'var(--s3)' }}/>
              <span style=${{ fontWeight: 700, fontSize: 14, flex: 1 }}>${catN}</span>
              ${isCustomCat(orig, catN) && html`<span class="badge bor" style=${{ fontSize: 9 }}>NOVA</span>`}
              <span style=${{ fontSize: 12, color: 'var(--s2)', marginRight: 6 }}>${catV.items.length}</span>
              ${isCustomCat(orig, catN) && html`<button onClick=${e => { e.preventDefault(); e.stopPropagation(); removeCat(orig, catN); }} style=${{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rd)', padding: 4 }}><${Ic} n="trash" s=${14}/></button>`}
              <button onClick=${e => { e.preventDefault(); e.stopPropagation(); setAddingItem({ orig, cat: catN, unit: catV.unit || 'UND' }); }} style=${{ background: 'var(--or)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><${Ic} n="plus" s=${12}/>Item</button>
            </summary>
            <div class="ilist">
              ${catV.items.length === 0 && html`<div style=${{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--s3)' }}>Nenhum item. Adicione acima.</div>`}
              ${catV.items.map((item, idx) => { const rem = isRemoved(orig, catN, item), cus = isCustomItem(orig, catN, item); return html`
                <div key=${item} class="row" style=${{ padding: '10px 16px', borderTop: idx > 0 ? '1px solid var(--bd)' : 'none', justifyContent: 'space-between', opacity: rem ? .45 : 1 }}>
                  <span style=${{ fontSize: 13, textDecoration: rem ? 'line-through' : 'none', fontWeight: cus ? 600 : 400, flex: 1 }}>${item}</span>
                  ${cus && html`<span class="badge bor" style=${{ fontSize: 9, marginRight: 6 }}>NOVO</span>`}
                  ${isInactiveItem(item) && html`<span class="badge bgy" style=${{ fontSize: 9, marginRight: 6 }}>INATIVO</span>`}
                  ${rem
                    ? html`<button class="btn bs bsm" onClick=${() => restoreItem({ orig, cat: catN, name: item })}>Restaurar</button>`
                    : html`<div class="row" style=${{ gap: 6 }}><button class="btn bs bsm" onClick=${() => { const wasInactive = isInactiveItem(item); if (toggleInactiveItem(item)) { toast.show(wasInactive ? 'Item reativado' : 'Item inativado'); location.reload(); } }}>${isInactiveItem(item) ? 'Reativar' : 'Inativar'}</button><button style=${{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rd)', padding: 4 }} onClick=${() => setConfirmDel({ orig, cat: catN, name: item })}><${Ic} n="trash" s=${15}/></button></div>`}
                </div>`; })}
            </div>
          </details>`)}
      </div>`)}

    <div style=${{ marginTop: 32, marginBottom: 24, textAlign: 'center', padding: '20px 0', borderTop: '1px solid var(--bd)' }}>
      <div style=${{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: 'var(--s3)', textTransform: 'uppercase', marginBottom: 6 }}>Desenvolvido por</div>
      <div style=${{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginBottom: 2, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Vinicius Candido dos Santos</div>
      <div style=${{ fontSize: 12, color: 'var(--s2)' }}>NEXUS v2.6.3 · Grupo Ilha · ${new Date().getFullYear()}</div>
    </div>

    ${addingItem && html`<${AddItemModal} orig=${addingItem.orig} cat=${addingItem.cat} defUnit=${addingItem.unit} onClose=${() => setAddingItem(null)} onConfirm=${addItem}/>`}
    ${addingCat && html`<${AddCatModal} orig=${addingCat.orig} onClose=${() => setAddingCat(null)} onConfirm=${addCat}/>`}
    ${confirmDel && html`
      <div class="mbg mcenter" onClick=${e => { if (e.target === e.currentTarget) setConfirmDel(null); }}>
        <div class="mbox">
          <h3 style=${{ margin: '0 0 8px', fontSize: 17, fontWeight: 800 }}>Remover item?</h3>
          <p style=${{ fontSize: 14, color: 'var(--s2)', margin: '0 0 20px' }}><strong style=${{ color: 'var(--ink)' }}>${confirmDel.name}</strong> será removido do catálogo. Registros já criados não serão afetados.</p>
          <div class="row" style=${{ gap: 8 }}>
            <button class="btn bs" style=${{ flex: 1 }} onClick=${() => setConfirmDel(null)}>Cancelar</button>
            <button class="btn brd" style=${{ flex: 1 }} onClick=${() => removeItem(confirmDel)}>Remover</button>
          </div>
        </div>
      </div>`}
  </div>`;
}

function AddItemModal({ orig, cat, defUnit, onClose, onConfirm }) {
  const [name, setName] = useState(''); const [unit, setUnit] = useState(defUnit || 'UND'); const ref = useRef(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 100); }, []);
  return html`<div class="mbg" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="msheet">
      <div style=${{ padding: '16px 16px 8px', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style=${{ fontWeight: 800, fontSize: 16 }}>Novo item em ${cat}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${orig}</div></div>
        <button class="btn bg0 bic" onClick=${onClose}><${Ic} n="x" s=${20}/></button>
      </div>
      <div style=${{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <div><label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Nome do produto</label><input ref=${ref} class="inp" value=${name} onInput=${e => setName(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') onConfirm({ orig, cat, name, unit }); }} placeholder="Ex: CARNE SECA 1KG"/></div>
        <div><label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Unidade</label><div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>${['UND','KG','G','L','ML','PCT','CX','PCS'].map(u => html`<button key=${u} onClick=${() => setUnit(u)} style=${{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${unit === u ? 'var(--or)' : 'var(--bd)'}`, background: unit === u ? 'var(--or)' : '#fff', color: unit === u ? '#fff' : 'var(--s2)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>${u}</button>`)}</div></div>
      </div>
      <div style=${{ padding: '12px 16px', borderTop: '1px solid var(--bd)', display: 'flex', gap: 8 }}>
        <button class="btn bs" style=${{ flex: 1 }} onClick=${onClose}>Cancelar</button>
        <button class="btn bp" style=${{ flex: 1 }} disabled=${!name.trim()} onClick=${() => onConfirm({ orig, cat, name, unit })}>Adicionar</button>
      </div>
    </div>
  </div>`;
}

function AddCatModal({ orig, onClose, onConfirm }) {
  const [cat, setCat] = useState(''); const [unit, setUnit] = useState('UND'); const ref = useRef(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 100); }, []);
  return html`<div class="mbg" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="msheet">
      <div style=${{ padding: '16px 16px 8px', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style=${{ fontWeight: 800, fontSize: 16 }}>Nova categoria em ${orig}</div>
        <button class="btn bg0 bic" onClick=${onClose}><${Ic} n="x" s=${20}/></button>
      </div>
      <div style=${{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <div><label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Nome da categoria</label><input ref=${ref} class="inp" value=${cat} onInput=${e => setCat(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') onConfirm({ orig, cat, unit }); }} placeholder="Ex: Bebidas, Descartáveis..."/></div>
        <div><label style=${{ fontSize: 11, fontWeight: 700, color: 'var(--s2)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Unidade padrão</label><div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>${['UND','KG','G','L','ML','PCT','CX','PCS'].map(u => html`<button key=${u} onClick=${() => setUnit(u)} style=${{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${unit === u ? 'var(--or)' : 'var(--bd)'}`, background: unit === u ? 'var(--or)' : '#fff', color: unit === u ? '#fff' : 'var(--s2)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>${u}</button>`)}</div></div>
      </div>
      <div style=${{ padding: '12px 16px', borderTop: '1px solid var(--bd)', display: 'flex', gap: 8 }}>
        <button class="btn bs" style=${{ flex: 1 }} onClick=${onClose}>Cancelar</button>
        <button class="btn bp" style=${{ flex: 1 }} disabled=${!cat.trim()} onClick=${() => onConfirm({ orig, cat, unit })}>Criar categoria</button>
      </div>
    </div>
  </div>`;
}


/* ══════════════════════════════════════
   ADMINISTRAÇÃO LOCAL
══════════════════════════════════════ */
function AdminLocal({ toast }) {
  const [trash, setTrash] = useState(() => LS.get('trash') || []);
  const [logs, setLogs] = useState(() => LS.get('audit') || []);
  const [logBusca, setLogBusca] = useState('');
  const pedidos = LS.get('pedidos') || [];
  const orcamentos = LS.get('orcamentos') || [];
  const rncs = LS.get('rncs') || [];
  const term = logBusca.toLowerCase();
  const logsFiltrados = logs.filter(l => {
    const ac = l.acao || l.action || ''; const det = l.det || l.detail || ''; const usr=l.usuario || '';
    return !term || `${ac} ${det} ${usr} ${fDateTime(l.data)}`.toLowerCase().includes(term);
  });
  const restaurar = t => {
    if (!t) return;
    const semRegistro = t.type === 'recebimento' ? t.record?.semana : recordWeek(t.record);
    if (semRegistro && isWeekClosed(semRegistro)) { toast.show(`Reabra ${wLbl(semRegistro)} antes de restaurar este registro.`); return; }
    const changes = {};
    if (t.type === 'pedido') changes.pedidos = upsertById(LS.get('pedidos') || [], t.record);
    if (t.type === 'orcamento') changes.orcamentos = upsertById(LS.get('orcamentos') || [], t.record);
    if (t.type === 'rnc') changes.rncs = upsertById(LS.get('rncs') || [], t.record);
    if (t.type === 'recebimento') {
      const a = LS.get('pedidos') || [];
      const payload = t.record || {};
      const rec = payload.recebimento || payload;
      changes.pedidos = a.map(p => p.id === payload.pedidoId ? {
        ...p,
        status: payload.statusAnterior || (rec?.status === 'parcial' ? 'parcial' : ((rec?.itens || []).some(i => Number(i.qtdRecebida||0) !== Number(i.qtd||0)) ? 'parcial' : 'recebido')),
        recebimento: rec,
      } : p);
      const restored = changes.pedidos.find(p => p.id === payload.pedidoId && p.recebimento);
      if (!restored) { toast.show('Pedido vinculado não foi encontrado.'); return; }
      changes.rncs = syncAutoRncsForReceipt(restored, rec || { id:uid(), data:todayISO(), responsavel:restored.responsavel || '', itens:restored.itens || [] }, true);
    }
    const nt = trash.filter(x => x.id !== t.id); changes.trash = nt;
    if (!commitLocal(changes)) return;
    setTrash(nt);
    auditLog('Restauração de lixeira', `${t.type}: ${t.record?.numero || t.record?.semana || t.record?.id || ''}`);
    setLogs(LS.get('audit') || []);
    toast.show('Registro restaurado');
  };
  const removerDef = t => {
    if (!strongConfirm('Exclusão permanente')) return;
    const nt=trash.filter(x=>x.id!==t.id); if(!LS.set('trash',nt)) return; setTrash(nt);
    auditLog('Exclusão permanente', `${t.type}: ${t.record?.numero || t.record?.semana || t.record?.id || ''}`);
    setLogs(LS.get('audit')||[]); toast.show('Excluído permanentemente');
  };
  return html`<div class="page" style=${{ maxWidth:'1440px' }}>
    <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:16 }}>
      <div><h2 style=${{ fontSize:22, fontWeight:800, fontFamily:"'Plus Jakarta Sans',sans-serif", margin:0 }}>Administração</h2><p style=${{ fontSize:13, color:'var(--s2)', margin:'4px 0 0' }}>Governança local, lixeira, auditoria e controle de semana.</p></div>
      <span class="badge bor">Lixeira: ${trash.length}</span>
    </div>
    <div style=${{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14 }}>
      <div class="card" style=${{ padding:16 }}>
        <div style=${{ fontWeight:800, fontSize:16, marginBottom:10 }}>Lixeira administrativa</div>
        <p style=${{ fontSize:12, color:'var(--s2)', margin:'0 0 12px' }}>Pedidos, orçamentos, recebimentos e RNCs excluídos ficam aqui para restauração ou exclusão definitiva.</p>
        <div style=${{ display:'flex', flexDirection:'column', gap:8, maxHeight:360, overflow:'auto' }}>
          ${trash.length===0 && html`<p style=${{ fontSize:13,color:'var(--s2)' }}>Nenhum item na lixeira.</p>`}
          ${trash.map(t=>html`<div key=${t.id} style=${{ border:'1px solid var(--bd)',borderRadius:12,padding:12,background:'#fff', display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center' }}>
            <div><div style=${{ fontWeight:800,fontSize:13 }}>${(t.type || '').toUpperCase()} · ${t.record?.numero || t.record?.semana || t.record?.id || 'registro'}</div><div style=${{ fontSize:12,color:'var(--s2)',marginTop:2 }}>${fDateTime(t.apagadoEm)} · ${t.motivo || 'Sem motivo informado'}</div></div>
            <div class="row"><button class="btn bs bsm" onClick=${()=>restaurar(t)}>Restaurar</button><button class="btn brd bsm" onClick=${()=>removerDef(t)}>Excluir definitivo</button></div>
          </div>`)}
        </div>
      </div>
      <div class="card" style=${{ padding:16 }}>
        <div style=${{ fontWeight:800, fontSize:16, marginBottom:10 }}>Painel de saúde operacional</div>
        <div style=${{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          ${[['Pedidos pendentes',pedidos.filter(p=>p.status==='pendente').length],['Recebimentos parciais',pedidos.filter(p=>p.status==='parcial').length],['Recebimentos OK',pedidos.filter(p=>p.status==='recebido').length],['RNCs abertas',rncs.filter(r=>r.status==='aberta'||r.status==='analise').length],['RNCs concluídas',rncs.filter(r=>r.status==='resolvida').length],['Orçam. a autorizar',orcamentos.filter(o=>o.status==='pendente').length]].map(([l,v])=>html`<div style=${{ padding:12, border:'1px solid var(--bd)', borderRadius:12, background:'#fff' }}><div style=${{ fontSize:10,color:'var(--s3)',fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em' }}>${l}</div><div style=${{ fontSize:24,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>${v}</div></div>`)}
        </div>
      </div>
    </div>
    <${WeekControl} toast=${toast}/>
    <div class="card" style=${{ padding:16 }}>
      <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:10 }}><div style=${{ fontWeight:800, fontSize:16 }}>Logs e auditoria</div><input class="inp" style=${{ maxWidth:360 }} value=${logBusca} onInput=${e=>setLogBusca(e.target.value)} placeholder="Buscar por ação, usuário, data ou detalhe..."/></div>
      <div style=${{ display:'flex', flexDirection:'column', gap:8, maxHeight:380, overflow:'auto' }}>
        ${logsFiltrados.length===0 && html`<p style=${{ fontSize:13,color:'var(--s2)' }}>Nenhum log encontrado.</p>`}
        ${logsFiltrados.slice(0,200).map((l,i)=>html`<div key=${l.id||i} style=${{ border:'1px solid var(--bd)', borderRadius:12, padding:12, background:'#fff' }}><div style=${{ fontWeight:800, fontSize:13 }}>${fDateTime(l.data)} · ${l.acao || l.action || 'Ação'}</div><div style=${{ fontSize:11, color:'var(--s3)', marginTop:2 }}>${l.usuario || 'Usuário local'}</div><div style=${{ fontSize:12, color:'var(--s2)', marginTop:3 }}>${l.det || l.detail || 'Sem detalhe'}</div></div>`)}
      </div>
    </div>
  </div>`;
}


/* ══════════════════════════════════════
   GLOBAL SEARCH
══════════════════════════════════════ */
function GlobalSearch({ setTab }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 80); }, [open]);
  useEffect(() => { const fn = e => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, []);
  const pedidos = LS.get('pedidos') || [];
  const rncs = LS.get('rncs') || [];
  const orcamentos = LS.get('orcamentos') || [];
  const term=q.trim().toLowerCase();
  const resultados = term.length < 2 ? [] : [
    ...pedidos.filter(p => `${wLbl(p.semana)} ${p.origem||''} ${p.responsavel||''} ${(p.itens||[]).map(i=>i.nome).join(' ')}`.toLowerCase().includes(term)).slice(0,5).map(p => ({ label: `Pedido · ${wLbl(p.semana)} · ${p.origem}`, tab: 'pedidos', id:p.id })),
    ...pedidos.filter(p => p.recebimento && `${wLbl(p.semana)} ${p.origem||''} ${p.recebimento?.responsavel||''} ${(p.itens||[]).map(i=>i.nome).join(' ')}`.toLowerCase().includes(term)).slice(0,5).map(p => ({ label: `Recebimento · ${wLbl(p.semana)} · ${p.origem}`, tab: 'recebimento', id:p.id })),
    ...rncs.filter(r => `${r.numero||''} ${r.produto||''} ${r.fornecedor||''} ${r.responsavel||''} ${r.tipo||''}`.toLowerCase().includes(term)).slice(0,5).map(r => ({ label: `RNC · ${r.numero} · ${r.produto||''}`, tab: 'rnc', id:r.id })),
    ...orcamentos.filter(o => `${wLbl(o.semana)} ${o.origem||''} ${o.responsavel||''} ${(o.itens||[]).map(i=>i.nome).join(' ')}`.toLowerCase().includes(term)).slice(0,5).map(o => ({ label: `Orçamento · ${wLbl(o.semana)} · ${o.origem}`, tab: 'orcamento', id:o.id })),
  ].slice(0,15);
  const abrir = r => {
    if (!canLeaveEditor()) return;
    if(!LS.set('openTarget',{ tab:r.tab, id:r.id, at:Date.now() })) return;
    setTab(r.tab); setTimeout(()=>window.dispatchEvent(new CustomEvent('nx-open-target')),0); setOpen(false); setQ('');
  };
  if (!open) return html`<button class="gsearch-fab btn" onClick=${() => setOpen(true)} title="Busca global"><${Ic} n="orders" s=${20}/><span class="gsearch-tip">Busca global</span></button>`;
  return html`<div class="mbg mcenter" onClick=${e => { if (e.target === e.currentTarget) setOpen(false); }}>
    <div class="mbox" style=${{ width: 'calc(100% - 32px)', maxWidth: 560 }}>
      <div class="row" style=${{ marginBottom: 12 }}>
        <input ref=${ref} class="inp" style=${{ flex: 1 }} value=${q} onInput=${e => setQ(e.target.value)} placeholder="Buscar número, produto, responsável, fornecedor..."/>
        <button class="btn bg0 bic" onClick=${() => setOpen(false)}><${Ic} n="x" s=${20}/></button>
      </div>
      ${resultados.length === 0 && term.length >= 2 && html`<p style=${{ fontSize:13, color:'var(--s2)', textAlign:'center', padding:'12px 0' }}>Nenhum resultado encontrado.</p>`}
      ${resultados.map((r, i) => html`<button key=${`${r.tab}-${r.id}-${i}`} class="card" style=${{ width:'100%', padding:'12px 16px', border:'none', textAlign:'left', cursor:'pointer', marginBottom:6, display:'block' }} onClick=${() => abrir(r)}><span style=${{ fontSize:13, fontWeight:600 }}>${r.label}</span></button>`)}
    </div>
  </div>`;
}

/* ══════════════════════════════════════
   TAB ERROR BOUNDARY
══════════════════════════════════════ */
class TabErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('TabErrorBoundary:', error, info); }
  componentDidUpdate(prev) { if (prev.tab !== this.props.tab) this.setState({ hasError: false, error: null }); }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'card', style: { padding: 24, textAlign: 'center' } },
          React.createElement('div', { style: { fontSize: 32, marginBottom: 8 } }, '⚠️'),
          React.createElement('div', { style: { fontWeight: 800, fontSize: 16, marginBottom: 8 } }, 'Erro nesta seção'),
          React.createElement('div', { style: { fontSize: 13, color: '#6B7280', marginBottom: 16 } }, String(this.state.error?.message || 'Erro desconhecido')),
          React.createElement('button', { className: 'btn bp', onClick: () => this.setState({ hasError: false, error: null }) }, 'Tentar novamente')
        )
      );
    }
    return this.props.children;
  }
}

/* ══════════════════════════════════════
   WEEK CONTROL
══════════════════════════════════════ */
function WeekControl({ toast }) {
  const cur = getWeekId();
  const sems = useMemo(genSems, []);
  const [sel, setSel] = useState(cur);
  const [closed, setClosed] = useState(() => LS.get('closedWeeks') || []);
  const isClosed = closed.includes(sel);
  const fechar = () => { if(closeWeek(sel)){ setClosed(LS.get('closedWeeks')||[]); toast.show(`${wLbl(sel)} fechada`); } };
  const reabrir = () => {
    const motivo = prompt(`Informe o motivo para reabrir ${wLbl(sel)}:`);
    if (!String(motivo||'').trim()) { toast.show('A reabertura exige uma justificativa.'); return; }
    if(reopenWeek(sel,motivo)){ setClosed(LS.get('closedWeeks')||[]); toast.show(`${wLbl(sel)} reaberta`); }
  };
  return html`<div class="card" style=${{ padding: 16, marginBottom: 14 }}>
    <div style=${{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Controle de semana</div>
    <div class="row" style=${{ gap: 8, marginBottom: 10 }}>
      <select class="inp" value=${sel} onChange=${e => setSel(e.target.value)} style=${{ flex: 1 }}>
        ${sems.map(s => html`<option key=${s} value=${s}>${wLbl(s)}${s === cur ? ' (atual)' : ''}</option>`)}
      </select>
      <span class=${`badge ${isClosed ? 'brd2' : 'bgr2'}`}>${isClosed ? 'Fechada' : 'Aberta'}</span>
    </div>
    <div class="row" style=${{ gap: 8 }}>
      <button class="btn bs bsm" style=${{ flex: 1 }} disabled=${!isClosed} onClick=${reabrir}><${Ic} n="ref" s=${14}/>Reabrir</button>
      <button class="btn bp bsm" style=${{ flex: 1 }} disabled=${isClosed} onClick=${fechar}><${Ic} n="chk" s=${14}/>Fechar semana</button>
    </div>
  </div>`;
}

/* ══════════════════════════════════════
   DATA MIGRATION
══════════════════════════════════════ */
function migrateLocalData() {
  const target='2.6.3';
  if (LS.get('schemaVersion') === target) return true;
  const now=new Date().toISOString();
  let pedidos=LS.get('pedidos') || [];
  let orcamentos=LS.get('orcamentos') || [];
  let rncs=LS.get('rncs') || [];
  pedidos=pedidos.map(p=>{
    const itens=(p.itens||[]).map(i=>({...i,qtd:nonNeg(i.qtd)}));
    const base={...p,id:p.id||uid(),semana:p.semana||dateToWeek(p.data||p.criadoEm||todayISO()),criadoEm:p.criadoEm||now,itens};
    if(!base.recebimento) return {...base,status:base.status||'pendente'};
    const recItens=(base.recebimento.itens||itens).map(i=>({...i,qtd:nonNeg(i.qtd),qtdRecebida:nonNeg(i.qtdRecebida)}));
    const rec={...base.recebimento,id:base.recebimento.id||uid(),data:base.recebimento.data||String(base.recebimento.finalizadoEm||base.criadoEm||todayISO()).slice(0,10),finalizadoEm:base.recebimento.finalizadoEm||base.recebimento.criadoEm||now,itens:recItens};
    const parcial=recItens.some(i=>Math.abs(Number(i.qtdRecebida||0)-Number(i.qtd||0))>0.000001);
    rec.status=parcial?'parcial':'completo';
    return {...base,recebimento:rec,status:parcial?'parcial':'recebido'};
  });
  orcamentos=orcamentos.map(o=>{
    const itens=(o.itens||[]).map(i=>({...i,qtd:nonNeg(i.qtd),precoUnit:nonNeg(i.precoUnit)}));
    const total=itens.reduce((sum,i)=>sum+nonNeg(i.qtd)*nonNeg(i.precoUnit),0);
    return {...o,id:o.id||uid(),semana:o.semana||dateToWeek(o.data||o.criadoEm||todayISO()),data:o.data||todayISO(weekStartDate(o.semana||getWeekId())),status:o.status||'pendente',criadoEm:o.criadoEm||now,itens,total};
  });
  const rebuilt=[]; const usedNumbers=new Set();
  rncs.forEach(r=>{
    const data=r.data||todayISO(); const origem=r.origem||'CD'; const status=r.status||'aberta';
    const base={...r,id:r.id||uid(),data,semana:r.semana||dateToWeek(data),origem,status,gravidade:r.gravidade||'Média',quantidade:nonNeg(r.quantidade),qtdPedida:nonNeg(r.qtdPedida),qtdRecebida:nonNeg(r.qtdRecebida),qtdRecusada:nonNeg(r.qtdRecusada),impactoFinanceiro:nonNeg(r.impactoFinanceiro),medidaRealizada:r.medidaRealizada||(status==='resolvida'?(r.verificacaoEficacia||r.planoAcao||''):''),criadoEm:r.criadoEm||now,historicoStatus:(r.historicoStatus||[]).length?r.historicoStatus:[{de:null,para:status,em:r.criadoEm||now,usuario:r.responsavel||(LS.get('config')||{}).responsavel||'Usuário local'}]};
    if(!base.numero || usedNumbers.has(base.numero)) base.numero=nextRncNumber(origem,[...rebuilt,...rncs],data);
    usedNumbers.add(base.numero); rebuilt.push(base);
  });
  const closed=[...new Set((LS.get('closedWeeks')||[]).filter(w=>/^\d{4}-W\d{2}$/.test(String(w))))].sort();
  return commitLocal({pedidos,orcamentos,rncs:rebuilt,closedWeeks:closed,schemaVersion:target});
}

migrateLocalData();

/* ══════════════════════════════════════
   APP ROOT
══════════════════════════════════════ */
function App() {
  const [tab, _setTab] = useState(LS.get('tabAtual') || 'inicio');
  const setTab = t => {
    if (t === tab) return;
    if (!canLeaveEditor()) return;
    window.__nxEditorDirty=false;
    if (LS.set('tabAtual', t)) _setTab(t);
  };
  const toast = useToast();
  return html`<div style=${{ minHeight: '100dvh' }}>
    ${toast.ui}
    <${GlobalSearch} setTab=${setTab}/>
    <${Header} tab=${tab} setTab=${setTab}/>
    <main>
      <${TabErrorBoundary} tab=${tab}>
        ${tab === 'inicio' && html`<${InicioTab} setTab=${setTab}/>`}
        ${tab === 'orcamento' && html`<${OrcamentoTab} toast=${toast}/>`}
        ${tab === 'pedidos' && html`<${PedidosTab} toast=${toast}/>`}
        ${tab === 'recebimento' && html`<${RecebimentoTab} toast=${toast}/>`}
        ${tab === 'rnc' && html`<${RncTab} toast=${toast}/>`}
        ${tab === 'relatorios' && html`<${RelatoriosTab} toast=${toast}/>`}
        ${tab === 'analise' && html`<${AnaliseTab}/>`}
        ${tab === 'admin' && html`<${AdminLocal} toast=${toast}/>`}
        ${tab === 'config' && html`<${ConfigTab} toast=${toast}/>`}
      </${TabErrorBoundary}>
    </main>
    <${BottomNav} tab=${tab} setTab=${setTab}/>
  </div>`;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App}/>`);
}
