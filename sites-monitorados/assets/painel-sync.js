/* ===== Sincronização entre usuários =====
 * - verifica no servidor, a cada 30 s e sempre que o app volta para a tela, se houve atualização;
 * - se a base mudou, recarrega o painel com os dados novos;
 * - prints dos mosaicos ficam no servidor (compartilhados), não só neste aparelho.
 */
(function () {
  'use strict';
  const S = window.__SESSAO || {};
  const ME = S.usuario;
  if (!ME) return;
  const PERM = ME.perm || {};
  const podeEnviar = ME.perfil === 'admin' || !!(PERM.importar || PERM.unidades);
  const TOK = () => { try { return localStorage.getItem(window.SSM_TOKEN_KEY) || ''; } catch (e) { return ''; } };
  async function api(method, path, body) {
    const r = await fetch(window.SSM_API + path, {
      method, headers: Object.assign({ 'x-sessao': TOK() }, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store'
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.erro || 'Falha na comunicação com o servidor.'); e.status = r.status; throw e; }
    return j;
  }
  const say = m => { try { if (typeof toast === 'function') toast(m); } catch (e) { } };
  const tela = () => { try { renderTable(filtered()); updNote(); if (M && M.sel) mInfo(M.sel); } catch (e) { } };

  // prints que este aparelho já recebeu do servidor: { chave: data da versão }
  const KEY = 'ssm-prints-srv';
  let CONH = {};
  try { CONH = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { CONH = {}; }
  const guarda = () => { try { localStorage.setItem(KEY, JSON.stringify(CONH)); } catch (e) { } };
  let revP = -1, ocupado = false, pronto = false, denovo = false;

  /* ---------- prints anexados/removidos vão para o servidor ---------- */
  const _save = window.savePrint, _del = window.delPrint;
  async function envia(k, b, silencioso) {
    const img = await smallURL(b);
    const r = await api('PUT', '/prints', { k, img, log: !silencioso });
    CONH[k] = r.em; guarda(); revP = r.rev;
  }
  if (typeof _save === 'function' && typeof _del === 'function') {
    window.savePrint = savePrint = async function (k, b) {
      await _save.call(this, k, b);
      if (!podeEnviar) return;
      try { await envia(k, b, false); } catch (e) { say('O print ficou salvo só neste aparelho: ' + e.message); }
    };
    window.delPrint = delPrint = async function (k) {
      await _del.call(this, k);
      if (!podeEnviar) return;
      try { const r = await api('DELETE', '/prints?k=' + encodeURIComponent(k)); delete CONH[k]; guarda(); revP = r.rev; }
      catch (e) { say('Não foi possível remover o print no servidor: ' + e.message); }
    };
  }

  async function syncPrints(rev) {
    const j = await api('GET', '/prints');
    const srv = {};
    (j.lista || []).forEach(x => { srv[x.k] = x.em; });
    let mudou = false;
    // novos ou alterados por outros usuários
    const falta = Object.keys(srv).filter(k => new Date(CONH[k] || 0).getTime() !== new Date(srv[k]).getTime() || !MEM.has(k));
    for (let i = 0; i < falta.length; i += 4) {
      await Promise.all(falta.slice(i, i + 4).map(async k => {
        try {
          const r = await api('GET', '/prints?k=' + encodeURIComponent(k));
          await _save(k, dataURLtoBlob(r.img)); CONH[k] = r.em; mudou = true;
        } catch (e) { }
      }));
    }
    // removidos por outros usuários
    for (const k of Object.keys(CONH)) if (!(k in srv)) { await _del(k); delete CONH[k]; mudou = true; }
    guarda();
    revP = Math.max(revP, rev != null ? rev : (j.rev || 0));
    // prints que só existiam neste aparelho (anexados antes da sincronização) sobem para o servidor
    if (podeEnviar) {
      const locais = [...MEM.keys()].filter(k => !(k in srv) && !(k in CONH));
      let ok = 0;
      for (const k of locais) { try { await envia(k, MEM.get(k), true); ok++; } catch (e) { break; } }
      if (ok) say(`${ok} print(s) deste aparelho enviados para todos os usuários.`);
    }
    if (mudou) tela();
  }

  /* ---------- verifica se algo mudou no servidor ---------- */
  const modalAberto = () => [...document.querySelectorAll('.modal')].some(x => !x.hidden);
  function recarrega() {
    try { sessionStorage.setItem('ssm-atualizado', '1'); } catch (e) { }
    location.reload();
  }
  async function verifica() {
    if (ocupado) { denovo = true; return; }
    if (!pronto || document.hidden) return;
    ocupado = true;
    try {
      const r = await api('GET', '/rev');
      if (S.rev != null && r.dados !== S.rev) {
        const editando = Date.now() - (window.__SSM_EDIT || 0) < 8000;
        if (!editando && !modalAberto()) { recarrega(); return; }
      }
      if (r.prints !== revP) await syncPrints(r.prints);
    } catch (e) { /* sem conexão: tenta de novo na próxima verificação */ }
    finally { ocupado = false; if (denovo) { denovo = false; setTimeout(verifica, 300); } }
  }

  try { if (sessionStorage.getItem('ssm-atualizado')) { sessionStorage.removeItem('ssm-atualizado'); setTimeout(() => say('Painel atualizado com as alterações mais recentes.'), 600); } } catch (e) { }
  // espera os prints locais carregarem antes da primeira sincronização
  setTimeout(() => { pronto = true; verifica(); }, 2500);
  setInterval(verifica, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verifica(); });
  window.addEventListener('focus', verifica);
  window.addEventListener('online', verifica);
})();

