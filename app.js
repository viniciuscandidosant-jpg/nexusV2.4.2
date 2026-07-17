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
function fHora(s) { if (!s) return ''; try { return new Date(s).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); } catch { return ''; } }
function duracaoEntre(inicio, fim) {
  if (!inicio || !fim) return '';
  const ms = new Date(fim) - new Date(inicio);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2,'0')}min` : `${m} min`;
}
function precoItemRecebimento(item, recItem) {
  return nonNeg(recItem?.precoUnit ?? item?.precoUnit ?? ultimoPrecoGlobal(item?.nome));
}
function totaisRecebimento(pedido, itensRec) {
  const mapa = new Map((itensRec || []).map(i => [i.nome, i]));
  let valorPedido = 0, valorRecebido = 0;
  const itens = (pedido?.itens || []).map(item => {
    const recItem = mapa.get(item.nome) || {};
    const precoUnit = precoItemRecebimento(item, recItem);
    const qtdPedida = Number(item.qtd || 0);
    const qtdRecebida = Number(recItem.qtdRecebida ?? item.qtd ?? 0);
    const subtotalPedido = qtdPedida * precoUnit;
    const subtotalRecebido = qtdRecebida * precoUnit;
    valorPedido += subtotalPedido;
    valorRecebido += subtotalRecebido;
    return { ...item, ...recItem, qtd:qtdPedida, qtdRecebida, precoUnit, subtotalPedido, subtotalRecebido };
  });
  return { itens, valorPedido, valorRecebido };
}
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
  const data = { app:'NEXUS', version:'2.8.1', exportedAt:new Date().toISOString(), stores:{} };
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


const DEFAULT_UNIDADES = [
  { id:'ilha-vix', nome:'Ilha do Caranguejo - VIX', ativo:true },
  { id:'ilha-vv', nome:'Ilha do Caranguejo - VV', ativo:true },
];
function normalizeUnidades(list) {
  const raw = Array.isArray(list) && list.length ? list : DEFAULT_UNIDADES;
  const normalized = raw.map((u,idx)=> typeof u === 'string'
    ? { id:`unidade-${idx+1}-${u.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`, nome:u.trim(), ativo:true }
    : { id:u?.id || uid(), nome:String(u?.nome || '').trim(), ativo:u?.ativo !== false }
  ).filter(u=>u.nome);
  const out=[]; const names=new Set();
  for (const u of normalized) {
    const key=u.nome.toLowerCase();
    if(names.has(key)) continue;
    names.add(key); out.push(u);
  }
  return out;
}
function getUnidades(opts={}) {
  const config=LS.get('config') || {};
  const units=normalizeUnidades(config.unidades);
  return opts.includeInactive ? units : units.filter(u=>u.ativo !== false);
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
const ST_PED = { pendente: { l: 'Aguardando', c: 'bgy' }, recebido: { l: 'Recebido', c: 'bgr2' }, parcial: { l: 'Com divergência', c: 'bam' }, cancelado: { l: 'Cancelado', c: 'brd2' } };
const ST_RNC = { aberta: { l: 'Aberta', c: 'brd2' }, analise: { l: 'Em acompanhamento', c: 'bam' }, resolvida: { l: 'Concluída', c: 'bgr2' }, cancelada: { l: 'Cancelada', c: 'bgy' } };

function RecordsFilter({ busca, setBusca, origem, setOrigem, status, setStatus, statusOpts=[], unidade, setUnidade, unidades=[] }) {
  return html`<div class="card" style=${{ padding:12, marginBottom:14 }}>
    <div style=${{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:8 }}>
      <input class="inp" value=${busca} onInput=${e=>setBusca(e.target.value)} placeholder="Buscar por semana, produto ou responsável..."/>
      <select class="inp" value=${origem} onChange=${e=>setOrigem(e.target.value)}><option value="TODOS">CD + CP</option><option value="CD">CD</option><option value="CP">CP</option></select>
      <select class="inp" value=${status} onChange=${e=>setStatus(e.target.value)}><option value="TODOS">Todos os status</option>${statusOpts.map(o=>html`<option key=${o.v} value=${o.v}>${o.l}</option>`)}</select>
      ${setUnidade && html`<select class="inp" value=${unidade||'TODAS'} onChange=${e=>setUnidade(e.target.value)}><option value="TODAS">Todas as unidades</option>${unidades.map(u=>html`<option key=${u.nome||u} value=${u.nome||u}>${u.nome||u}</option>`)}</select>`}
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
        [`Recebimentos com divergência`, parcial, parcial > 0 ? 'var(--am)' : 'var(--ink)', 'recebimento'],
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
  const [fBusca, setFBusca] = useState(''); const [fOrig, setFOrig] = useState('TODOS'); const [fStatus, setFStatus] = useState('TODOS'); const [fUnidade,setFUnidade]=useState('TODAS'); const [limit, setLimit] = useState(30);
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
    ${pedidos.length>0 && html`<${RecordsFilter} busca=${fBusca} setBusca=${resetLimit(setFBusca)} origem=${fOrig} setOrigem=${resetLimit(setFOrig)} status=${fStatus} setStatus=${resetLimit(setFStatus)} statusOpts=${[{v:'pendente',l:'Aguardando'},{v:'recebido',l:'Recebido'},{v:'parcial',l:'Com divergência'},{v:'cancelado',l:'Cancelado'}]}/>`}
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
  const totalizados = totaisRecebimento(pedido, receiptItems).itens;
  return totalizados
    .map(i => ({ ...i, diferenca:Number(i.qtdRecebida || 0) - Number(i.qtd || 0), valorDivergencia:Math.abs(Number(i.qtdRecebida || 0) - Number(i.qtd || 0)) * Number(i.precoUnit || 0) }))
    .filter(i => Math.abs(i.diferenca) > 0.000001);
}
function syncAutoRncsForReceipt(pedido, recebimento, allowCreate) {
  let rncs = [...(LS.get('rncs') || [])];
  const totais = totaisRecebimento(pedido, recebimento.itens);
  const divergencias = receiptDivergences(pedido, totais.itens);
  const activeKeys = new Set(divergencias.map(d => `${pedido.id}::${d.nome}`));
  const now = new Date().toISOString();
  const usuario = recebimento.responsavel || pedido.responsavel || (LS.get('config') || {}).responsavel || 'Usuário local';
  const unidadePadrao = (LS.get('config')||{}).unidadePadrao || getUnidades()[0]?.nome || '';
  for (const d of divergencias) {
    const autoKey = `${pedido.id}::${d.nome}`;
    const idx = rncs.findIndex(r => r.autoGerada && (r.autoKey === autoKey || (r.pedidoId === pedido.id && r.produto === d.nome)));
    if (idx < 0 && !allowCreate) continue;
    const existente = idx >= 0 ? rncs[idx] : null;
    const natureza = d.diferenca < 0 ? 'Falta no recebimento' : 'Excesso no recebimento';
    const quantidade = Math.abs(d.diferenca);
    const changed = existente && (
      Number(existente.qtdPedida || 0) !== Number(d.qtd || 0) ||
      Number(existente.qtdRecebida || 0) !== Number(d.qtdRecebida || 0) ||
      Number(existente.precoUnit || 0) !== Number(d.precoUnit || 0)
    );
    const canceladaPeloSistema = existente?.status === 'cancelada' && (existente.canceladaAutomaticamente || ['Recebimento de origem removido','Divergência removida após correção do recebimento.'].includes(existente.motivoCancelamento));
    const novoStatus = (!existente || canceladaPeloSistema || (changed && ['resolvida','cancelada'].includes(existente.status))) ? 'aberta' : (existente.status || 'aberta');
    const historicoStatus = [...(existente?.historicoStatus || [])];
    if (!existente || existente.status !== novoStatus) historicoStatus.push({ de:existente?.status || null, para:novoStatus, em:now, usuario });
    const descricao = `${natureza}. Quantidade pedida: ${d.qtd} ${d.unit || ''}. Quantidade recebida: ${d.qtdRecebida} ${d.unit || ''}. Diferença: ${d.diferenca > 0 ? '+' : ''}${d.diferenca} ${d.unit || ''}. Preço unitário: ${fMoeda(d.precoUnit || 0)}. Valor da divergência: ${fMoeda(d.valorDivergencia || 0)}.`;
    const impacto = d.diferenca < 0
      ? `O recebimento foi concluído com falta de ${quantidade} ${d.unit || ''} do produto. Valor estimado da falta: ${fMoeda(d.valorDivergencia || 0)}.`
      : `O recebimento foi concluído com excesso de ${quantidade} ${d.unit || ''} do produto. Valor estimado do excesso: ${fMoeda(d.valorDivergencia || 0)}.`;
    const providencia = d.diferenca < 0
      ? 'Solicitamos a entrega da quantidade faltante ou o crédito correspondente.'
      : 'Solicitamos orientação para devolução, regularização ou ajuste da quantidade excedente.';
    const base = {
      ...(existente || {}),
      id:existente?.id || uid(),
      numero:existente?.numero || nextRncNumber(pedido.origem, rncs, recebimento.data || todayISO()),
      data:recebimento.data || todayISO(),
      dataIdentificacao:recebimento.data || todayISO(),
      semana:pedido.semana,
      unidadeOrigem:existente?.unidadeOrigem || unidadePadrao,
      origem:pedido.origem,
      setor:'Recebimento',
      setorIdentificacao:'Recebimento',
      etapaIdentificacao:'Recebimento',
      responsavel:usuario,
      produto:d.nome,
      lote:existente?.lote || '',
      dataManipulacaoFabricacao:existente?.dataManipulacaoFabricacao || '',
      validade:existente?.validade || '',
      unidade:d.unit || 'UND',
      quantidade,
      qtdAfetadaConfirmada:quantidade,
      qtdAfetadaInicial:quantidade,
      qtdDescartada:existente?.qtdDescartada || 0,
      qtdEmObservacao:existente?.qtdEmObservacao || 0,
      gravidade:existente?.gravidade || 'Média',
      tipo:'Quantidade incorreta',
      tipoCustom:'',
      naturezaDivergencia:natureza,
      descricao,
      abrangencia:existente?.abrangencia || 'Abrangência ainda não determinada',
      riscos:Array.isArray(existente?.riscos) && existente.riscos.length ? existente.riscos : ['Perda financeira','Interrupção operacional'],
      contencoes:Array.isArray(existente?.contencoes) && existente.contencoes.length ? existente.contencoes : ['Nenhuma contenção necessária'],
      impactoOperacional:existente?.impactoOperacional || impacto,
      providenciaSolicitada:existente?.providenciaSolicitada || providencia,
      situacaoAtual:existente?.situacaoAtual || 'RNC aberta automaticamente ao finalizar o recebimento. Aguardando retorno do fornecedor.',
      status:novoStatus,
      historicoStatus,
      encerradoEm:novoStatus === 'resolvida' ? existente?.encerradoEm || null : null,
      motivoCancelamento:novoStatus === 'cancelada' ? existente?.motivoCancelamento || '' : '',
      canceladaEm:novoStatus === 'cancelada' ? existente?.canceladaEm || null : null,
      fotos:existente?.fotos || [],
      autoGerada:true,
      autoKey,
      pedidoId:pedido.id,
      recebimentoId:recebimento.id,
      orcamentoId:pedido.orcamentoId || null,
      qtdPedida:Number(d.qtd || 0),
      qtdRecebida:Number(d.qtdRecebida || 0),
      diferencaRecebimento:Number(d.diferenca || 0),
      precoUnit:Number(d.precoUnit || 0),
      valorDivergencia:Number(d.valorDivergencia || 0),
      valorTotalPedido:Number(recebimento.valorTotalPedido ?? totais.valorPedido),
      valorTotalRecebido:Number(recebimento.valorTotalRecebido ?? totais.valorRecebido),
      responsavelRecebimento:recebimento.responsavel || '',
      recebimentoIniciadoEm:recebimento.iniciadoEm || null,
      recebimentoFinalizadoEm:recebimento.finalizadoEm || null,
      criadoEm:existente?.criadoEm || now,
      atualizadoEm:now,
      canceladaAutomaticamente:false,
    };
    if (idx >= 0) rncs[idx] = base; else rncs.unshift(base);
  }
  rncs = rncs.map(r => {
    if (!r.autoGerada || r.pedidoId !== pedido.id || activeKeys.has(r.autoKey || `${pedido.id}::${r.produto}`)) return r;
    if (!['aberta','analise'].includes(r.status)) return r;
    return {
      ...r,
      status:'cancelada',
      canceladaAutomaticamente:true,
      motivoCancelamento:'Divergência removida após correção do recebimento.',
      canceladaEm:now,
      atualizadoEm:now,
      historicoStatus:[...(r.historicoStatus || []), { de:r.status, para:'cancelada', em:now, usuario }]
    };
  });
  return rncs;
}
function RecebimentoTab({ toast }) {
  const [view, setView] = useState('lista');
  const [pedidos, setPedidos] = useState(() => LS.get('pedidos') || []);
  const [editing, setEditing] = useState(null);
  const [fBusca, setFBusca] = useState(''); const [fOrig, setFOrig] = useState('TODOS'); const [fStatus, setFStatus] = useState('TODOS'); const [limit, setLimit] = useState(30);
  const abrirRecebimento = pedido => {
    let atual = pedido;
    if (pedido && !pedido.recebimento && !pedido.recebimentoInicioEm && !isWeekClosed(pedido.semana)) {
      atual = { ...pedido, recebimentoInicioEm:new Date().toISOString(), atualizadoEm:new Date().toISOString() };
      const upd = (LS.get('pedidos') || []).map(p => p.id === atual.id ? atual : p);
      if (LS.set('pedidos', upd)) setPedidos(upd);
    }
    if (atual) { setEditing(atual); setView('editor'); }
  };
  useEffect(() => { const openTarget=()=>{ const t=LS.get('openTarget'); if(t?.tab==='recebimento'){ const rec=(LS.get('pedidos')||[]).find(x=>x.id===t.id); if(rec) abrirRecebimento(rec); LS.del('openTarget'); } }; openTarget(); window.addEventListener('nx-open-target',openTarget); return()=>window.removeEventListener('nx-open-target',openTarget); }, []);
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
    const pedidosUpd = pedidos.map(p => p.id === pedido.id ? { ...p, status:'pendente', recebimentoInicioEm:null, recebimento:null, atualizadoEm:agora } : p);
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
    ${pedidos.length>0 && html`<${RecordsFilter} busca=${fBusca} setBusca=${resetLimit(setFBusca)} origem=${fOrig} setOrigem=${resetLimit(setFOrig)} status=${fStatus} setStatus=${resetLimit(setFStatus)} statusOpts=${[{v:'pendente',l:'Aguardando'},{v:'recebido',l:'Recebido'},{v:'parcial',l:'Com divergência'}]}/>`}
    ${pedidos.length===0 && html`<div class="empty"><${Ic} n="recv" s=${40} style=${{ color:'var(--s3)' }}/><p>Nenhum pedido disponível para recebimento.</p></div>`}
    ${pedidos.length>0 && filtrados.length===0 && html`<div class="empty"><p>Nenhum recebimento corresponde aos filtros.</p></div>`}
    ${pendAll.length > 0 && html`<span class="slbl">Aguardando (${pendAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>${pend.map(p => html`<${RCard} key=${p.id} p=${p} onClick=${() => abrirRecebimento(p)}/>`)}<${MoreResults} total=${pendAll.length} shown=${pend.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
    ${recAll.length > 0 && html`<span class="slbl">Finalizados (${recAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${rec.map(p => html`<${RCard} key=${p.id} p=${p} onClick=${() => abrirRecebimento(p)}/>`)}<${MoreResults} total=${recAll.length} shown=${rec.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
  </div>`;
}

function RCard({ p, onClick }) {
  const st = ST_PED[p.status] || { l:p.status, c:'bgy' };
  const rec = p.recebimento || {};
  const total = rec.valorTotalPedido ?? totaisRecebimento(p, rec.itens || []).valorPedido;
  const timing = rec.iniciadoEm && rec.finalizadoEm ? `${fHora(rec.iniciadoEm)}–${fHora(rec.finalizadoEm)} · ${duracaoEntre(rec.iniciadoEm,rec.finalizadoEm)}` : '';
  return html`<button class="card" style=${{padding:'14px 16px',display:'flex',alignItems:'center',gap:12,border:'none',textAlign:'left',width:'100%',cursor:'pointer'}} onClick=${onClick}>
    <div style=${{flex:1,minWidth:0}}><div class="row" style=${{gap:6,marginBottom:4}}><span class=${`badge ${st.c}`}>${st.l}</span><span class="badge bor">${p.origem}</span></div><div style=${{fontWeight:700,fontSize:14}}>${wLbl(p.semana)} · ${fMoeda(total)}</div><div style=${{fontSize:12,color:'var(--s2)',marginTop:2}}>${(p.itens||[]).length} produtos${rec.responsavel?` · ${rec.responsavel}`:''}</div>${timing&&html`<div style=${{fontSize:10,color:'var(--s3)',marginTop:3}}>${timing}</div>`}</div>
    <${Ic} n="cr" s=${16} style=${{color:'var(--s3)'}}/>
  </button>`;
}


function RecEditor({ pedido, toast, onBack, onSave, onDeleteReceipt }) {
  const finalizado = ['recebido', 'parcial'].includes(pedido.status);
  const rec = pedido.recebimento || {};
  const [resp, setResp] = useState(rec.responsavel || (LS.get('config') || {}).responsavel || '');
  const [obs, setObs] = useState(rec.observacoes || '');
  const [iniciadoEm] = useState(rec.iniciadoEm || pedido.recebimentoInicioEm || new Date().toISOString());
  const [qtdsR, setQtdsR] = useState(() => {
    const m = {};
    (pedido.itens || []).forEach(i => {
      const ri = (rec.itens || []).find(r => r.nome === i.nome);
      m[i.nome] = ri && ri.qtdRecebida != null ? String(ri.qtdRecebida) : '';
    });
    return m;
  });
  const [precosR, setPrecosR] = useState(() => {
    const m = {};
    (pedido.itens || []).forEach(i => {
      const ri = (rec.itens || []).find(r => r.nome === i.nome);
      const preco = precoItemRecebimento(i, ri);
      m[i.nome] = preco > 0 ? String(preco) : '';
    });
    return m;
  });
  const [abrirRncAuto, setAbrirRncAuto] = useState((LS.get('config') || {}).abrirRncDivergencia || 'perguntar');
  const itens = pedido.itens || [];
  const locked = isWeekClosed(pedido.semana);
  const previewItems = itens.map(i => ({ ...i, qtdRecebida:nonNeg(qtdsR[i.nome]), precoUnit:nonNeg(precosR[i.nome]) }));
  const totais = totaisRecebimento(pedido, previewItems);
  const divergencias = receiptDivergences(pedido, totais.itens);
  const corretos = Math.max(0, itens.length - divergencias.length);
  const finalizacaoPreview = rec.finalizadoEm || null;
  const snapshot = JSON.stringify({ resp, obs, qtdsR, precosR, abrirRncAuto });
  const guard = useDirtyGuard(snapshot);

  const finalizar = () => {
    if (!ensureWeekOpen(pedido.semana, toast, 'registrar o recebimento')) return;
    if (!resp.trim()) { toast.show('Informe o responsável pelo recebimento.'); return; }
    const semQtd = itens.filter(i => String(qtdsR[i.nome] ?? '').trim() === '');
    if (semQtd.length) {
      toast.show(`Informe a quantidade recebida de todos os produtos. Pendentes: ${semQtd.slice(0,2).map(i=>i.nome).join(', ')}${semQtd.length>2?'…':''}`);
      return;
    }
    const semPreco = itens.filter(i => nonNeg(precosR[i.nome]) <= 0);
    if (semPreco.length) {
      toast.show(`Informe o preço unitário de todos os produtos. Pendentes: ${semPreco.slice(0,2).map(i=>i.nome).join(', ')}${semPreco.length>2?'…':''}`);
      return;
    }

    const finalizadoEm = rec.finalizadoEm || new Date().toISOString();
    const iL = totais.itens.map(i => ({
      ...i,
      qtd:Number(i.qtd || 0),
      qtdRecebida:Number(i.qtdRecebida || 0),
      precoUnit:Number(i.precoUnit || 0),
      subtotalPedido:Number(i.subtotalPedido || 0),
      subtotalRecebido:Number(i.subtotalRecebido || 0),
    }));
    const divs = receiptDivergences(pedido, iL);
    const hasDiv = divs.length > 0;
    const receiptId = rec.id || uid();
    const recebimento = {
      ...rec,
      id:receiptId,
      data:rec.data || todayISO(finalizadoEm),
      responsavel:resp.trim(),
      observacoes:obs.trim(),
      itens:iL,
      iniciadoEm:rec.iniciadoEm || iniciadoEm,
      finalizadoEm,
      duracaoMinutos:Math.max(0, Math.round((new Date(finalizadoEm) - new Date(rec.iniciadoEm || iniciadoEm)) / 60000)),
      valorTotalPedido:Number(totais.valorPedido || 0),
      valorTotalRecebido:Number(totais.valorRecebido || 0),
      atualizadoEm:new Date().toISOString(),
      status:hasDiv ? 'divergente' : 'completo'
    };
    const ped = { ...pedido, status:hasDiv ? 'parcial' : 'recebido', recebimentoInicioEm:recebimento.iniciadoEm, recebimento, atualizadoEm:new Date().toISOString() };
    const atuais = LS.get('rncs') || [];
    const hasExistingAuto = atuais.some(r => r.autoGerada && r.pedidoId === pedido.id);
    let allowCreate = false;
    if (hasDiv) {
      if (hasExistingAuto || abrirRncAuto === 'sempre') allowCreate = true;
      else if (abrirRncAuto === 'perguntar') {
        const resumo = divs.map(d => `${d.nome}: ${d.diferenca < 0 ? 'falta' : 'excesso'} de ${Math.abs(d.diferenca)} ${d.unit || ''}`).join('\n');
        allowCreate = confirm(`O recebimento possui ${divs.length} produto(s) com divergência:

${resumo}

Deseja abrir uma RNC individual para cada produto divergente?`);
      }
    }
    const rncsUpd = syncAutoRncsForReceipt(pedido, recebimento, allowCreate);
    guard.clean();
    const msg = hasDiv
      ? (allowCreate ? `Recebimento finalizado com ${divs.length} divergência(s) e RNC(s) geradas.` : `Recebimento finalizado com ${divs.length} divergência(s).`)
      : 'Recebimento finalizado sem divergências.';
    onSave(ped, rncsUpd, msg);
  };

  return html`<div style=${{ maxWidth:'none', margin:'0 auto' }}>
    <div class="stk" style=${{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
      <button class="btn bg0 bic" onClick=${() => guard.leave(onBack)}><${Ic} n="left" s=${20}/></button>
      <div style=${{flex:1,minWidth:0}}><div style=${{fontWeight:800,fontSize:15,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Recebimento · ${pedido.origem}</div><div style=${{fontSize:12,color:'var(--s2)'}}>${wLbl(pedido.semana)} · ${itens.length} produto(s)</div></div>
      ${finalizado && !locked && html`<button class="btn brd bsm" onClick=${()=>{if(strongConfirm('Excluir recebimento')&&onDeleteReceipt(pedido))guard.clean();}}>Excluir recebimento</button>`}
    </div>
    ${locked && html`<div class="nx-lock-note">Esta semana está fechada. O recebimento está em modo somente leitura.</div>`}
    <div class="page" style=${{paddingBottom:110}}>
      <div class="card" style=${{padding:16,marginBottom:12}}>
        <div class="rec-summary-grid">
          <div class="rec-summary-field"><label>Responsável pelo recebimento</label><input class="inp" value=${resp} onInput=${e=>setResp(e.target.value)} placeholder="Nome do responsável" disabled=${locked}/></div>
          <div class="rec-summary-field"><label>Início do recebimento</label><div class="rec-readonly">${fDate(iniciadoEm)} · ${fHora(iniciadoEm)}</div></div>
          <div class="rec-summary-field"><label>Finalização</label><div class="rec-readonly">${rec.finalizadoEm ? `${fDate(rec.finalizadoEm)} · ${fHora(rec.finalizadoEm)}` : 'Será registrada ao finalizar'}</div></div>
          <div class="rec-summary-field"><label>Duração</label><div class="rec-readonly">${rec.finalizadoEm ? duracaoEntre(rec.iniciadoEm || iniciadoEm,rec.finalizadoEm) : 'Em andamento'}</div></div>
        </div>
      </div>

      <div class="rec-kpi-grid">
        <div class="card rec-kpi"><span>Valor do pedido</span><strong>${fMoeda(totais.valorPedido)}</strong></div>
        <div class="card rec-kpi"><span>Valor recebido</span><strong>${fMoeda(totais.valorRecebido)}</strong></div>
        <div class="card rec-kpi"><span>Produtos conformes</span><strong style=${{color:'var(--gr)'}}>${corretos}</strong></div>
        <div class="card rec-kpi"><span>Com divergência</span><strong style=${{color:divergencias.length?'var(--rd)':'var(--gr)'}}>${divergencias.length}</strong></div>
      </div>

      <div style=${{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
        ${totais.itens.map((item,idx)=>{
          const diff=Number(item.qtdRecebida||0)-Number(item.qtd||0);
          const meta=diff<0?{l:`Falta ${Math.abs(diff)} ${item.unit||''}`,c:'brd2'}:diff>0?{l:`Excesso ${diff} ${item.unit||''}`,c:'bam'}:{l:'Conforme',c:'bgr2'};
          return html`<div key=${item.nome} class="card rec-product-card" style=${{borderColor:diff<0?'rgba(220,38,38,.28)':diff>0?'rgba(217,119,6,.28)':'var(--bd)'}}>
            <div class="rec-product-head"><div><strong>${item.nome}</strong><small>${item.cat||''}${item.unit?` · ${item.unit}`:''}</small></div><span class=${`badge ${meta.c}`}>${meta.l}</span></div>
            <div class="rec-product-grid">
              <div><label>Qtd. pedida</label><div class="rec-metric">${item.qtd} ${item.unit||''}</div></div>
              <div><label>Qtd. recebida</label><div class="rec-input-wrap"><button class="btn bs bsm" disabled=${locked} onClick=${()=>setQtdsR(p=>({...p,[item.nome]:String(item.qtd)}))}>Tudo</button><input type="number" min="0" step="any" class="inp" value=${qtdsR[item.nome]??''} disabled=${locked} onInput=${e=>setQtdsR(p=>({...p,[item.nome]:e.target.value}))}/></div></div>
              <div><label>Preço unitário</label><input type="number" min="0" step="0.01" class="inp" value=${precosR[item.nome]??''} disabled=${locked} onInput=${e=>setPrecosR(p=>({...p,[item.nome]:e.target.value}))}/></div>
              <div><label>Total pedido</label><div class="rec-metric">${fMoeda(item.subtotalPedido)}</div></div>
              <div><label>Total recebido</label><div class="rec-metric">${fMoeda(item.subtotalRecebido)}</div></div>
            </div>
          </div>`;
        })}
      </div>

      <div class="card" style=${{padding:16,marginBottom:12}}>
        <label style=${{fontSize:11,fontWeight:700,color:'var(--s2)',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:6}}>RNC quando houver falta ou excesso</label>
        <select class="inp" value=${abrirRncAuto} disabled=${locked} onChange=${e=>{setAbrirRncAuto(e.target.value);const c=LS.get('config')||{};LS.set('config',{...c,abrirRncDivergencia:e.target.value});}} style=${{marginBottom:10}}>
          <option value="perguntar">Perguntar ao finalizar</option><option value="sempre">Abrir automaticamente</option><option value="nunca">Não abrir automaticamente</option>
        </select>
        <div style=${{fontSize:11,color:'var(--s2)',margin:'-4px 0 12px'}}>Ao finalizar, o NEXUS identifica faltas e excessos. Cada produto divergente pode gerar uma RNC própria, sem duplicar registros já existentes.</div>
        <label style=${{fontSize:11,fontWeight:700,color:'var(--s2)',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:6}}>Observações do recebimento</label>
        <textarea class="inp" value=${obs} disabled=${locked} onInput=${e=>setObs(e.target.value)} rows="4" placeholder="Condições da entrega, avarias, recusas ou outras observações importantes..."/>
      </div>
    </div>
    ${!locked&&html`<div style=${{position:'sticky',bottom:72,background:'#fff',borderTop:'1px solid var(--bd)',padding:'12px 16px'}}><button class="btn bgr" style=${{width:'100%',padding:14,borderRadius:12,fontSize:15}} onClick=${finalizar}><${Ic} n="chk" s=${16}/>${finalizado?'Salvar alterações do recebimento':'Finalizar recebimento'}</button></div>`}
  </div>`;
}


/* ══════════════════════════════════════
   RNC
══════════════════════════════════════ */
function RncTab({ toast }) {
  const [view, setView] = useState('lista');
  const [rncs, setRncs] = useState(() => LS.get('rncs') || []);
  const [editing, setEditing] = useState(null);
  const [fBusca, setFBusca] = useState(''); const [fOrig, setFOrig] = useState('TODOS'); const [fStatus, setFStatus] = useState('TODOS'); const [fUnidade, setFUnidade] = useState('TODAS'); const [limit, setLimit] = useState(30);
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
  const filtradas=rncs.filter(r=>(fOrig==='TODOS'||r.origem===fOrig)&&(fStatus==='TODOS'||r.status===fStatus)&&(fUnidade==='TODAS'||r.unidadeOrigem===fUnidade)&&(!term||`${r.numero||''} ${r.produto||''} ${r.fornecedor||''} ${r.responsavel||''} ${r.tipo||''} ${r.lote||''} ${r.notaFiscal||''} ${r.unidadeOrigem||''} ${r.setorIdentificacao||r.setor||''} ${r.etapaIdentificacao||''}`.toLowerCase().includes(term)));
  const abertasAll=filtradas.filter(r=>r.status==='aberta'||r.status==='analise').sort((a,b)=>new Date(b.data||0)-new Date(a.data||0));
  const resAll=filtradas.filter(r=>r.status==='resolvida'||r.status==='cancelada').sort((a,b)=>new Date(b.encerradoEm||b.atualizadoEm||b.data||0)-new Date(a.encerradoEm||a.atualizadoEm||a.data||0));
  const abertas=abertasAll.slice(0,limit), res=resAll.slice(0,limit);
  const resetLimit=fn=>v=>{fn(v);setLimit(30)};
  return html`<div class="page">
    <div class="row" style=${{ justifyContent: 'space-between', marginBottom: 16 }}>
      <div><h2 style=${{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", margin: 0 }}>RNC</h2><p style=${{ fontSize: 13, color: 'var(--s2)', margin: '2px 0 0' }}>Registros de Não Conformidade</p></div>
      <button class="btn bp bsm" onClick=${() => { setEditing(null); setView('editor'); }}><${Ic} n="plus" s=${14}/>Nova RNC</button>
    </div>
    ${rncs.length>0 && html`<${RecordsFilter} busca=${fBusca} setBusca=${resetLimit(setFBusca)} origem=${fOrig} setOrigem=${resetLimit(setFOrig)} status=${fStatus} setStatus=${resetLimit(setFStatus)} unidade=${fUnidade} setUnidade=${resetLimit(setFUnidade)} unidades=${getUnidades({includeInactive:true})} statusOpts=${[{v:'aberta',l:'Aberta'},{v:'analise',l:'Em acompanhamento'},{v:'resolvida',l:'Concluída'},{v:'cancelada',l:'Cancelada'}]}/>`}
    ${rncs.length === 0 && html`<div class="empty"><${Ic} n="rnc" s=${40} style=${{ color: 'var(--s3)' }}/><p>Nenhuma RNC registrada.</p><button class="btn bp" style=${{ marginTop: 8 }} onClick=${() => setView('editor')}><${Ic} n="plus" s=${16}/>Abrir RNC</button></div>`}
    ${rncs.length>0 && filtradas.length===0 && html`<div class="empty"><p>Nenhuma RNC corresponde aos filtros.</p></div>`}
    ${abertasAll.length > 0 && html`<span class="slbl">Em aberto (${abertasAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>${abertas.map(r => html`<${RncCard} key=${r.id} rnc=${r} onClick=${() => { setEditing(r); setView('editor'); }}/>`)}<${MoreResults} total=${abertasAll.length} shown=${abertas.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
    ${resAll.length > 0 && html`<span class="slbl">Concluídas / Canceladas (${resAll.length})</span><div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${res.map(r => html`<${RncCard} key=${r.id} rnc=${r} onClick=${() => { setEditing(r); setView('editor'); }}/>`)}<${MoreResults} total=${resAll.length} shown=${res.length} onMore=${()=>setLimit(v=>v+30)}/></div>`}
  </div>`;
}

function RncCard({ rnc, onClick }) {
  const st = ST_RNC[rnc.status] || { l: rnc.status, c: 'bgy' };
  return html`<button class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer', opacity: ['resolvida','cancelada'].includes(rnc.status) ? .85 : 1 }} onClick=${onClick}>
    <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span>${rnc.origem && html`<span class="badge bor">${rnc.origem}</span>`}</div><div style=${{ fontWeight: 700, fontSize: 14 }}>${rnc.numero}</div><div style=${{ fontSize: 12, color: 'var(--s2)', marginTop: 2 }}>${rnc.produto || '—'} · ${fDate(rnc.dataIdentificacao || rnc.data)}</div><div style=${{ fontSize: 10, color: 'var(--s3)', marginTop: 2 }}>${rnc.unidadeOrigem || 'Unidade não informada'}${rnc.etapaIdentificacao ? ` · ${rnc.etapaIdentificacao}` : ''}</div></div>
    <${Ic} n="cr" s=${16} style=${{ color: 'var(--s3)' }}/>
  </button>`;
}

function RncEditor({ rnc, allItems, toast, genNum, onBack, onSave, onDelete }) {
  const isEdit = !!rnc?.id;
  const config = LS.get('config') || {};
  const unidades = getUnidades();
  const unidadeInicial = rnc?.unidadeOrigem || config.unidadePadrao || unidades[0]?.nome || '';

  const [unidadeOrigem, setUnidadeOrigem] = useState(unidadeInicial);
  const [orig, setOrig] = useState(rnc?.origem || 'CD');
  const [setor, setSetor] = useState(rnc?.setorIdentificacao || rnc?.setor || '');
  const [etapaIdentificacao, setEtapaIdentificacao] = useState(rnc?.etapaIdentificacao || 'Durante a produção');
  const [data, setData] = useState(rnc?.dataIdentificacao || rnc?.data || todayISO());
  const [resp, setResp] = useState(rnc?.responsavel || config.responsavel || '');

  const [produto, setProduto] = useState(rnc?.produto || '');
  const [lote, setLote] = useState(rnc?.lote || '');
  const [fabricacao, setFabricacao] = useState(rnc?.dataManipulacaoFabricacao || rnc?.fabricacao || '');
  const [validade, setValidade] = useState(rnc?.validade || '');
  const [unit, setUnit] = useState(rnc?.unidade || 'UND');
  const [qtdAfetada, setQtdAfetada] = useState(String(rnc?.qtdAfetadaConfirmada ?? rnc?.qtdAfetadaInicial ?? rnc?.quantidade ?? ''));
  const [qtdDescartada, setQtdDescartada] = useState(String(rnc?.qtdDescartada ?? rnc?.qtdDescartadaDevolvida ?? rnc?.qtdRecusada ?? ''));
  const [qtdObservacao, setQtdObservacao] = useState(String(rnc?.qtdEmObservacao ?? rnc?.qtdSobObservacao ?? ''));
  const [gravidade, setGravidade] = useState(rnc?.gravidade || 'Média');

  const [tipo, setTipo] = useState(rnc?.tipo || '');
  const [tipoCustom, setTipoCustom] = useState(rnc?.tipoCustom || '');
  const [desc, setDesc] = useState(rnc?.descricao || '');
  const [abrangencia, setAbrangencia] = useState(rnc?.abrangencia || 'Abrangência ainda não determinada');
  const [riscos, setRiscos] = useState(Array.isArray(rnc?.riscos) ? rnc.riscos : (rnc?.riscoOcorrencia ? [rnc.riscoOcorrencia] : []));
  const [contencoes, setContencoes] = useState(Array.isArray(rnc?.contencoes) ? rnc.contencoes : (rnc?.contencao ? [rnc.contencao] : []));
  const [impactoOperacional, setImpactoOperacional] = useState(rnc?.impactoOperacional || '');

  const providenciaInicial = rnc?.providenciaSolicitada || rnc?.providenciaFornecedor || [rnc?.acao, rnc?.obsAcao].filter(Boolean).join(' — ');
  const situacaoInicial = rnc?.situacaoAtual || rnc?.medidaRealizada || rnc?.respostaFornecedor || (rnc?.status === 'resolvida' ? 'RNC concluída.' : 'Aguardando resposta do fornecedor.');
  const [providencia, setProvidencia] = useState(providenciaInicial || '');
  const [status, setStatus] = useState(rnc?.status || 'aberta');
  const [situacaoAtual, setSituacaoAtual] = useState(situacaoInicial);

  const [fotos, setFotos] = useState(Array.isArray(rnc?.fotos) ? rnc.fotos : []);
  const fotoRef = useRef(null);

  const TIPOS = [
    'Produto fora do prazo', 'Produto com avaria', 'Quantidade incorreta', 'Produto fora do padrão de qualidade',
    'Temperatura inadequada', 'Embalagem danificada', 'Alteração de odor, cor ou textura', 'Outro (descrever)'
  ];
  const ETAPAS = ['Recebimento', 'Armazenamento', 'Descongelamento', 'Pré-preparo', 'Durante a produção', 'Durante o serviço', 'Outro'];
  const ABRANGENCIAS = ['Uma unidade isolada', 'Algumas unidades do mesmo lote', 'Lote parcialmente comprometido', 'Todo o lote', 'Abrangência ainda não determinada'];
  const RISCOS = ['Qualidade sensorial', 'Segurança alimentar', 'Perda financeira', 'Interrupção operacional', 'Reclamação de cliente', 'Risco ainda não avaliado'];
  const CONTENCOES = ['Uso interrompido', 'Produto segregado', 'Lote bloqueado', 'Produto descartado', 'Produto mantido para análise', 'Amostra preservada', 'Equipe orientada', 'Nenhuma contenção necessária'];
  const STATUS_OPTS = [
    { v:'aberta', l:'Aberta', desc:'Aguardando resposta ou providência do fornecedor', c:'brd2' },
    { v:'analise', l:'Em acompanhamento', desc:'O fornecedor respondeu e a providência ainda está pendente', c:'bam' },
    { v:'resolvida', l:'Concluída', desc:'A troca, o crédito ou a correção foi efetivamente realizada', c:'bgr2' },
    { v:'cancelada', l:'Cancelada', desc:'Registro encerrado sem prosseguimento', c:'bgy' },
  ];

  const itemsOrig = allItems.filter(i => i.orig === orig);
  const produtosDisponiveis = [...new Map(itemsOrig.map(i => [i.name, i])).values()];
  const aplicarProduto = nome => {
    setProduto(nome);
    const item = allItems.find(i => i.name === nome);
    if (item?.unit) setUnit(item.unit);
  };

  const toggleArray = (value, setter) => setter(list => list.includes(value) ? list.filter(x => x !== value) : [...list, value]);

  const compressImage = (file, cb) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast.show('A imagem excede 12 MB.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const max = 1000;
        let w = img.width, h = img.height;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        if (h > max) { w = Math.round(w * max / h); h = max; }
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        let data = c.toDataURL('image/webp', .7);
        if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', .7);
        const projectedMb = storageUsage().mb + data.length * 2 / 1024 / 1024;
        if (projectedMb > 4.5) { toast.show('Armazenamento local quase cheio. Exporte um backup antes de adicionar mais fotos.'); return; }
        cb(data);
      };
      img.onerror = () => toast.show('Não foi possível processar a imagem.');
      img.src = e.target.result;
    };
    reader.onerror = () => toast.show('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  };
  const addFoto = file => {
    if (fotos.length >= 3) { toast.show('Limite de 3 fotos por RNC.'); return; }
    compressImage(file, data => setFotos(prev => [...prev, data].slice(0, 3)));
  };

  const tipoFinal = tipo === 'Outro (descrever)' ? tipoCustom.trim() : tipo;
  const semanaRegistro = rnc?.semana || dateToWeek(data);
  const locked = isWeekClosed(semanaRegistro);
  const camposObrigatoriosOk = !!(
    unidadeOrigem && orig && setor.trim() && etapaIdentificacao && data && resp.trim() &&
    produto.trim() && nonNeg(qtdAfetada) > 0 && gravidade && tipoFinal && desc.trim() &&
    abrangencia && riscos.length && contencoes.length && impactoOperacional.trim() &&
    providencia.trim() && situacaoAtual.trim()
  );

  const snapshot = JSON.stringify({ unidadeOrigem, orig, setor, etapaIdentificacao, data, resp, produto, lote, fabricacao, validade, unit, qtdAfetada, qtdDescartada, qtdObservacao, gravidade, tipo, tipoCustom, desc, abrangencia, riscos, contencoes, impactoOperacional, providencia, status, situacaoAtual, fotos });
  const guard = useDirtyGuard(snapshot);

  const salvar = () => {
    if (!ensureWeekOpen(semanaRegistro, toast, 'salvar a RNC')) return;
    if (!camposObrigatoriosOk) { toast.show('Preencha os campos obrigatórios da RNC.'); return; }
    const agora = new Date().toISOString();
    const hist = Array.isArray(rnc?.historicoStatus) ? rnc.historicoStatus : [];
    const historicoStatus = (!rnc || rnc.status !== status)
      ? [...hist, { de:rnc?.status || null, para:status, em:agora, usuario:resp.trim() || 'Usuário local' }]
      : (hist.length ? hist : [{ de:null, para:status, em:rnc?.criadoEm || agora, usuario:resp.trim() || 'Usuário local' }]);
    guard.clean();
    onSave({
      ...(rnc || {}),
      id: rnc?.id || uid(),
      numero: rnc?.numero || genNum(orig),
      data,
      dataIdentificacao: data,
      semana: semanaRegistro,
      unidadeOrigem,
      origem: orig,
      setor: setor.trim(),
      setorIdentificacao: setor.trim(),
      etapaIdentificacao,
      responsavel: resp.trim(),
      produto: produto.trim(),
      lote: lote.trim(),
      fabricacao,
      dataManipulacaoFabricacao: fabricacao,
      validade,
      unidade: unit,
      quantidade: nonNeg(qtdAfetada),
      qtdAfetadaInicial: nonNeg(qtdAfetada),
      qtdAfetadaConfirmada: nonNeg(qtdAfetada),
      qtdDescartada: nonNeg(qtdDescartada),
      qtdDescartadaDevolvida: nonNeg(qtdDescartada),
      qtdRecusada: nonNeg(qtdDescartada),
      qtdEmObservacao: nonNeg(qtdObservacao),
      qtdSobObservacao: nonNeg(qtdObservacao),
      gravidade,
      tipo: tipoFinal,
      tipoCustom,
      descricao: desc.trim(),
      abrangencia,
      riscos,
      contencoes,
      impactoOperacional: impactoOperacional.trim(),
      providenciaSolicitada: providencia.trim(),
      providenciaFornecedor: providencia.trim(),
      acao: providencia.trim(),
      obsAcao: '',
      situacaoAtual: situacaoAtual.trim(),
      respostaFornecedor: situacaoAtual.trim(),
      medidaRealizada: status === 'resolvida' ? situacaoAtual.trim() : '',
      status,
      encerradoEm: status === 'resolvida' ? (rnc?.encerradoEm || agora) : null,
      historicoStatus,
      fotos,
      criadoEm: rnc?.criadoEm || agora,
      atualizadoEm: agora,
    });
  };

  const labelObrig = txt => html`<label class="rnc-label">${txt}<span>*</span></label>`;
  const labelOpt = txt => html`<label class="rnc-label">${txt}</label>`;
  const chip = (text, active, onClick) => html`<button type="button" onClick=${onClick} class=${`rnc-simple-chip ${active ? 'on' : ''}`}>${text}</button>`;
  const stStat = ST_RNC[status] || { l:status, c:'bgy' };

  return html`<div class="rnc-simple-shell">
    <div class="stk rnc-editor-header">
      <button class="btn bg0 bic" onClick=${()=>guard.leave(onBack)}><${Ic} n="left" s=${20}/></button>
      <div style=${{flex:1,minWidth:0}}>
        <div class="row" style=${{gap:6,marginBottom:3,flexWrap:'wrap'}}><span class=${`badge ${stStat.c}`}>${stStat.l}</span><span class="badge bor">${orig}</span>${unidadeOrigem&&html`<span class="badge bgy">${unidadeOrigem}</span>`}</div>
        <div style=${{fontWeight:800,fontSize:16}}>${isEdit ? rnc.numero : 'Nova RNC'}</div>
        <div style=${{fontSize:11,color:'var(--s2)'}}>Registro de Não Conformidade</div>
      </div>
      ${isEdit&&!locked&&html`<button class="btn bg0 bic" style=${{color:'var(--rd)'}} onClick=${()=>{if(strongConfirm('Excluir registro'))onDelete(rnc.id)}}><${Ic} n="trash" s=${18}/></button>`}
    </div>

    ${locked&&html`<div class="nx-lock-note">Esta semana está fechada. A RNC está em modo somente leitura.</div>`}

    <fieldset disabled=${locked} class="page rnc-simple-page" style=${{pointerEvents:locked?'none':'auto',opacity:locked?.82:1}}>
      <section class="card rnc-simple-section">
        <div class="rnc-simple-title"><span>1</span><div><strong>Identificação da RNC</strong><small>Onde, quando e por quem a ocorrência foi identificada.</small></div></div>
        <div class="rnc-grid rnc-grid-2">
          <div>${labelObrig('Unidade de origem da RNC')}<select class="inp" value=${unidadeOrigem} onChange=${e=>setUnidadeOrigem(e.target.value)}><option value="">Selecione</option>${unidades.map(u=>html`<option key=${u.id} value=${u.nome}>${u.nome}</option>`)}</select></div>
          <div>${labelObrig('Origem do produto')}<select class="inp" value=${orig} onChange=${e=>setOrig(e.target.value)}><option value="CD">CD · Centro de Distribuição</option><option value="CP">CP · Cozinha de Produção</option></select></div>
          <div>${labelObrig('Setor que identificou')}<input class="inp" value=${setor} onInput=${e=>setSetor(e.target.value)} placeholder="Ex.: Cozinha, estoque, bar..."/></div>
          <div>${labelObrig('Etapa da identificação')}<select class="inp" value=${etapaIdentificacao} onChange=${e=>setEtapaIdentificacao(e.target.value)}>${ETAPAS.map(x=>html`<option>${x}</option>`)}</select></div>
          <div>${labelObrig('Data da identificação')}<input type="date" class="inp" value=${data} onInput=${e=>setData(e.target.value)}/></div>
          <div>${labelObrig('Responsável pelo registro')}<input class="inp" value=${resp} onInput=${e=>setResp(e.target.value)} placeholder="Nome completo"/></div>
        </div>
      </section>

      <section class="card rnc-simple-section">
        <div class="rnc-simple-title"><span>2</span><div><strong>Produto e quantidades</strong><small>Dados necessários para identificar e dimensionar a ocorrência.</small></div></div>
        <div class="rnc-grid rnc-grid-2">
          <div class="rnc-field-span-2">${labelObrig('Produto')}<input class="inp" list="rnc-produtos" value=${produto} onInput=${e=>aplicarProduto(e.target.value)} placeholder="Selecione ou digite o produto"/><datalist id="rnc-produtos">${produtosDisponiveis.map(i=>html`<option value=${i.name}/>` )}</datalist></div>
          <div>${labelOpt('Lote')}<input class="inp" value=${lote} onInput=${e=>setLote(e.target.value)} placeholder="Código do lote"/></div>
          <div>${labelOpt('Data de manipulação/fabricação')}<input type="date" class="inp" value=${fabricacao} onInput=${e=>setFabricacao(e.target.value)}/></div>
          <div>${labelOpt('Validade')}<input type="date" class="inp" value=${validade} onInput=${e=>setValidade(e.target.value)}/></div>
          <div>${labelObrig('Gravidade')}<select class="inp" value=${gravidade} onChange=${e=>setGravidade(e.target.value)}>${['Baixa','Média','Alta','Crítica'].map(g=>html`<option>${g}</option>`)}</select></div>
        </div>
        <div class="rnc-quantity-grid">
          <div>${labelObrig('Quantidade afetada confirmada')}<input type="number" min="0" step="any" class="inp" value=${qtdAfetada} onInput=${e=>setQtdAfetada(e.target.value)}/></div>
          <div>${labelOpt('Quantidade descartada')}<input type="number" min="0" step="any" class="inp" value=${qtdDescartada} onInput=${e=>setQtdDescartada(e.target.value)}/></div>
          <div>${labelOpt('Quantidade em observação')}<input type="number" min="0" step="any" class="inp" value=${qtdObservacao} onInput=${e=>setQtdObservacao(e.target.value)}/></div>
          <div>${labelObrig('Unidade de medida')}<select class="inp" value=${unit} onChange=${e=>setUnit(e.target.value)}>${['UND','KG','G','L','ML','PCT','CX','PCS'].map(u=>html`<option>${u}</option>`)}</select></div>
        </div>
      </section>

      <section class="card rnc-simple-section">
        <div class="rnc-simple-title"><span>3</span><div><strong>Não conformidade</strong><small>Defina o problema e descreva objetivamente o que foi encontrado.</small></div></div>
        ${labelObrig('Não conformidade identificada')}
        <div class="rnc-chip-grid">${TIPOS.map(t=>chip(t,tipo===t,()=>setTipo(t)))}</div>
        ${tipo==='Outro (descrever)'&&html`<input class="inp" value=${tipoCustom} onInput=${e=>setTipoCustom(e.target.value)} placeholder="Descreva o tipo de não conformidade" style=${{marginTop:10}}/>`}
        <div style=${{marginTop:14}}>${labelObrig('Descrição da ocorrência')}<textarea class="inp rnc-large-text" rows="5" value=${desc} onInput=${e=>setDesc(e.target.value)} placeholder="Descreva como o problema foi percebido e quais características estavam fora do padrão."/></div>
      </section>

      <section class="card rnc-simple-section">
        <div class="rnc-simple-title"><span>4</span><div><strong>Avaliação e contenção</strong><small>Registre a abrangência, o risco e as medidas imediatas tomadas pela unidade.</small></div></div>
        <div>${labelObrig('Abrangência')}<select class="inp" value=${abrangencia} onChange=${e=>setAbrangencia(e.target.value)}>${ABRANGENCIAS.map(x=>html`<option>${x}</option>`)}</select></div>
        <div class="rnc-subgroup">${labelObrig('Risco identificado')}<div class="rnc-chip-grid">${RISCOS.map(x=>chip(x,riscos.includes(x),()=>toggleArray(x,setRiscos)))}</div></div>
        <div class="rnc-subgroup">${labelObrig('Contenção realizada pela unidade')}<div class="rnc-chip-grid">${CONTENCOES.map(x=>chip(x,contencoes.includes(x),()=>toggleArray(x,setContencoes)))}</div></div>
      </section>

      <section class="card rnc-simple-section">
        <div class="rnc-simple-title"><span>5</span><div><strong>Impacto e providência</strong><small>Informe o efeito na operação e o que foi solicitado ao fornecedor.</small></div></div>
        ${labelObrig('Impacto operacional')}<textarea class="inp rnc-large-text" rows="4" value=${impactoOperacional} onInput=${e=>setImpactoOperacional(e.target.value)} placeholder="Ex.: item indisponível, produção interrompida, risco ao serviço ou sem impacto no atendimento."/>
        <div style=${{marginTop:14}}>${labelObrig('Providência solicitada ao fornecedor')}<textarea class="inp rnc-large-text" rows="4" value=${providencia} onInput=${e=>setProvidencia(e.target.value)} placeholder="Ex.: substituir as unidades afetadas, conceder crédito ou avaliar a ocorrência e retornar."/></div>
      </section>

      <section class="card rnc-simple-section">
        <div class="rnc-simple-title"><span>6</span><div><strong>Situação atual</strong><small>Atualize este mesmo registro conforme o retorno e a providência do fornecedor.</small></div></div>
        <div class="rnc-grid rnc-grid-2">
          <div>${labelObrig('Status')}<select class="inp" value=${status} onChange=${e=>setStatus(e.target.value)}>${STATUS_OPTS.map(s=>html`<option value=${s.v}>${s.l}</option>`)}</select><div class="rnc-inline-help">${STATUS_OPTS.find(s=>s.v===status)?.desc}</div></div>
          <div>${labelObrig('Situação atual da RNC')}<textarea class="inp" rows="4" value=${situacaoAtual} onInput=${e=>setSituacaoAtual(e.target.value)} placeholder="Ex.: aguardando retorno; troca agendada; crédito confirmado; unidades substituídas."/></div>
        </div>
      </section>

      <section class="card rnc-simple-section">
        <div class="rnc-simple-title"><span>7</span><div><strong>Imagens da ocorrência</strong><small>Adicione até três evidências. As imagens serão incluídas em páginas próprias no PDF.</small></div></div>
        <div class="row" style=${{justifyContent:'space-between',marginBottom:12,flexWrap:'wrap'}}><span style=${{fontSize:12,color:'var(--s2)'}}>${fotos.length}/3 imagens anexadas</span><button type="button" class="btn bs bsm" disabled=${fotos.length>=3} onClick=${()=>fotoRef.current?.click()}><${Ic} n="img" s=${14}/>Adicionar imagem</button></div>
        <input ref=${fotoRef} type="file" accept="image/*" capture="environment" style=${{display:'none'}} onChange=${e=>{addFoto(e.target.files?.[0]);e.target.value=''}}/>
        ${fotos.length ? html`<div class="rnc-photo-grid">${fotos.map((f,i)=>html`<div class="rnc-photo-item"><img src=${f}/><button type="button" onClick=${()=>setFotos(p=>p.filter((_,j)=>j!==i))}><${Ic} n="x" s=${12}/></button></div>`)}</div>` : html`<div class="rnc-photo-empty">Nenhuma imagem anexada.</div>`}
      </section>
    </fieldset>

    ${!locked&&html`<div class="rnc-editor-actions"><button class="btn bs" onClick=${()=>guard.leave(onBack)}>Cancelar</button><button class="btn bp" style=${{flex:1,padding:14,opacity:camposObrigatoriosOk?1:.58}} onClick=${salvar}><${Ic} n="save" s=${16}/>${isEdit?'Salvar alterações':'Registrar RNC'}</button></div>`}
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
  const Doc=getJsPDF();
  const doc=new Doc({ orientation:'l', unit:'mm', format:'a4' });
  const rec=p.recebimento || {};
  const pageW=297,pageH=210,M=12;
  const totais=totaisRecebimento(p,rec.itens||[]);
  const divergencias=receiptDivergences(p,totais.itens);
  const iniciado=rec.iniciadoEm||'';
  const finalizado=rec.finalizadoEm||'';

  const header=()=>{
    doc.setFillColor(245,149,0);doc.rect(0,0,pageW,20,'F');
    doc.setTextColor(255,255,255);doc.setFont(undefined,'bold');doc.setFontSize(14);doc.text('NEXUS · RECEBIMENTO',M,9);
    doc.setFont(undefined,'normal');doc.setFontSize(8);doc.text(`Grupo Ilha · ${p.origem||'—'} · ${wLbl(p.semana)}`,M,15);
    doc.setTextColor(17,24,39);doc.setFont(undefined,'bold');doc.setFontSize(13);doc.text('RELATÓRIO DE RECEBIMENTO',M,29);
    const status=p.status==='parcial'?'COM DIVERGÊNCIA':'RECEBIDO';
    doc.setFillColor(p.status==='parcial'?255:240,p.status==='parcial'?251:253,p.status==='parcial'?235:244);
    doc.setDrawColor(p.status==='parcial'?217:22,p.status==='parcial'?119:163,p.status==='parcial'?6:74);
    doc.roundedRect(pageW-M-48,23,48,8,4,4,'FD');
    doc.setTextColor(p.status==='parcial'?217:22,p.status==='parcial'?119:163,p.status==='parcial'?6:74);doc.setFontSize(7);doc.text(status,pageW-M-24,28.2,{align:'center'});
  };
  header();

  const summary=[
    ['Responsável',rec.responsavel||'—'],
    ['Início',iniciado?`${fDate(iniciado)} · ${fHora(iniciado)}`:'—'],
    ['Finalização',finalizado?`${fDate(finalizado)} · ${fHora(finalizado)}`:'—'],
    ['Duração',duracaoEntre(iniciado,finalizado)||'—'],
    ['Valor do pedido',fMoeda(rec.valorTotalPedido??totais.valorPedido)],
    ['Valor recebido',fMoeda(rec.valorTotalRecebido??totais.valorRecebido)],
  ];
  const sw=(pageW-M*2)/summary.length;
  summary.forEach(([label,value],i)=>{
    const x=M+i*sw;
    doc.setFillColor(249,250,251);doc.setDrawColor(229,231,235);doc.roundedRect(x,35,sw-2,15,2,2,'FD');
    doc.setTextColor(113,113,122);doc.setFont(undefined,'bold');doc.setFontSize(5.7);doc.text(label.toUpperCase(),x+3.5,40);
    doc.setTextColor(24,24,27);doc.setFont(undefined,'normal');doc.setFontSize(7.6);doc.text(doc.splitTextToSize(String(value),sw-7).slice(0,2),x+3.5,45);
  });

  const body=totais.itens.map(i=>[
    i.nome||'',i.unit||'',Number(i.qtd||0),Number(i.qtdRecebida||0),Number(i.qtdRecebida||0)-Number(i.qtd||0),fMoeda(i.precoUnit||0),fMoeda(i.subtotalPedido||0),fMoeda(i.subtotalRecebido||0)
  ]);
  if(doc.autoTable){
    doc.autoTable({
      startY:55,
      head:[['Produto','Unid.','Qtd. pedida','Qtd. recebida','Diferença','Preço unit.','Total pedido','Total recebido']],
      body,
      styles:{fontSize:7.3,cellPadding:2.1,valign:'middle'},
      headStyles:{fillColor:[245,149,0],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[249,250,251]},
      columnStyles:{0:{cellWidth:72},1:{cellWidth:15,halign:'center'},2:{cellWidth:23,halign:'right'},3:{cellWidth:25,halign:'right'},4:{cellWidth:21,halign:'right'},5:{cellWidth:29,halign:'right'},6:{cellWidth:31,halign:'right'},7:{cellWidth:33,halign:'right'}},
      margin:{left:M,right:M},
      didParseCell:data=>{if(data.section==='body'&&data.column.index===4){const v=Number(data.cell.raw||0);if(v<0){data.cell.styles.textColor=[220,38,38];data.cell.styles.fontStyle='bold';}else if(v>0){data.cell.styles.textColor=[217,119,6];data.cell.styles.fontStyle='bold';}}}
    });
  }
  let y=(doc.lastAutoTable?.finalY||60)+7;
  const box=(title,text,x,w,color=[245,149,0])=>{
    const lines=doc.splitTextToSize(String(text||'—'),w-8);
    const h=Math.max(18,10+lines.length*4);
    if(y+h>pageH-18){doc.addPage();header();y=35;}
    doc.setFillColor(255,255,255);doc.setDrawColor(229,231,235);doc.roundedRect(x,y,w,h,2,2,'FD');
    doc.setFillColor(...color);doc.roundedRect(x,y,2,h,.8,.8,'F');
    doc.setTextColor(113,113,122);doc.setFont(undefined,'bold');doc.setFontSize(6);doc.text(title.toUpperCase(),x+5,y+5);
    doc.setTextColor(24,24,27);doc.setFont(undefined,'normal');doc.setFontSize(8);doc.text(lines,x+5,y+10);
    return h;
  };
  const obs=String(rec.observacoes||'').trim()||'Sem observações registradas.';
  const divText=divergencias.length?divergencias.map(d=>`${d.nome}: ${d.diferenca<0?'falta':'excesso'} de ${Math.abs(d.diferenca)} ${d.unit||''} · ${fMoeda(d.valorDivergencia||0)}`).join('\n'):'Nenhuma divergência identificada.';
  const leftW=(pageW-M*2-5)*.52,rightW=(pageW-M*2-5)-leftW;
  const h1=box('Observações do recebimento',obs,M,leftW,[245,149,0]);
  const h2=box('Resumo das divergências',divText,M+leftW+5,rightW,divergencias.length?[220,38,38]:[22,163,74]);
  y+=Math.max(h1,h2)+4;

  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);doc.setDrawColor(229,231,235);doc.line(M,pageH-11,pageW-M,pageH-11);
    doc.setTextColor(156,163,175);doc.setFontSize(6.5);doc.setFont(undefined,'normal');
    doc.text(`Pedido ${p.id||'—'} · ${p.origem||'—'} · ${wLbl(p.semana)}`,M,pageH-6.5);
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')} · Página ${i}/${pages}`,pageW-M,pageH-6.5,{align:'right'});
  }
  doc.save(`NEXUS_Recebimento_${p.origem||''}_${p.semana||''}`.replace(/[\/:*?"<>|]+/g,'_')+'.pdf');
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
        _rncLogoCache = { data:c.toDataURL('image/png'), w:img.naturalWidth, h:img.naturalHeight };
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
  const doc = new Doc({ orientation:'p', unit:'mm', format:'a4' });
  const pageW = 210, pageH = 297, M = 13, CW = pageW - M * 2;
  const footerY = pageH - 14;
  const contentBottom = footerY - 6;

  const OR=[245,149,0], OR_D=[190,111,0], OR_BG=[255,249,240];
  const INK=[24,24,27], S1=[82,82,91], S2=[113,113,122], S3=[161,161,170];
  const BD=[226,226,232], BG=[249,250,251], RD=[220,38,38], RD_BG=[254,242,242];
  const AM=[217,119,6], AM_BG=[255,251,235], GR=[22,163,74], GR_BG=[240,253,244];

  const statusMeta = {
    aberta:{label:'ABERTA',color:RD,fill:RD_BG},
    analise:{label:'EM ACOMPANHAMENTO',color:AM,fill:AM_BG},
    resolvida:{label:'CONCLUÍDA',color:GR,fill:GR_BG},
    cancelada:{label:'CANCELADA',color:S2,fill:BG},
  }[r.status] || {label:String(r.status||'SEM STATUS').toUpperCase(),color:S2,fill:BG};

  const numStr = r.numero || '—';
  const normalize = (v, fallback='—') => v == null || String(v).trim()==='' ? fallback : String(v).trim();
  const providencia = normalize(r.providenciaSolicitada || r.providenciaFornecedor || [r.acao,r.obsAcao].filter(Boolean).join(' — '));
  const situacao = normalize(r.situacaoAtual || r.medidaRealizada || r.respostaFornecedor, 'Aguardando resposta do fornecedor.');
  const qtdAfetada = Number(r.qtdAfetadaConfirmada ?? r.quantidade ?? 0);
  const qtdDescartada = Number(r.qtdDescartada ?? r.qtdDescartadaDevolvida ?? r.qtdRecusada ?? 0);
  const qtdObservacao = Number(r.qtdEmObservacao ?? r.qtdSobObservacao ?? 0);
  const fabricacao = r.dataManipulacaoFabricacao || r.fabricacao;

  let y = 32;
  const newPage = context => { doc.addPage(); drawHeader(context || 'Continuação do registro'); y = 32; };
  const ensure = (h, context) => { if (y + h > contentBottom) newPage(context); };

  function drawHeader(context='Documento de ocorrência e acompanhamento') {
    doc.setFillColor(255,255,255); doc.rect(0,0,pageW,28,'F');
    doc.setFillColor(...OR); doc.rect(0,0,pageW,3,'F');
    const lx=M, ly=7, lw=24, lh=14;
    doc.setFillColor(...OR); doc.roundedRect(lx,ly,lw,lh,2.2,2.2,'F');
    if (logo?.data) {
      const ratio=logo.w&&logo.h?logo.w/logo.h:1.7; let w=20.5,h=w/ratio;
      if(h>10.5){h=10.5;w=h*ratio;}
      try{doc.addImage(logo.data,'PNG',lx+(lw-w)/2,ly+(lh-h)/2,w,h);}catch(e){}
    }
    const tx=M+29;
    doc.setTextColor(...INK); doc.setFont(undefined,'bold'); doc.setFontSize(11.5);
    doc.text('REGISTRO DE NÃO CONFORMIDADE',tx,12.7);
    doc.setFont(undefined,'normal'); doc.setFontSize(7); doc.setTextColor(...S2);
    doc.text(context,tx,17.3); doc.text('Grupo Ilha · Gestão Operacional NEXUS',tx,21.2);
    const bw=49,bx=pageW-M-bw,by=7;
    doc.setFillColor(255,255,255); doc.setDrawColor(...BD); doc.roundedRect(bx,by,bw,15,2,2,'FD');
    doc.setTextColor(...S2); doc.setFont(undefined,'bold'); doc.setFontSize(5.6); doc.text('DOCUMENTO',bx+4,by+4);
    doc.setTextColor(...INK); doc.setFontSize(8.7); doc.text(String(numStr),bx+4,by+8.5);
    doc.setFillColor(...statusMeta.fill); doc.setDrawColor(...statusMeta.color); doc.roundedRect(bx+4,by+9.6,bw-8,3.8,1.9,1.9,'FD');
    doc.setTextColor(...statusMeta.color); doc.setFontSize(statusMeta.label.length>16?5:6); doc.text(statusMeta.label,bx+bw/2,by+12.3,{align:'center'});
    doc.setDrawColor(...BD); doc.line(M,26,pageW-M,26);
  }

  function section(title) {
    ensure(7);
    doc.setFillColor(...OR); doc.roundedRect(M,y-3,1.8,5.8,.8,.8,'F');
    doc.setTextColor(...INK); doc.setFont(undefined,'bold'); doc.setFontSize(9.4); doc.text(title,M+4.5,y+.1);
    const lineX=Math.min(pageW-M-5,M+4.5+doc.getTextWidth(title)+4);
    doc.setDrawColor(...BD); doc.line(lineX,y-.2,pageW-M,y-.2); y+=4.2;
  }

  function grid(fields, cols=2, options={}) {
    const colW=CW/cols, rows=[];
    for(let i=0;i<fields.length;i+=cols) rows.push(fields.slice(i,i+cols));
    const rowHeights=rows.map(row=>Math.max(options.minRowH||10.5,...row.map(it=>{
      const lines=doc.splitTextToSize(normalize(it[1]),colW-9).slice(0,options.maxLines||3);
      return 6.4+lines.length*3.25;
    })));
    const h=4+rowHeights.reduce((a,b)=>a+b,0); ensure(h+3,options.context);
    doc.setFillColor(...(options.fill||[255,255,255])); doc.setDrawColor(...BD); doc.setLineWidth(.2); doc.roundedRect(M,y,CW,h,1.7,1.7,'FD');
    let yy=y+4;
    rows.forEach((row,ri)=>{
      row.forEach((it,ci)=>{
        const x=M+ci*colW+4;
        doc.setTextColor(...S2); doc.setFont(undefined,'bold'); doc.setFontSize(options.labelSize||5.4); doc.text(String(it[0]).toUpperCase(),x,yy);
        doc.setTextColor(...(it[2]||INK)); doc.setFont(undefined,it[3]?'bold':'normal'); doc.setFontSize(it[4]||options.valueSize||8);
        doc.text(doc.splitTextToSize(normalize(it[1]),colW-9).slice(0,options.maxLines||3),x,yy+3.4);
      });
      yy+=rowHeights[ri];
      if(ri<rows.length-1){doc.setDrawColor(...BD);doc.line(M+3,yy-2.2,M+CW-3,yy-2.2);}
    });
    y+=h+3;
  }

  function textBox(label,value,options={}) {
    const lines=doc.splitTextToSize(normalize(value),CW-11);
    const h=Math.max(options.minH||12,7.9+lines.length*3.55); ensure(h+3,options.context);
    doc.setFillColor(...(options.fill||[255,255,255])); doc.setDrawColor(...(options.border||BD)); doc.setLineWidth(.2); doc.roundedRect(M,y,CW,h,1.7,1.7,'FD');
    if(options.accent){doc.setFillColor(...options.accent);doc.roundedRect(M,y,1.8,h,.8,.8,'F');}
    doc.setTextColor(...S2);doc.setFont(undefined,'bold');doc.setFontSize(5.7);doc.text(label.toUpperCase(),M+5,y+4.4);
    doc.setTextColor(...(options.textColor||INK));doc.setFont(undefined,options.bold?'bold':'normal');doc.setFontSize(options.size||8.4);doc.text(lines,M+5,y+7.9);
    y+=h+3;
  }

  function badge(text,color,fill) {
    const w=Math.min(CW,doc.getTextWidth(text)+12); ensure(7.5);
    doc.setFillColor(...fill);doc.setDrawColor(...color);doc.roundedRect(M,y,w,6.2,3,3,'FD');
    doc.setTextColor(...color);doc.setFont(undefined,'bold');doc.setFontSize(6.6);doc.text(text,M+4.5,y+4.1);y+=8;
  }

  drawHeader();

  section('Identificação da RNC');
  grid([
    ['Unidade de origem',normalize(r.unidadeOrigem)],
    ['Origem do produto',r.origem==='CD'?'CD · Centro de Distribuição':r.origem==='CP'?'CP · Cozinha de Produção':normalize(r.origem)],
    ['Setor que identificou',normalize(r.setorIdentificacao||r.setor)],
    ['Etapa da identificação',normalize(r.etapaIdentificacao)],
    ['Data da identificação',fDate(r.dataIdentificacao||r.data)||'—'],
    ['Responsável pelo registro',normalize(r.responsavel)],
  ],2,{minRowH:10.2});

  section('Produto e quantidades');
  textBox('Produto',r.produto,{bold:true,size:9.1,minH:11.5});
  grid([
    ['Lote',normalize(r.lote)],
    ['Manipulação / fabricação',fabricacao?fDate(fabricacao):'—'],
    ['Validade',r.validade?fDate(r.validade):'—'],
    ['Gravidade',normalize(r.gravidade)],
  ],2,{minRowH:10});
  grid([
    ['Afetada confirmada',`${qtdAfetada} ${r.unidade||''}`],
    ['Descartada',`${qtdDescartada} ${r.unidade||''}`],
    ['Em observação',`${qtdObservacao} ${r.unidade||''}`],
  ],3,{minRowH:9.5,valueSize:7.8,labelSize:5,fill:BG,maxLines:2});

  if (r.autoGerada && r.recebimentoId) {
    section('Dados do recebimento relacionado');
    grid([
      ['Qtd. pedida',`${Number(r.qtdPedida||0)} ${r.unidade||''}`],
      ['Qtd. recebida',`${Number(r.qtdRecebida||0)} ${r.unidade||''}`],
      ['Diferença',`${Number(r.diferencaRecebimento||0)>0?'+':''}${Number(r.diferencaRecebimento||0)} ${r.unidade||''}`],
      ['Preço unitário',fMoeda(r.precoUnit||0)],
      ['Valor da divergência',fMoeda(r.valorDivergencia||0)],
      ['Valor total do pedido',fMoeda(r.valorTotalPedido||0)],
      ['Responsável pelo recebimento',normalize(r.responsavelRecebimento)],
      ['Início',r.recebimentoIniciadoEm?`${fDate(r.recebimentoIniciadoEm)} · ${fHora(r.recebimentoIniciadoEm)}`:'—'],
      ['Finalização',r.recebimentoFinalizadoEm?`${fDate(r.recebimentoFinalizadoEm)} · ${fHora(r.recebimentoFinalizadoEm)}`:'—'],
    ],3,{minRowH:10,valueSize:7.4,labelSize:4.9,fill:BG,maxLines:2});
  }

  section('Não conformidade');
  badge(normalize(r.tipo),RD,RD_BG);
  textBox('Descrição da ocorrência',r.descricao,{accent:RD,minH:13});

  section('Avaliação e contenção');
  textBox('Abrangência',r.abrangencia,{minH:10.8});
  textBox('Risco identificado',(Array.isArray(r.riscos)?r.riscos:[]).join(' · ')||'—',{minH:10.8});
  textBox('Contenção realizada pela unidade',(Array.isArray(r.contencoes)?r.contencoes:[]).join(' · ')||'—',{minH:10.8});

  section('Impacto e providência');
  textBox('Impacto operacional',r.impactoOperacional,{minH:12});
  textBox('Providência solicitada ao fornecedor',providencia,{accent:OR,fill:OR_BG,border:OR,textColor:OR_D,minH:12,bold:true});

  section('Situação atual');
  textBox(statusMeta.label,situacao,{accent:statusMeta.color,fill:statusMeta.fill,border:statusMeta.color,minH:12,bold:true});

  const fotos=Array.isArray(r.fotos)?r.fotos:[];
  const dims=[];
  const medir=src=>new Promise(resolve=>{try{const im=new Image();im.onload=()=>resolve({w:im.naturalWidth||1,h:im.naturalHeight||1});im.onerror=()=>resolve(null);im.src=src;}catch(e){resolve(null);}});
  for(let i=0;i<fotos.length;i++) dims[i]=await medir(fotos[i]);
  for(let i=0;i<fotos.length;i++){
    doc.addPage();drawHeader(`Evidência fotográfica ${i+1} de ${fotos.length}`);y=32;section(`Evidência fotográfica ${i+1}`);
    const ax=M,ay=y,aw=CW,ah=pageH-y-22;doc.setFillColor(255,255,255);doc.setDrawColor(...BD);doc.roundedRect(ax,ay,aw,ah,1.7,1.7,'FD');
    const pad=7,maxW=aw-pad*2,maxH=ah-pad*2-7,d=dims[i];let dw=maxW,dh=maxH;
    if(d?.w&&d?.h){const ratio=d.w/d.h;dh=dw/ratio;if(dh>maxH){dh=maxH;dw=dh*ratio;}}
    const ix=ax+(aw-dw)/2,iy=ay+pad+(maxH-dh)/2;let ok=false;
    for(const format of ['JPEG','PNG','WEBP']){try{doc.addImage(fotos[i],format,ix,iy,dw,dh);ok=true;break;}catch(e){}}
    if(!ok){try{doc.addImage(fotos[i],ix,iy,dw,dh);ok=true;}catch(e){}}
    if(!ok){doc.setTextColor(...S3);doc.setFontSize(8.5);doc.text('Imagem indisponível',ax+aw/2,ay+ah/2,{align:'center'});}
    doc.setTextColor(...S2);doc.setFont(undefined,'bold');doc.setFontSize(6.3);doc.text(`EVIDÊNCIA ${i+1}`,ax+pad,ay+ah-4.5);
  }

  const totalPages=doc.internal.getNumberOfPages();
  for(let p=1;p<=totalPages;p++){
    doc.setPage(p);doc.setDrawColor(...BD);doc.line(M,footerY,pageW-M,footerY);doc.setTextColor(...S3);doc.setFont(undefined,'normal');doc.setFontSize(6.3);
    doc.text(`NEXUS · Grupo Ilha · ${numStr}`,M,pageH-9);doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`,M,pageH-5);doc.text(`Página ${p} de ${totalPages}`,pageW-M,pageH-9,{align:'right'});
  }
  doc.save(`NEXUS_RNC_${(numStr||r.id||'').replace(/[\\/:*?"<>|]+/g,'_')}.pdf`);
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
          <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span><span class="badge bor">${p.origem}</span></div><div style=${{ fontWeight: 700, fontSize: 14 }}>${wLbl(p.semana)} · ${fMoeda(p.recebimento?.valorTotalPedido ?? totaisRecebimento(p,p.recebimento?.itens||[]).valorPedido)}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${p.recebimento?.responsavel||'—'} · ${fDate(p.recebimento?.finalizadoEm)}${p.recebimento?.iniciadoEm&&p.recebimento?.finalizadoEm?` · ${fHora(p.recebimento.iniciadoEm)}–${fHora(p.recebimento.finalizadoEm)}`:''}</div></div>
          <button class="btn bs bsm" onClick=${() => { try { pdfRecebimento(p); toast.show('PDF gerado'); } catch(e) { toast.show('Erro'); } }}><${Ic} n="pdf" s=${14}/>PDF</button>
        </div>`; })}
    </div>`}
    ${secao === 'rnc' && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      ${rncs.length === 0 && html`<div class="empty"><${Ic} n="rnc" s=${32} style=${{ color: 'var(--s3)' }}/><p>Nenhuma RNC.</p></div>`}
      ${[...rncs].sort((a,b)=>new Date(b.criadoEm||0)-new Date(a.criadoEm||0)).map(r => { const st = ST_RNC[r.status] || { l: r.status, c: 'bgy' }; return html`
        <div key=${r.id} class="card" style=${{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style=${{ flex: 1, minWidth: 0 }}><div class="row" style=${{ gap: 6, marginBottom: 4 }}><span class=${`badge ${st.c}`}>${st.l}</span>${r.origem&&html`<span class="badge bor">${r.origem}</span>`}</div><div style=${{ fontWeight: 700, fontSize: 14 }}>${r.numero}</div><div style=${{ fontSize: 12, color: 'var(--s2)' }}>${r.produto||'—'} · ${fDate(r.dataIdentificacao||r.data)}</div><div style=${{fontSize:10,color:'var(--s3)',marginTop:2}}>${r.unidadeOrigem||'Unidade não informada'}</div></div>
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
  const [custom, setCustom] = useState(() => LS.get('catalog') || { added: [], removed: [], addedCats: [] });
  const cat = useMemo(getCatalog, [custom]);
  const [config, setConfig] = useState(() => { const c=LS.get('config') || { responsavel:'', empresa:'Grupo Ilha' }; return {...c,unidades:normalizeUnidades(c.unidades),unidadePadrao:c.unidadePadrao||normalizeUnidades(c.unidades)[0]?.nome||''}; });
  const [addingItem, setAddingItem] = useState(null);
  const [addingCat, setAddingCat] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [novaUnidade, setNovaUnidade] = useState('');
  const backupRef = useRef(null);
  const [usage, setUsage] = useState(() => storageUsage());
  const allItems = useMemo(() => flatCatalog(cat, { includeInactive: true }), [cat, custom]);

  const refreshUsage = () => setUsage(storageUsage());
  const saveCustom = c => { if (!LS.set('catalog', c)) return false; setCustom(c); refreshUsage(); return true; };
  const saveConfig = c => { const next={...c,unidades:normalizeUnidades(c.unidades)}; if (!LS.set('config', next)) return false; setConfig(next); refreshUsage(); return true; };

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
  const addUnidade = () => { const nome=novaUnidade.trim(); if(!nome) return; const units=normalizeUnidades(config.unidades); if(units.some(u=>u.nome.toLowerCase()===nome.toLowerCase())){ toast.show('Esta unidade já está cadastrada.'); return; } const item={id:uid(),nome,ativo:true}; if(saveConfig({...config,unidades:[...units,item],unidadePadrao:config.unidadePadrao||nome})){ auditLog('Unidade cadastrada',nome); setNovaUnidade(''); toast.show('Unidade cadastrada'); } };
  const editUnidade = u => { const nome=prompt('Novo nome da unidade:',u.nome); if(!String(nome||'').trim()) return; const clean=String(nome).trim(); const units=normalizeUnidades(config.unidades); if(units.some(x=>x.id!==u.id&&x.nome.toLowerCase()===clean.toLowerCase())){ toast.show('Já existe uma unidade com esse nome.'); return; } const next=units.map(x=>x.id===u.id?{...x,nome:clean}:x); const padrao=config.unidadePadrao===u.nome?clean:config.unidadePadrao; if(saveConfig({...config,unidades:next,unidadePadrao:padrao})){ auditLog('Unidade renomeada',`${u.nome} → ${clean}`); toast.show('Unidade atualizada'); } };
  const toggleUnidade = u => { const units=normalizeUnidades(config.unidades).map(x=>x.id===u.id?{...x,ativo:x.ativo===false}:x); const ativos=units.filter(x=>x.ativo!==false); if(!ativos.length){ toast.show('Mantenha ao menos uma unidade ativa.'); return; } const padrao=(u.nome===config.unidadePadrao&&u.ativo!==false)?ativos[0].nome:config.unidadePadrao; if(saveConfig({...config,unidades:units,unidadePadrao:padrao})){ auditLog(u.ativo===false?'Unidade reativada':'Unidade inativada',u.nome); toast.show(u.ativo===false?'Unidade reativada':'Unidade inativada'); } };
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
      <div class="row" style=${{ justifyContent:'space-between', gap:12, marginBottom:10 }}><div><div style=${{fontWeight:800,fontSize:14}}>Unidades do Grupo Ilha</div><div style=${{fontSize:11,color:'var(--s2)',marginTop:3}}>Usadas no campo “Unidade de origem” das RNCs. Os cadastros ficam prontos para futura migração ao banco.</div></div><span class="badge bor">${normalizeUnidades(config.unidades).filter(u=>u.ativo!==false).length} ativa(s)</span></div>
      <label style=${{fontSize:11,fontWeight:700,color:'var(--s2)',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:6}}>Unidade padrão</label>
      <select class="inp" value=${config.unidadePadrao||''} onChange=${e=>saveConfig({...config,unidadePadrao:e.target.value})} style=${{marginBottom:12}}>${normalizeUnidades(config.unidades).filter(u=>u.ativo!==false).map(u=>html`<option value=${u.nome}>${u.nome}</option>`)}</select>
      <div style=${{display:'flex',gap:8,marginBottom:12}}><input class="inp" value=${novaUnidade} onInput=${e=>setNovaUnidade(e.target.value)} onKeyDown=${e=>{if(e.key==='Enter')addUnidade()}} placeholder="Nome da nova unidade"/><button class="btn bp bsm" onClick=${addUnidade}><${Ic} n="plus" s=${14}/>Cadastrar</button></div>
      <div style=${{display:'flex',flexDirection:'column',gap:7}}>${normalizeUnidades(config.unidades).map(u=>html`<div key=${u.id} class="row" style=${{padding:'9px 10px',border:'1px solid var(--bd)',borderRadius:10,opacity:u.ativo===false?.55:1}}><div style=${{flex:1,minWidth:0}}><div style=${{fontSize:13,fontWeight:700}}>${u.nome}</div><div style=${{fontSize:10,color:'var(--s2)'}}>${u.ativo===false?'Inativa':'Ativa'}${config.unidadePadrao===u.nome?' · padrão':''}</div></div><button class="btn bs bsm" onClick=${()=>editUnidade(u)}>Editar</button><button class="btn bs bsm" onClick=${()=>toggleUnidade(u)}>${u.ativo===false?'Reativar':'Inativar'}</button></div>`)}</div>
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
      <div style=${{ fontSize: 12, color: 'var(--s2)' }}>NEXUS v2.8.1 · Grupo Ilha · ${new Date().getFullYear()}</div>
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
          ${[['Pedidos pendentes',pedidos.filter(p=>p.status==='pendente').length],['Recebimentos com divergência',pedidos.filter(p=>p.status==='parcial').length],['Recebimentos OK',pedidos.filter(p=>p.status==='recebido').length],['RNCs abertas',rncs.filter(r=>r.status==='aberta'||r.status==='analise').length],['RNCs concluídas',rncs.filter(r=>r.status==='resolvida').length],['Orçam. a autorizar',orcamentos.filter(o=>o.status==='pendente').length]].map(([l,v])=>html`<div style=${{ padding:12, border:'1px solid var(--bd)', borderRadius:12, background:'#fff' }}><div style=${{ fontSize:10,color:'var(--s3)',fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em' }}>${l}</div><div style=${{ fontSize:24,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>${v}</div></div>`)}
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
    ...rncs.filter(r => `${r.numero||''} ${r.produto||''} ${r.fornecedor||''} ${r.responsavel||''} ${r.tipo||''} ${r.unidadeOrigem||''} ${r.setorIdentificacao||r.setor||''}`.toLowerCase().includes(term)).slice(0,5).map(r => ({ label: `RNC · ${r.numero} · ${r.produto||''}`, tab: 'rnc', id:r.id })),
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
  const target='2.8.1';
  if (LS.get('schemaVersion') === target) return true;
  const now=new Date().toISOString();
  let pedidos=LS.get('pedidos') || [];
  let orcamentos=LS.get('orcamentos') || [];
  let rncs=LS.get('rncs') || [];
  let config=LS.get('config') || { responsavel:'', empresa:'Grupo Ilha' };
  const unidadesNorm=normalizeUnidades(config.unidades);
  config={...config,unidades:unidadesNorm,unidadePadrao:config.unidadePadrao||unidadesNorm[0]?.nome||''};
  pedidos=pedidos.map(p=>{
    const itens=(p.itens||[]).map(i=>({...i,qtd:nonNeg(i.qtd),precoUnit:nonNeg(i.precoUnit)}));
    const base={...p,id:p.id||uid(),semana:p.semana||dateToWeek(p.data||p.criadoEm||todayISO()),criadoEm:p.criadoEm||now,itens};
    if(!base.recebimento) return {...base,status:base.status||'pendente'};
    const finalizadoEm=base.recebimento.finalizadoEm||base.recebimento.criadoEm||now;
    const recItens=(base.recebimento.itens||itens).map(i=>{
      const pedItem=itens.find(x=>x.nome===i.nome)||i;
      const precoUnit=nonNeg(i.precoUnit??pedItem.precoUnit??ultimoPrecoGlobal(i.nome));
      const qtd=nonNeg(i.qtd??pedItem.qtd);
      const qtdRecebida=nonNeg(i.qtdRecebida);
      return {...pedItem,...i,qtd,qtdRecebida,precoUnit,subtotalPedido:qtd*precoUnit,subtotalRecebido:qtdRecebida*precoUnit};
    });
    const totais=recItens.reduce((m,i)=>({pedido:m.pedido+nonNeg(i.subtotalPedido),recebido:m.recebido+nonNeg(i.subtotalRecebido)}),{pedido:0,recebido:0});
    const iniciadoEm=base.recebimento.iniciadoEm||base.recebimento.criadoEm||finalizadoEm;
    const parcial=recItens.some(i=>Math.abs(Number(i.qtdRecebida||0)-Number(i.qtd||0))>0.000001);
    const rec={...base.recebimento,id:base.recebimento.id||uid(),data:base.recebimento.data||String(finalizadoEm||base.criadoEm||todayISO()).slice(0,10),iniciadoEm,finalizadoEm,itens:recItens,valorTotalPedido:nonNeg(base.recebimento.valorTotalPedido||totais.pedido),valorTotalRecebido:nonNeg(base.recebimento.valorTotalRecebido||totais.recebido),duracaoMinutos:nonNeg(base.recebimento.duracaoMinutos||Math.max(0,Math.round((new Date(finalizadoEm)-new Date(iniciadoEm))/60000))),status:parcial?'divergente':'completo'};
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
    const unidadeInferida=r.unidadeOrigem || (/VILA VELHA|\bVV\b/i.test(r.setor||'')?'Ilha do Caranguejo - VV':(/VIX|VITÓRIA|VITORIA/i.test(r.setor||'')?'Ilha do Caranguejo - VIX':config.unidadePadrao||''));
    const qtdAfetada=nonNeg(r.qtdAfetadaConfirmada ?? r.quantidade);
    const base={...r,id:r.id||uid(),data,dataIdentificacao:r.dataIdentificacao||data,dataRecebimento:r.dataRecebimento||'',semana:r.semana||dateToWeek(data),origem,status,
      unidadeOrigem:unidadeInferida,setorIdentificacao:r.setorIdentificacao||r.setor||'',momentoIdentificacao:r.momentoIdentificacao||(r.recebimentoId?'No recebimento':'Após o recebimento'),etapaIdentificacao:r.etapaIdentificacao||(r.recebimentoId?'Recebimento':'Durante a produção'),condicaoRecebimento:r.condicaoRecebimento||(r.recebimentoId?'Problema já identificado no recebimento':'Sem anormalidade aparente'),
      gravidade:r.gravidade||'Média',quantidade:qtdAfetada,qtdAfetadaInicial:nonNeg(r.qtdAfetadaInicial ?? r.quantidade),qtdAfetadaConfirmada:qtdAfetada,
      qtdPedida:nonNeg(r.qtdPedida),qtdRecebida:nonNeg(r.qtdRecebida),qtdRecusada:nonNeg(r.qtdRecusada),qtdUtilizadaAntes:nonNeg(r.qtdUtilizadaAntes),qtdSegregada:nonNeg(r.qtdSegregada),qtdSobObservacao:nonNeg(r.qtdSobObservacao),qtdDescartadaDevolvida:nonNeg(r.qtdDescartadaDevolvida ?? r.qtdRecusada),
      abrangencia:r.abrangencia||'Abrangência ainda não determinada',contencoes:Array.isArray(r.contencoes)?r.contencoes:(r.contencao?[r.contencao]:[]),riscos:Array.isArray(r.riscos)?r.riscos:(r.riscoOcorrencia?[r.riscoOcorrencia]:[]),impactoOperacional:r.impactoOperacional||'',constatacoes:Array.isArray(r.constatacoes)?r.constatacoes:[],
      impactoFinanceiroTipo:r.impactoFinanceiroTipo||(r.impactoFinanceiroIndeterminado?'indeterminado':(Number(r.impactoFinanceiro||0)>0?'valor':'sem_impacto')),impactoFinanceiroIndeterminado:r.impactoFinanceiroTipo==='indeterminado'||!!r.impactoFinanceiroIndeterminado,impactoFinanceiro:nonNeg(r.impactoFinanceiro),medidaRealizada:r.medidaRealizada||(status==='resolvida'?(r.verificacaoEficacia||r.planoAcao||''):''),criadoEm:r.criadoEm||now,historicoStatus:(r.historicoStatus||[]).length?r.historicoStatus:[{de:null,para:status,em:r.criadoEm||now,usuario:r.responsavel||config.responsavel||'Usuário local'}]};
    if(!base.numero || usedNumbers.has(base.numero)) base.numero=nextRncNumber(origem,[...rebuilt,...rncs],data);
    usedNumbers.add(base.numero); rebuilt.push(base);
  });
  const closed=[...new Set((LS.get('closedWeeks')||[]).filter(w=>/^\d{4}-W\d{2}$/.test(String(w))))].sort();
  return commitLocal({pedidos,orcamentos,rncs:rebuilt,config,closedWeeks:closed,schemaVersion:target});
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
