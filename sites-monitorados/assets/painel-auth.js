/* Integração do painel com o sistema de acesso:
 * - chip do usuário (alterar senha / sair)
 * - aba "Cadastro de usuários" (administradores)
 * - permissões por perfil e por aba
 * - bases salvas no servidor (compartilhadas entre os usuários)
 */
(function () {
  'use strict';
  const S = window.__SESSAO || {};
  const ME = S.usuario;
  if (!ME) { location.replace('/'); return; }
  const q = s => document.querySelector(s);
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = m => (typeof toast === 'function' ? toast(m) : alert(m));
  const PERFIL = { admin: 'Administrador', editor: 'Gestor', visualizador: 'Supervisor' };
  const PERFIL_D = {
    admin: 'Acesso total, cadastro de usuários e bases',
    editor: 'Acessos definidos em "Perfis de acesso" (padrão: importa e cadastra unidades)',
    visualizador: 'Acessos definidos em "Perfis de acesso" (padrão: consulta e exporta)'
  };
  const ABA = { mon: 'Sites monitorados', nao: 'Sites não monitorados' };
  const isAdmin = ME.perfil === 'admin';
  // permissões do perfil (definidas pelo administrador em "Perfis de acesso"; o servidor também confere)
  const PERM = ME.perm || (ME.perfil === 'visualizador'
    ? { exportar: true, importar: false, unidades: false, excluir: false }
    : { exportar: true, importar: true, unidades: true, excluir: true });
  const canEdit = !!(PERM.importar || PERM.unidades);
  const ini = n => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  const dt = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = {
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M15 8l2 2"/>',
    out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    ok: '<path d="M20 6 9 17l-5-5"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7m0 0-3-3m3 3 3-3M10 18h4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  };

  const TOK = () => { try { return localStorage.getItem(window.SSM_TOKEN_KEY) || ''; } catch (e) { return ''; } };
  const sairLocal = () => { try { localStorage.removeItem(window.SSM_TOKEN_KEY); } catch (e) { } location.replace('/'); };
  async function api(method, url, body) {
    let r;
    try {
      r = await fetch(window.SSM_API + url.replace(/^\/api/, ''), {
        method, headers: Object.assign({ 'x-sessao': TOK() }, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new Error('Sem conexão com o servidor.'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { sairLocal(); throw new Error(j.erro || 'Sessão expirada.'); }
    if (!r.ok) throw new Error(j.erro || 'Falha na comunicação com o servidor.');
    return j;
  }

  /* ---------- 1. permissões no painel ---------- */
  const allowed = ['mon', 'nao'].filter(t => ME.abas.includes(t));
  ['mon', 'nao'].forEach(t => { if (!allowed.includes(t)) { const b = q('#tab-' + t); if (b) b.hidden = true; } });
  if (!allowed.includes(TAB) && allowed.length) switchTab(allowed[0]);
  window.addEventListener('hashchange', () => { if (!allowed.includes(TAB) && allowed.length) switchTab(allowed[0]); });
  if (!PERM.importar) ['#b-add', '#b-imp', '#b-prt'].forEach(s => { const e = q(s); if (e) e.hidden = true; });
  if (!PERM.exportar) ['#b-html', '#b-exp', '#b-pdf'].forEach(s => { const e = q(s); if (e) e.hidden = true; });

  /* ---------- 2. bases salvas no servidor ---------- */
  const _persist = window.persist;
  let pend = {}, tmr = null;
  window.persist = persist = function () {
    _persist.apply(this, arguments);
    window.__SSM_EDIT = Date.now();
    if (!canEdit || !ME.abas.includes(TAB)) return;
    pend[TAB] = { d: DATA, s: SOURCE };
    clearTimeout(tmr);
    tmr = setTimeout(flush, 300);
  };
  async function flush() {
    const p = pend; pend = {};
    for (const t of Object.keys(p)) {
      try { const rr = await api('PUT', '/api/dados/' + t, p[t]); if (rr && rr.rev) S.rev = rr.rev; window.__SSM_EDIT = Date.now(); say(`Base "${ABA[t]}" salva no servidor para todos os usuários.`); }
      catch (e) { say('Não foi possível salvar no servidor: ' + e.message); }
    }
  }

  /* ---------- 3. chip do usuário ---------- */
  const actions = q('.hdr .actions');
  const themeBtn = q('#b-theme');
  if (themeBtn) themeBtn.classList.add('ua-keep');
  const wrapU = document.createElement('div');
  wrapU.className = 'ua-user ua-keep';
  wrapU.innerHTML = `<button type="button" class="ua-chip" aria-haspopup="menu" aria-expanded="false"><span class="ua-av">${h(ini(ME.nome))}</span><span class="ua-n"><b>${h(ME.nome.split(' ')[0])}</b><small>${h(PERFIL[ME.perfil])}</small></span></button>
   <div class="ua-menu" role="menu" hidden>
    <div class="hd"><span class="ua-av lg">${h(ini(ME.nome))}</span><div><b>${h(ME.nome)}</b><span>${h(ME.email)}</span><span>${h(PERFIL[ME.perfil])} · ${allowed.map(t => ABA[t]).join(', ')}</span></div></div>
    <button type="button" data-a="senha" role="menuitem">${svg(I.key)}Alterar minha senha</button>
    ${isAdmin ? `<button type="button" data-a="users" role="menuitem">${svg(I.users)}Cadastro de usuários</button>` : ''}
    <button type="button" data-a="app" data-install role="menuitem">${svg(I.phone)}Instalar aplicativo</button>
    <button type="button" data-a="sair" class="out" role="menuitem">${svg(I.out)}Sair do sistema</button>
   </div>`;
  if (!canEdit) {
    const ro = document.createElement('span');
    ro.className = 'ua-ro ua-keep'; ro.innerHTML = svg(I.eye).replace('<svg', '<svg width="14" height="14"') + 'Somente leitura';
    actions.prepend(ro);
  }
  actions.append(wrapU);
  if (window.SSM_PWA) window.SSM_PWA.sync();
  const chip = wrapU.querySelector('.ua-chip'), menu = wrapU.querySelector('.ua-menu');
  function posMenu() {
    const r = chip.getBoundingClientRect();
    menu.style.top = (r.bottom + 8) + 'px';
    if (innerWidth <= 700) { menu.style.left = '12px'; menu.style.right = '12px'; }
    else { menu.style.left = 'auto'; menu.style.right = Math.max(12, innerWidth - r.right) + 'px'; }
  }
  chip.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) posMenu(); chip.setAttribute('aria-expanded', String(!menu.hidden)); };
  addEventListener('resize', () => { if (!menu.hidden) posMenu(); });
  addEventListener('scroll', () => { if (!menu.hidden) { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); } }, { passive: true });
  menu.onclick = e => {
    e.stopPropagation();
    const a = e.target.closest('button[data-a]'); if (!a) return;
    menu.hidden = true;
    if (a.dataset.a === 'sair') sair();
    if (a.dataset.a === 'senha') formSenha();
    if (a.dataset.a === 'users') abrirUsuarios(true);
  };
  document.addEventListener('click', () => { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); });
  async function sair() { try { await api('POST', '/api/logout', {}); } catch (e) { } sairLocal(); }

  /* ---------- modal genérico ---------- */
  const md = document.createElement('div');
  md.className = 'modal ua-modal'; md.hidden = true;
  document.body.append(md);
  md.addEventListener('mousedown', e => { if (e.target === md) md.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') md.hidden = true; });
  function modal(html) { md.innerHTML = `<div role="dialog" aria-modal="true">${html}</div>`; md.hidden = false; const f = md.querySelector('input:not([type=checkbox]):not([type=radio])'); f && f.focus(); return md.firstElementChild; }
  function confirmar(titulo, texto, rotulo) {
    return new Promise(res => {
      const b = modal(`<h3>${h(titulo)}</h3><p>${h(texto)}</p><div class="row"><button type="button" class="btn" data-r="0">Cancelar</button><button type="button" class="btn pri" data-r="1">${h(rotulo)}</button></div>`);
      b.querySelectorAll('[data-r]').forEach(x => x.onclick = () => { md.hidden = true; res(x.dataset.r === '1'); });
    });
  }

  function formSenha() {
    const b = modal(`<h3>Alterar minha senha</h3><p>Ao alterar, as outras sessões abertas com seu usuário serão encerradas.</p>
     <form class="ua-form" novalidate>
      <div class="ua-err" hidden></div>
      <div class="ua-f"><label for="p-a">Senha atual</label><input type="password" id="p-a" autocomplete="current-password" required></div>
      <div class="ua-f"><label for="p-n">Nova senha</label><input type="password" id="p-n" autocomplete="new-password" required><span class="hint2">Mínimo de 8 caracteres, com letras e números.</span></div>
      <div class="ua-f"><label for="p-c">Confirmar nova senha</label><input type="password" id="p-c" autocomplete="new-password" required></div>
      <div class="row"><button type="button" class="btn" data-x>Cancelar</button><button type="submit" class="btn pri">Salvar nova senha</button></div>
     </form>`);
    const er = b.querySelector('.ua-err');
    b.querySelector('[data-x]').onclick = () => md.hidden = true;
    b.querySelector('form').onsubmit = async e => {
      e.preventDefault(); er.hidden = true;
      const n = b.querySelector('#p-n').value;
      if (n !== b.querySelector('#p-c').value) { er.textContent = 'As senhas não conferem.'; er.hidden = false; return; }
      try { await api('POST', '/api/eu/senha', { atual: b.querySelector('#p-a').value, nova: n }); md.hidden = true; say('Senha alterada com sucesso.'); }
      catch (x) { er.textContent = x.message; er.hidden = false; }
    };
  }

  if (!isAdmin) return;

  /* ---------- 4. aba "Cadastro de usuários" ---------- */
  const tabs = q('.tabs');
  const tabU = document.createElement('button');
  tabU.className = 'tab ua-adm'; tabU.type = 'button'; tabU.setAttribute('role', 'tab'); tabU.id = 'tab-users'; tabU.setAttribute('aria-selected', 'false');
  tabU.innerHTML = svg(I.users) + 'Cadastro de usuários<span class="c" id="cnt-users"></span>';
  tabs.append(tabU);

  const sec = document.createElement('section');
  sec.id = 'users-sec'; sec.hidden = true;
  sec.innerHTML = `
   <div class="ua-bar">
    <div class="f-title">${svg(I.shield).replace('<svg', '<svg width="18" height="18" style="color:var(--blue)"')}Usuários e acessos <span class="badge" id="ua-badge">0</span></div>
    <div class="grp">
     <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="ua-q" type="search" placeholder="Buscar por nome ou e-mail" aria-label="Buscar usuário"></div>
     <div class="ua-seg" role="group" aria-label="Situação"><button type="button" data-f="todos" aria-pressed="true">Todos</button><button type="button" data-f="ativos" aria-pressed="false">Ativos</button><button type="button" data-f="inativos" aria-pressed="false">Inativos</button></div>
     <button type="button" class="ua-btn pri" id="ua-new">${svg(I.plus)}Novo usuário</button>
    </div>
   </div>
   <div class="kpis" id="ua-kpis"></div>
   <div class="sec-h">Usuários cadastrados</div>
   <section class="card">
    <div class="tw"><table class="ua-users"><thead><tr><th>Usuário</th><th>Perfil</th><th>Abas liberadas</th><th>Situação</th><th>Último acesso</th><th>Cadastrado em</th><th style="text-align:right">Ações</th></tr></thead><tbody id="ua-tbody"></tbody></table></div>
    <div class="pager"><span id="ua-info"></span></div>
   </section>
   <div class="sec-h">Permissões, bases e auditoria</div>
   <section class="grid">
    <div class="card c4"><div><h2>Perfis de acesso</h2><div class="sub">Marque o que cada perfil pode fazer. A alteração vale para todos os usuários do perfil no próximo acesso.</div></div>
     <table class="ua-perm"><thead><tr><th></th><th>Admin.</th><th>Gestor</th><th>Superv.</th></tr></thead><tbody id="ua-perm-b"></tbody></table>
     <div class="sub">O administrador sempre tem acesso total. O acesso a cada aba (monitorados / não monitorados) é liberado individualmente no cadastro do usuário.</div>
    </div>
    <div class="card c4"><div><h2>Bases de dados</h2><div class="sub">Base vigente compartilhada entre todos os usuários</div></div><div class="ua-base" id="ua-bases"></div></div>
    <div class="card c4"><div><h2>Registro de atividades</h2><div class="sub">Logins, cadastros e atualizações de base</div></div><div class="ua-log" id="ua-log"></div></div>
   </section>`;
  const app = q('#app');
  q('#sec-hdr').after(sec);

  let USERS = [], FILT = 'todos';
  const inUsers = () => app.classList.contains('users-mode');
  function abrirUsuarios(on) {
    app.classList.toggle('users-mode', on);
    sec.hidden = !on;
    document.querySelectorAll('.tabs .tab').forEach(b => b.setAttribute('aria-selected', String(on ? b === tabU : b.dataset.t === TAB)));
    try { history.replaceState(null, '', on ? '#usuarios' : '#' + TABS[TAB].hash); } catch (e) { }
    document.title = on ? 'Cadastro de usuários' : TABS[TAB].title;
    q('#ttl').textContent = on ? 'Cadastro de Usuários' : TABS[TAB].title;
    if (on) carregar(); else if (typeof refresh === 'function') refresh();
    window.scrollTo({ top: 0 });
  }
  tabU.onclick = () => abrirUsuarios(true);
  document.querySelectorAll('.tabs .tab[data-t]').forEach(b => b.addEventListener('click', () => { if (inUsers()) abrirUsuarios(false); }));

  q('#ua-q').oninput = render;
  sec.querySelectorAll('.ua-seg button').forEach(b => b.onclick = () => {
    FILT = b.dataset.f; sec.querySelectorAll('.ua-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
  });
  q('#ua-new').onclick = () => formUsuario(null);

  async function carregar() {
    try {
      const [u, l, b, pp] = await Promise.all([api('GET', '/api/usuarios'), api('GET', '/api/logs'), api('GET', '/api/bases'),
        api('GET', '/api/permissoes').catch(() => null)]);
      USERS = u.usuarios; render(); renderLog(l.logs); renderBases(b);
      if (pp) { PP = pp.perfis; renderPerm(); }
    } catch (e) { say(e.message); }
  }

  /* ---------- permissões configuráveis por perfil ---------- */
  let PP = null;
  const LINHAS = [
    ['', 'Consultar painel, mapa e gráficos', 'todos'],
    ['exportar', 'Exportar HTML, JSON e PDF'],
    ['importar', 'Importar planilha / JSON / prints'],
    ['unidades', 'Cadastrar e editar unidades'],
    ['excluir', 'Excluir unidades no cadastro'],
    ['', 'Restaurar base original', 'admin'],
    ['', 'Cadastrar e gerenciar usuários', 'admin']
  ];
  function renderPerm() {
    const y = '<td class="c y">✓</td>', n = '<td class="c n">—</td>';
    const cx = (pf, k) => `<td class="c"><input type="checkbox" class="ua-pck" data-p="${pf}" data-k="${k}" ${PP[pf][k] ? 'checked' : ''} aria-label="${PERFIL[pf]}: ${k}" style="width:17px;height:17px;accent-color:var(--orange,#F7941D);cursor:pointer"></td>`;
    q('#ua-perm-b').innerHTML = LINHAS.map(([k, rot, fixo]) => `<tr><td>${rot}${k === 'excluir' ? '<br><small style="color:var(--muted)">requer "Cadastrar e editar"</small>' : ''}</td>${y}${
      fixo === 'todos' ? y + y : fixo === 'admin' ? n + n : cx('editor', k) + cx('visualizador', k)}</tr>`).join('');
    q('#ua-perm-b').querySelectorAll('.ua-pck').forEach(c => c.onchange = salvarPerm);
  }
  async function salvarPerm(e) {
    const c = e.target, pf = c.dataset.p, k = c.dataset.k;
    const novo = JSON.parse(JSON.stringify(PP));
    novo[pf][k] = c.checked;
    if (k === 'unidades' && !c.checked) novo[pf].excluir = false;   // excluir depende de cadastrar/editar
    if (k === 'excluir' && c.checked) novo[pf].unidades = true;
    q('#ua-perm-b').querySelectorAll('.ua-pck').forEach(x => x.disabled = true);
    try { const r = await api('PUT', '/api/permissoes', { perfis: novo }); PP = r.perfis; say(`Permissões do perfil ${PERFIL[pf]} salvas.`); }
    catch (x) { say('Não foi possível salvar: ' + x.message); }
    renderPerm();
  }
  function render() {
    const qq = q('#ua-q').value.trim().toLowerCase();
    const rows = USERS.filter(u => (FILT === 'todos' || (FILT === 'ativos' ? u.ativo : !u.ativo)) && (!qq || (u.nome + ' ' + u.email).toLowerCase().includes(qq)))
      .sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const at = USERS.filter(u => u.ativo);
    q('#cnt-users').textContent = USERS.length;
    q('#ua-badge').textContent = USERS.length;
    const K = [
      ['Usuários cadastrados', USERS.length, `${at.length} ativos · ${USERS.length - at.length} inativos`, I.users, 1],
      ['Administradores', at.filter(u => u.perfil === 'admin').length, 'acesso total ao sistema', I.shield, 1],
      ['Gestores', at.filter(u => u.perfil === 'editor').length, 'acessos conforme "Perfis de acesso"', I.edit, 0],
      ['Supervisores', at.filter(u => u.perfil === 'visualizador').length, 'acessos conforme "Perfis de acesso"', I.eye, 0],
      ['Acessaram nos últimos 7 dias', USERS.filter(u => u.ultimoAcesso && Date.now() - new Date(u.ultimoAcesso) < 7 * 864e5).length, 'usuários com login recente', I.clock, 0]
    ];
    q('#ua-kpis').innerHTML = K.map(k => `<div class="kpi ${k[4] ? 'hot' : ''}"><div class="l"><span>${k[0]}</span><i>${svg(k[3])}</i></div><div class="v">${k[1]}</div><div class="s">${k[2]}</div></div>`).join('');
    q('#ua-tbody').innerHTML = rows.length ? rows.map(u => `<tr data-id="${h(u.id)}">
      <td><div class="ua-who"><span class="ua-av">${h(ini(u.nome))}</span><div><b>${h(u.nome)}${u.id === ME.id ? ' <span class="pill g">você</span>' : ''}</b><span>${h(u.email)}</span></div></div></td>
      <td><span class="pill ${u.perfil === 'admin' ? 'adm' : u.perfil === 'editor' ? '' : 'g'}">${h(PERFIL[u.perfil])}</span></td>
      <td>${u.abas.map(t => `<span class="pill ${t === 'nao' ? 'o' : ''}" style="margin-right:4px">${h(ABA[t])}</span>`).join('')}</td>
      <td>${u.ativo ? '<span class="pill ok"><span class="ua-dot"></span>Ativo</span>' : '<span class="pill off"><span class="ua-dot off"></span>Inativo</span>'}${u.trocarSenha ? ' <span class="pill o" title="Deve trocar a senha no próximo acesso">troca de senha</span>' : ''}</td>
      <td>${dt(u.ultimoAcesso)}</td><td>${dt(u.criadoEm)}</td>
      <td><div class="ua-acts"><button type="button" class="ua-btn sm" data-a="edit">${svg(I.edit)}Editar</button>${u.id === ME.id ? '' : `<button type="button" class="ua-btn sm dg" data-a="del" aria-label="Excluir ${h(u.nome)}">${svg(I.del)}</button>`}</div></td></tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Nenhum usuário encontrado.</td></tr>`;
    q('#ua-info').textContent = `${rows.length} de ${USERS.length} usuários exibidos`;
    q('#ua-tbody').querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
      const u = USERS.find(x => x.id === b.closest('tr').dataset.id);
      if (b.dataset.a === 'edit') formUsuario(u); else excluir(u);
    });
  }
  function renderLog(logs) {
    q('#ua-log').innerHTML = logs.length ? logs.slice(0, 80).map(l => `<div><time>${dt(l.em)}</time><div><b>${h(l.acao)}</b><br><span>${h(l.por)}${l.detalhe ? ' · ' + h(l.detalhe) : ''}</span></div></div>`).join('')
      : '<div><span>Sem registros.</span></div>';
  }
  function renderBases(b) {
    q('#ua-bases').innerHTML = ['mon', 'nao'].map(t => {
      const x = b[t];
      return `<div class="it"><div><b>${ABA[t]} · ${x.total.toLocaleString('pt-BR')} sites</b><span>${x.personalizada ? `Atualizada por ${h(x.por)} em ${dt(x.em)}<br>${h(x.origem)}` : 'Base original do painel<br>' + h(x.origem)}</span></div>
        ${x.personalizada ? `<button type="button" class="ua-btn sm dg" data-r="${t}">Restaurar original</button>` : '<span class="pill g">original</span>'}</div>`;
    }).join('');
    q('#ua-bases').querySelectorAll('[data-r]').forEach(bt => bt.onclick = async () => {
      const t = bt.dataset.r;
      if (!await confirmar('Restaurar base original?', `A base "${ABA[t]}" voltará aos dados originais do painel para todos os usuários. As alterações importadas serão descartadas.`, 'Restaurar')) return;
      try { await api('DELETE', '/api/dados/' + t); say('Base restaurada. Recarregando…'); setTimeout(() => location.reload(), 900); } catch (e) { say(e.message); }
    });
  }
  async function excluir(u) {
    if (!await confirmar('Excluir usuário?', `${u.nome} (${u.email}) perderá o acesso imediatamente. Para bloquear temporariamente, prefira desativar o usuário.`, 'Excluir usuário')) return;
    try { await api('DELETE', '/api/usuarios/' + u.id); say('Usuário excluído.'); carregar(); } catch (e) { say(e.message); }
  }
  function gerarSenha() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', D = '23456789';
    const r = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
    let s = ''; for (let i = 0; i < 8; i++) s += A[r(A.length)]; for (let i = 0; i < 3; i++) s += D[r(D.length)];
    return s;
  }
  function formUsuario(u) {
    const novo = !u;
    u = u || { nome: '', email: '', perfil: 'visualizador', abas: ['mon', 'nao'], ativo: true };
    const self = u.id === ME.id;
    const b = modal(`<h3>${novo ? 'Cadastrar novo usuário' : 'Editar usuário'}</h3>
     <p>${novo ? 'Informe os dados de acesso. O usuário receberá uma senha provisória e definirá a própria senha no primeiro acesso.' : 'Altere o perfil, as abas liberadas ou redefina a senha.'}</p>
     <form class="ua-form" novalidate>
      <div class="ua-err" hidden></div>
      <div class="ua-grid">
       <div class="ua-f"><label for="u-nome">Nome completo</label><input type="text" id="u-nome" value="${h(u.nome)}" required maxlength="120"></div>
       <div class="ua-f"><label for="u-email">Usuário ou e-mail (login)</label><input type="text" id="u-email" autocapitalize="none" spellcheck="false" placeholder="ex.: marcos" value="${h(u.email)}" required maxlength="160" autocomplete="off"></div>
      </div>
      <div class="ua-f"><span class="lb">Perfil de acesso</span><div class="ua-opts">
       ${['admin', 'editor', 'visualizador'].map(p => `<label class="ua-opt"><input type="radio" name="perfil" value="${p}" ${u.perfil === p ? 'checked' : ''} ${self && p !== 'admin' ? 'disabled' : ''}><div><b>${PERFIL[p]}</b><span>${PERFIL_D[p]}</span></div></label>`).join('')}
      </div></div>
      <div class="ua-f"><span class="lb">Abas liberadas</span><div class="ua-opts">
       ${['mon', 'nao'].map(t => `<label class="ua-opt"><input type="checkbox" name="abas" value="${t}" ${u.abas.includes(t) ? 'checked' : ''}><div><b>${ABA[t]}</b><span>${t === 'mon' ? 'Painel de sites monitorados' : 'Painel de sites não monitorados'}</span></div></label>`).join('')}
      </div></div>
      <div class="ua-f"><label for="u-senha">${novo ? 'Senha provisória' : 'Redefinir senha (opcional)'}</label>
       <div class="ua-pw"><input type="text" id="u-senha" autocomplete="new-password" placeholder="${novo ? '' : 'Deixe em branco para manter a atual'}" value="${novo ? gerarSenha() : ''}"><button type="button" class="ua-btn" id="u-gen" title="Gerar senha">${svg(I.dice)}Gerar</button></div>
       <span class="hint2">Mínimo de 8 caracteres, com letras e números. Copie e envie ao usuário por um canal seguro.</span></div>
      <label class="ua-check"><input type="checkbox" id="u-troca" checked> Exigir troca de senha no próximo acesso</label>
      ${self ? '' : `<label class="ua-check"><input type="checkbox" id="u-ativo" ${u.ativo ? 'checked' : ''}> Usuário ativo (pode acessar o sistema)</label>`}
      <div class="row"><button type="button" class="btn" data-x>Cancelar</button><button type="submit" class="btn pri">${novo ? 'Cadastrar usuário' : 'Salvar alterações'}</button></div>
     </form>`);
    const er = b.querySelector('.ua-err');
    b.querySelector('[data-x]').onclick = () => md.hidden = true;
    b.querySelector('#u-gen').onclick = () => { b.querySelector('#u-senha').value = gerarSenha(); };
    b.querySelector('form').onsubmit = async e => {
      e.preventDefault(); er.hidden = true;
      const senha = b.querySelector('#u-senha').value.trim();
      const body = {
        nome: b.querySelector('#u-nome').value, email: b.querySelector('#u-email').value,
        perfil: (b.querySelector('input[name=perfil]:checked') || {}).value,
        abas: [...b.querySelectorAll('input[name=abas]:checked')].map(x => x.value),
        ativo: self ? true : b.querySelector('#u-ativo').checked,
        trocarSenha: b.querySelector('#u-troca').checked
      };
      if (senha) body.senha = senha;
      try {
        if (novo) await api('POST', '/api/usuarios', body); else await api('PUT', '/api/usuarios/' + u.id, body);
        md.hidden = true;
        say(novo ? `Usuário ${body.nome} cadastrado.${senha ? ' Senha provisória: ' + senha : ''}` : 'Usuário atualizado.');
        carregar();
      } catch (x) { er.textContent = x.message; er.hidden = false; er.scrollIntoView({ block: 'nearest' }); }
    };
  }

  api('GET', '/api/usuarios').then(j => { USERS = j.usuarios; q('#cnt-users').textContent = USERS.length; }).catch(() => { });
  if (window.__HASH0 === '#usuarios') abrirUsuarios(true);
})();

/* ===== Layout de sistema (mesmo padrão do sistema de Chamados) =====
 * Menu lateral com seções, rodapé com o usuário, barra superior com título e ações.
 * Roda depois de painel-auth.js e só reorganiza os elementos do painel (a lógica continua a mesma).
 */
(function () {
  'use strict';
  const q = s => document.querySelector(s);
  const app = q('#app'), tabs = q('.tabs'), actions = q('.hdr .actions');
  if (!app || !tabs || !actions || document.body.classList.contains('sys')) return;
  const ME = (window.__SESSAO || {}).usuario || {};
  const PERFIL = { admin: 'Administrador', editor: 'Gestor', visualizador: 'Supervisor' };
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ini = n => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = {
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M15 8l2 2"/>',
    out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7m0 0-3-3m3 3 3-3M10 18h4"/>',
    up: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>',
    down: '<path d="M12 15V3m0 0L8 7m4-4 4 4M4 17v3h16v-3"/>',
    cv: '<path d="m6 9 6 6 6-6"/>',
    xls: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/>',
    json: '<path d="M8 4c-2 0-2 2-2 4s-2 4-2 4 2 2 2 4 0 4 2 4M16 4c2 0 2 2 2 4s2 4 2 4-2 2-2 4 0 4-2 4"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
    code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>'
  };
  const LOGO = window.SSM_ASSETS ? window.SSM_ASSETS + 'logo-cpfl.png' : '/assets/icons/logo-cpfl.png';
  const B = document.body;
  B.classList.add('sys');

  /* ---------- menu lateral ---------- */
  const sb = document.createElement('aside');
  sb.className = 'sb no-pdf';
  sb.innerHTML = `<div class="sb-brand"><img class="logo-cpfl" src="${LOGO}" alt="CPFL Energia">
     <div class="sb-txt"><b>Segurança Empresarial</b><small>Sistema de sites monitorados</small></div></div>
    <nav class="sb-menu" aria-label="Menu principal"><div class="sec">Painéis</div></nav>
    <div class="sb-foot">
     <div class="sb-eu"><div class="sb-av">${h(ini(ME.nome))}</div><div><b title="${h(ME.email)}">${h(ME.nome || '')}</b><small>${h(PERFIL[ME.perfil] || '')}</small></div></div>
     <div class="sb-info" id="sb-info"></div>
     <div class="sb-2"><button type="button" data-go="senha" title="Trocar minha senha">${svg(I.key)}<span>Minha senha</span></button><button type="button" data-go="sair" title="Sair do sistema">${svg(I.out)}<span>Sair</span></button></div>
    </div>`;
  const nav = sb.querySelector('.sb-menu');
  nav.append(tabs);
  // rótulo de cada item em <span> (para o modo só-ícones) + dica ao passar o mouse
  tabs.querySelectorAll('.tab').forEach(b => {
    [...b.childNodes].forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) { const s = document.createElement('span'); s.className = 'lb'; s.textContent = n.textContent.trim(); n.replaceWith(s); } });
    const l = b.querySelector('.lb'); if (l) b.title = l.textContent;
  });
  const tu = q('#tab-users');
  if (tu) { const s = document.createElement('div'); s.className = 'sec'; s.textContent = 'Administração'; tabs.insertBefore(s, tu); }
  if (window.SSM_PWA) {
    const s = document.createElement('div'); s.className = 'sec'; s.textContent = 'Aplicativo';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sb-it'; b.setAttribute('data-install', ''); b.title = 'Instalar o sistema como aplicativo neste aparelho';
    b.innerHTML = svg(I.phone) + '<span class="lb">Instalar aplicativo</span>';
    nav.append(s, b); window.SSM_PWA.sync();
    if (b.hidden) s.hidden = true;
  }
  // "Minha senha" e "Sair" usam as mesmas ações do menu do usuário
  sb.querySelectorAll('[data-go]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const alvo = q(`.ua-menu [data-a="${b.dataset.go}"]`);
    if (alvo) alvo.click();
  });

  /* ---------- barra superior ---------- */
  const main = document.createElement('div');
  main.className = 'sys-main';
  const tb = document.createElement('header');
  tb.className = 'tb no-pdf';
  tb.innerHTML = '<div><h1 id="tb-t"></h1><div class="sub" id="tb-s"></div></div><div class="dir"></div>';
  const dir = tb.querySelector('.dir');
  app.before(sb);
  sb.after(main);
  main.append(tb, app);
  dir.append(actions);

  // botões agrupados: Importar ▾ / Exportar ▾ (os originais continuam funcionando, só ficam ocultos)
  const grupo = (rotulo, icone, pri, itens) => {
    itens = itens.filter(([id]) => { const b = q(id); return b && !b.hidden; });
    if (!itens.length) return null;
    const w = document.createElement('div'); w.className = 'dd';
    w.innerHTML = `<button type="button" class="btn ${pri ? 'pri' : ''}" aria-haspopup="menu" aria-expanded="false">${svg(icone)}${rotulo}<svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${I.cv}</svg></button><div class="dd-menu" role="menu" hidden></div>`;
    const bt = w.firstElementChild, mn = w.lastElementChild;
    itens.forEach(([id, ic, t, d]) => {
      const o = q(id); o.classList.add('sys-hide');
      const it = document.createElement('button'); it.type = 'button'; it.setAttribute('role', 'menuitem');
      it.innerHTML = `${svg(ic)}<span>${t}<small>${d}</small></span>`;
      it.onclick = () => { mn.hidden = true; bt.setAttribute('aria-expanded', 'false'); o.click(); };
      mn.append(it);
    });
    bt.onclick = e => { e.stopPropagation(); const ab = mn.hidden; document.querySelectorAll('.dd-menu').forEach(x => x.hidden = true); mn.hidden = !ab; bt.setAttribute('aria-expanded', String(ab)); };
    return w;
  };
  const gImp = grupo('Importar', I.up, true, [
    ['#b-add', I.xls, 'Planilha (.xlsx / .csv)', 'Atualiza a base da aba atual'],
    ['#b-imp', I.json, 'Arquivo JSON', 'Base exportada por este sistema'],
    ['#b-prt', I.img, 'Prints dos mosaicos', 'Imagens com o nome da unidade']]);
  const gExp = grupo('Exportar', I.down, false, [
    ['#b-pdf', I.pdf, 'Relatório em PDF', 'Painel completo com os filtros atuais'],
    ['#b-html', I.code, 'Página HTML', 'Painel offline para compartilhar'],
    ['#b-exp', I.json, 'Arquivo JSON', 'Cópia da base da aba atual']]);
  const theme = q('#b-theme');
  [gImp, gExp].forEach(g => g && actions.insertBefore(g, theme || null));
  ['#b-add', '#b-imp', '#b-prt'].forEach(id => { const b = q(id); if (b && b.hidden) b.classList.add('sys-hide'); });
  const chip = q('.ua-user'); if (chip) chip.classList.add('sys-hide'); // o usuário fica no rodapé do menu
  document.addEventListener('click', () => document.querySelectorAll('.dd-menu').forEach(x => x.hidden = true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.dd-menu').forEach(x => x.hidden = true); });

  /* ---------- título e subtítulo acompanham a aba aberta ---------- */
  const tT = q('#tb-t'), tS = q('#tb-s'), info = q('#sb-info');
  function sync() {
    const um = app.classList.contains('users-mode');
    B.classList.toggle('users-mode', um);
    tT.textContent = (q('#ttl') || {}).textContent || '';
    tS.textContent = um ? 'Usuários, perfis de acesso, bases de dados e registro de atividades' : ((q('#src') || {}).textContent || '');
    const n = t => { const c = q('#cnt-' + t); return c && c.textContent ? c.textContent : '0'; };
    info.textContent = `${n('mon')} sites monitorados · ${n('nao')} não monitorados`;
  }
  const mo = new MutationObserver(sync);
  ['#ttl', '#src', '#cnt-mon', '#cnt-nao'].forEach(s => { const e = q(s); if (e) mo.observe(e, { childList: true, characterData: true, subtree: true }); });
  mo.observe(app, { attributes: true, attributeFilter: ['class'] });
  sync();
})();

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

