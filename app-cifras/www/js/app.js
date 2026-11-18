import { CONFIG } from './config.js';
import { listarMusicas, obterMusica, salvarMusica, excluirMusica, importarMusicas, novoId } from './db.js';
import { analisar, desenhar, linhasDeLetra, transporAcorde, preferirBemol, ehAcorde } from './cifra.js';
import { estaAtivado, ativar, codigoDoAparelho } from './licenca.js';
import { SeguidorDeVoz } from './voz.js';
import {
  manterTelaLigada, copiarTexto, lerAreaDeTransferencia, compartilharArquivo, abrirLinkExterno,
} from './nativo.js';

const app = document.getElementById('app');
const estado = { ativado: false };
let limparTela = null;

// ---------------------------------------------------------------- ícones
const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  voltar: svg('<path d="M15 18l-6-6 6-6"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  busca: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  mais: svg('<path d="M12 5v14M5 12h14"/>'),
  menos: svg('<path d="M5 12h14"/>'),
  play: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
  pausa: svg('<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  editar: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  copiar: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  zap: svg('<path d="M20.5 3.5A11 11 0 0 0 3.6 17.2L2.5 21.5l4.4-1.1A11 11 0 0 0 20.5 3.5z"/><path d="M8.5 8.5c.5 2.5 2.5 5 5.5 6l1.5-1.5 2 1-.5 2c-4 .5-9.5-4.5-9-9l2-.5 1 2z"/>'),
  colar: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
  cadeado: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  ok: svg('<path d="M20 6L9 17l-5-5"/>'),
  baixar: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  subir: svg('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
  lixo: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  nota: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
};

// ---------------------------------------------------------------- utilidades
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function aviso(texto, tipo = '') {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.className = 'mostrar ' + tipo;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.className = ''), 2600);
}

function matiz(texto) {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const ir = (rota) => (location.hash = rota);

function cabecalho(titulo, { voltar = '#/', direita = '', subtitulo = '' } = {}) {
  return `<header class="topo">
    <button class="icone-btn" data-voltar="${voltar}" aria-label="Voltar">${I.voltar}</button>
    <div class="topo-titulo"><h1>${esc(titulo)}</h1>${subtitulo ? `<p>${esc(subtitulo)}</p>` : ''}</div>
    ${direita || '<span class="icone-btn fantasma"></span>'}
  </header>`;
}

// Navegação delegada
app.addEventListener('click', (e) => {
  const alvo = e.target.closest('[data-ir],[data-voltar]');
  if (!alvo) return;
  if (alvo.dataset.ir) ir(alvo.dataset.ir);
  else if (history.length > 1 && sessionStorage.getItem('palco.navegou')) history.back();
  else location.replace(alvo.dataset.voltar);
});

async function podeAdicionar() {
  if (estado.ativado) return true;
  const total = (await listarMusicas()).length;
  return total < CONFIG.limiteTeste;
}

// ---------------------------------------------------------------- rotas
async function rotear() {
  if (limparTela) {
    const f = limparTela;
    limparTela = null;
    await f();
  }
  const [, rota = '', id] = location.hash.replace(/^#\/?/, '#/').split('/');
  if (!estado.ativado && CONFIG.limiteTeste === 0 && rota !== 'ativar') {
    return location.replace('#/ativar');
  }
  window.scrollTo(0, 0);
  switch (rota) {
    case 'nova': return telaEditor(null);
    case 'editar': return telaEditor(id);
    case 'tocar': return telaPlayer(id);
    case 'ajustes': return telaAjustes();
    case 'ativar': return telaAtivacao();
    default: return telaBiblioteca();
  }
}

// ---------------------------------------------------------------- biblioteca
async function telaBiblioteca() {
  const musicas = await listarMusicas();
  const restante = Math.max(0, CONFIG.limiteTeste - musicas.length);
  app.innerHTML = `
    <header class="topo topo-inicio">
      <div class="marca">
        <img src="img/icone.svg" alt="" />
        <div><h1>${esc(CONFIG.nomeApp)}</h1><p>${musicas.length} ${musicas.length === 1 ? 'música' : 'músicas'}</p></div>
      </div>
      <button class="icone-btn" data-ir="#/ajustes" aria-label="Ajustes">${I.ajustes}</button>
    </header>
    ${estado.ativado ? '' : `
      <button class="faixa-teste" data-ir="#/ativar">
        <span class="faixa-icone">${I.cadeado}</span>
        <span><strong>Versão de teste</strong><small>${restante > 0 ? `Você ainda pode adicionar ${restante} ${restante === 1 ? 'música' : 'músicas'}` : 'Limite de músicas atingido'}. Toque para ativar.</small></span>
      </button>`}
    <label class="busca">${I.busca}<input type="search" id="busca" placeholder="Buscar música ou artista" autocomplete="off" /></label>
    <main class="lista" id="lista"></main>
    <button class="fab" id="nova">${I.mais}<span>Nova música</span></button>`;

  const lista = document.getElementById('lista');
  const desenharLista = (filtro = '') => {
    const f = filtro.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const itens = musicas.filter((m) =>
      `${m.titulo} ${m.artista}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(f));
    if (!musicas.length) {
      lista.innerHTML = `<div class="vazio">${I.nota}<h2>Nenhuma música ainda</h2><p>Toque em <b>Nova música</b> e cole sua primeira cifra.</p></div>`;
      return;
    }
    if (!itens.length) {
      lista.innerHTML = `<div class="vazio pequeno"><p>Nada encontrado para “${esc(filtro)}”.</p></div>`;
      return;
    }
    lista.innerHTML = itens.map((m) => `
      <button class="cartao" data-ir="#/tocar/${m.id}">
        <span class="avatar" style="--h:${matiz(m.titulo)}">${esc(m.titulo.trim()[0] || '♪').toUpperCase()}</span>
        <span class="info"><strong>${esc(m.titulo)}</strong><small>${esc(m.artista || 'Artista não informado')}</small></span>
        ${m.tom ? `<span class="chip">${esc(transporAcorde(m.tom, m.semitons || 0, preferirBemol(m.tom, m.semitons || 0)))}</span>` : ''}
      </button>`).join('');
  };
  desenharLista();
  document.getElementById('busca').addEventListener('input', (e) => desenharLista(e.target.value));
  document.getElementById('nova').addEventListener('click', async () => {
    if (await podeAdicionar()) ir('#/nova');
    else {
      aviso('Ative o app para adicionar mais músicas');
      ir('#/ativar');
    }
  });
}

// ---------------------------------------------------------------- editor
async function telaEditor(id) {
  const musica = id ? await obterMusica(id) : null;
  if (id && !musica) return location.replace('#/');
  if (!id && !(await podeAdicionar())) return location.replace('#/ativar');

  app.innerHTML = `
    ${cabecalho(musica ? 'Editar música' : 'Nova música', {
      voltar: musica ? `#/tocar/${musica.id}` : '#/',
      direita: '<button class="btn primario pequeno" id="salvar">Salvar</button>',
    })}
    <main class="formulario">
      <label class="campo"><span>Título</span><input id="f-titulo" maxlength="120" placeholder="Nome da música" value="${esc(musica?.titulo)}" /></label>
      <div class="dupla">
        <label class="campo"><span>Artista</span><input id="f-artista" maxlength="120" placeholder="Opcional" value="${esc(musica?.artista)}" /></label>
        <label class="campo campo-tom"><span>Tom</span><input id="f-tom" maxlength="8" placeholder="Auto" value="${esc(musica?.tom)}" /></label>
      </div>
      <label class="campo"><span>Cifra</span>
        <textarea id="f-cifra" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Cole aqui a cifra.

[Intro] G D Em C

G              D
Acordes na linha de cima
Em             C
e a letra logo abaixo">${esc(musica?.cifra)}</textarea>
      </label>
      <p class="dica">Os acordes devem ficar na linha de <b>cima</b> da letra. Marque as partes com colchetes, como <b>[Refrão]</b>.</p>
      ${musica ? `<button class="btn perigo" id="excluir">${I.lixo} Excluir música</button>` : ''}
    </main>`;

  document.getElementById('salvar').addEventListener('click', async () => {
    const titulo = document.getElementById('f-titulo').value.trim();
    const cifra = document.getElementById('f-cifra').value;
    if (!titulo) {
      aviso('Dê um nome para a música', 'erro');
      document.getElementById('f-titulo').focus();
      return;
    }
    if (!cifra.trim()) {
      aviso('Cole a cifra da música', 'erro');
      document.getElementById('f-cifra').focus();
      return;
    }
    let tom = document.getElementById('f-tom').value.trim();
    if (!tom) {
      const primeira = analisar(cifra).find((l) => l.tipo === 'acordes');
      tom = primeira ? primeira.texto.trim().split(/\s+/).find(ehAcorde)?.replace(/[()]/g, '').split('/')[0] || '' : '';
    }
    const dados = {
      ...(musica || { id: novoId(), criadoEm: Date.now(), velocidade: 5, semitons: 0, fonte: 18 }),
      titulo,
      artista: document.getElementById('f-artista').value.trim(),
      tom,
      cifra,
    };
    await salvarMusica(dados);
    aviso('Música salva', 'ok');
    if (musica && sessionStorage.getItem('palco.navegou')) history.back();
    else location.replace(`#/tocar/${dados.id}`);
  });

  document.getElementById('excluir')?.addEventListener('click', async () => {
    if (!confirm(`Excluir “${musica.titulo}”? Essa ação não pode ser desfeita.`)) return;
    await excluirMusica(musica.id);
    aviso('Música excluída');
    location.replace('#/');
  });
}

// ---------------------------------------------------------------- player
async function telaPlayer(id) {
  const musica = await obterMusica(id);
  if (!musica) return location.replace('#/');
  const linhas = analisar(musica.cifra);
  const cfg = { velocidade: musica.velocidade ?? 5, semitons: musica.semitons ?? 0, fonte: musica.fonte ?? 18 };

  app.innerHTML = `
    <div class="player">
      ${cabecalho(musica.titulo, {
        subtitulo: musica.artista,
        direita: `<button class="icone-btn" data-ir="#/editar/${musica.id}" aria-label="Editar">${I.editar}</button>`,
      })}
      <main class="cifra" id="cifra" tabindex="-1"><div id="conteudo"></div><div class="espaco-final"></div></main>
      <div class="indicador-voz" id="ind-voz"><span></span>Ouvindo…</div>
      <section class="controles" id="controles">
        <div class="ctrl-linha">
          <div class="grupo"><span class="rot">Tom</span>
            <button data-a="tom-" aria-label="Baixar tom">${I.menos}</button>
            <b id="v-tom" class="valor"></b>
            <button data-a="tom+" aria-label="Subir tom">${I.mais}</button>
          </div>
          <div class="grupo"><span class="rot">Letra</span>
            <button data-a="fonte-" aria-label="Diminuir letra" class="txt">A−</button>
            <button data-a="fonte+" aria-label="Aumentar letra" class="txt">A+</button>
          </div>
        </div>
        <div class="ctrl-linha principal">
          <button class="redondo" data-a="voz" id="b-voz" aria-pressed="false" aria-label="Seguir minha voz">${I.mic}</button>
          <button data-a="vel-" class="redondo" aria-label="Mais devagar">${I.menos}</button>
          <button class="play" data-a="play" id="b-play" aria-label="Rolar">${I.play}</button>
          <button data-a="vel+" class="redondo" aria-label="Mais rápido">${I.mais}</button>
          <div class="vel"><b id="v-vel"></b><small>velocidade</small></div>
        </div>
      </section>
    </div>`;

  const cifraEl = document.getElementById('cifra');
  const conteudo = document.getElementById('conteudo');
  const bPlay = document.getElementById('b-play');
  const bVoz = document.getElementById('b-voz');
  const indVoz = document.getElementById('ind-voz');

  const desenharCifra = () => {
    const bemol = preferirBemol(musica.tom, cfg.semitons);
    conteudo.innerHTML = desenhar(linhas, cfg.semitons, bemol);
    cifraEl.style.setProperty('--fonte', cfg.fonte + 'px');
    document.getElementById('v-tom').textContent = musica.tom
      ? transporAcorde(musica.tom, cfg.semitons, bemol)
      : (cfg.semitons > 0 ? '+' : '') + cfg.semitons;
    document.getElementById('v-vel').textContent = cfg.velocidade;
  };
  desenharCifra();

  let salvarTimer;
  const guardar = () => {
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(() => salvarMusica({ ...musica, ...cfg }), 500);
  };

  // ---- rolagem automática
  let rolando = false, quadro = 0, ultimo = 0, posicao = 0;
  const passo = (agora) => {
    if (!rolando) return;
    const dt = Math.min(0.1, (agora - ultimo) / 1000);
    ultimo = agora;
    if (Math.abs(cifraEl.scrollTop - posicao) > 3) posicao = cifraEl.scrollTop; // usuário arrastou
    posicao += cfg.velocidade * 5.5 * (cfg.fonte / 18) * dt;
    cifraEl.scrollTop = posicao;
    if (cifraEl.scrollTop + cifraEl.clientHeight >= cifraEl.scrollHeight - 2) return alternarRolagem(false);
    quadro = requestAnimationFrame(passo);
  };
  const alternarRolagem = (ligar = !rolando) => {
    if (ligar && seguidor) pararVoz();
    rolando = ligar;
    bPlay.innerHTML = ligar ? I.pausa : I.play;
    bPlay.classList.toggle('ativo', ligar);
    cancelAnimationFrame(quadro);
    if (ligar) {
      posicao = cifraEl.scrollTop;
      ultimo = performance.now();
      quadro = requestAnimationFrame(passo);
    }
  };

  // ---- seguir a voz
  let seguidor = null;
  const irParaLinha = (i) => {
    const alvo = conteudo.querySelector(`[data-l="${i}"]`);
    if (!alvo) return;
    conteudo.querySelectorAll('.ln.atual').forEach((el) => el.classList.remove('atual'));
    alvo.classList.add('atual');
    const ancora = alvo.previousElementSibling?.classList.contains('acordes') ? alvo.previousElementSibling : alvo;
    cifraEl.scrollTo({ top: ancora.offsetTop - cifraEl.clientHeight * 0.28, behavior: 'smooth' });
  };
  const pararVoz = async () => {
    if (!seguidor) return;
    const s = seguidor;
    seguidor = null;
    bVoz.classList.remove('ativo');
    bVoz.setAttribute('aria-pressed', 'false');
    await s.parar();
  };
  const ligarVoz = async () => {
    if (!(await SeguidorDeVoz.disponivel())) {
      aviso('Reconhecimento de voz indisponível neste aparelho', 'erro');
      return;
    }
    alternarRolagem(false);
    seguidor = new SeguidorDeVoz(linhasDeLetra(linhas), irParaLinha, (ouvindo) =>
      indVoz.classList.toggle('mostrar', ouvindo && !!seguidor));
    bVoz.classList.add('ativo');
    bVoz.setAttribute('aria-pressed', 'true');
    try {
      await seguidor.iniciar();
      aviso('Cante: a cifra vai acompanhar sua voz');
    } catch (e) {
      aviso(e.message || 'Não foi possível usar o microfone', 'erro');
      await pararVoz();
    }
  };

  // ---- botões
  document.getElementById('controles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    switch (b.dataset.a) {
      case 'play': alternarRolagem(); break;
      case 'vel-': cfg.velocidade = Math.max(1, cfg.velocidade - 1); break;
      case 'vel+': cfg.velocidade = Math.min(20, cfg.velocidade + 1); break;
      case 'tom-': cfg.semitons = (cfg.semitons - 1) % 12; break;
      case 'tom+': cfg.semitons = (cfg.semitons + 1) % 12; break;
      case 'fonte-': cfg.fonte = Math.max(12, cfg.fonte - 2); break;
      case 'fonte+': cfg.fonte = Math.min(40, cfg.fonte + 2); break;
      case 'voz': seguidor ? pararVoz() : ligarVoz(); return;
    }
    if (b.dataset.a !== 'play') {
      desenharCifra();
      guardar();
    }
  });

  // Toque na cifra esconde/mostra os controles (mais espaço para ler)
  let toqueInicio = null;
  cifraEl.addEventListener('pointerdown', (e) => (toqueInicio = { x: e.clientX, y: e.clientY, t: Date.now() }));
  cifraEl.addEventListener('pointerup', (e) => {
    if (!toqueInicio) return;
    const moveu = Math.hypot(e.clientX - toqueInicio.x, e.clientY - toqueInicio.y) > 10;
    if (!moveu && Date.now() - toqueInicio.t < 350) app.querySelector('.player').classList.toggle('foco');
    toqueInicio = null;
  });

  // Pedal Bluetooth / teclado
  const teclas = (e) => {
    if (['PageDown', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      cifraEl.scrollBy({ top: cifraEl.clientHeight * 0.6, behavior: 'smooth' });
    } else if (['PageUp', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      cifraEl.scrollBy({ top: -cifraEl.clientHeight * 0.6, behavior: 'smooth' });
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'MediaPlayPause') {
      e.preventDefault();
      alternarRolagem();
    }
  };
  document.addEventListener('keydown', teclas);
  manterTelaLigada(true);

  limparTela = async () => {
    document.removeEventListener('keydown', teclas);
    alternarRolagem(false);
    await pararVoz();
    clearTimeout(salvarTimer);
    await salvarMusica({ ...musica, ...cfg });
    manterTelaLigada(false);
  };
}

// ---------------------------------------------------------------- ajustes
async function telaAjustes() {
  const codigo = await codigoDoAparelho();
  const total = (await listarMusicas()).length;
  app.innerHTML = `
    ${cabecalho('Ajustes')}
    <main class="ajustes">
      <section class="painel">
        <h2>Licença</h2>
        ${estado.ativado
          ? `<div class="status ok">${I.ok}<div><strong>Ativado neste aparelho</strong><small>Obrigado pela compra!</small></div></div>`
          : `<div class="status">${I.cadeado}<div><strong>Versão de teste</strong><small>${total} de ${CONFIG.limiteTeste} músicas usadas</small></div></div>
             <button class="btn primario" data-ir="#/ativar">Ativar agora</button>`}
        <div class="linha-info"><span>Código do aparelho</span><code>${codigo}</code></div>
        ${CONFIG.chaveDeTeste ? '<p class="alerta">Este aplicativo está usando a <b>chave de teste</b>. Troque pela sua chave definitiva antes de vender (veja o LEIAME).</p>' : ''}
      </section>
      <section class="painel">
        <h2>Cópia de segurança</h2>
        <p class="texto">Suas músicas ficam salvas só neste celular. Faça uma cópia para não perder nada ao trocar de aparelho.</p>
        <div class="botoes">
          <button class="btn" id="exportar">${I.baixar} Exportar</button>
          <button class="btn" id="importar">${I.subir} Importar</button>
        </div>
        <input type="file" id="arquivo" accept="application/json,.json" hidden />
      </section>
      <section class="painel">
        <h2>Dicas</h2>
        <ul class="dicas">
          <li><b>Rolar sozinha:</b> toque no play e ajuste a velocidade com − e +.</li>
          <li><b>Seguir a voz:</b> toque no microfone e cante. A cifra acompanha a letra.</li>
          <li><b>Pedal Bluetooth:</b> funciona para avançar, voltar e dar play.</li>
          <li><b>Tela cheia:</b> toque na cifra para esconder os controles.</li>
        </ul>
      </section>
      <p class="versao">${esc(CONFIG.nomeApp)} · versão 1.0</p>
    </main>`;

  document.getElementById('exportar').addEventListener('click', async () => {
    const musicas = await listarMusicas();
    const dados = JSON.stringify({ app: 'palco', versao: 1, exportadoEm: new Date().toISOString(), musicas }, null, 1);
    const data = new Date().toISOString().slice(0, 10);
    try {
      await compartilharArquivo(`palco-backup-${data}.json`, dados);
    } catch (e) {
      if (!/cancel/i.test(e?.message || '')) aviso('Não foi possível exportar', 'erro');
    }
  });
  const arquivo = document.getElementById('arquivo');
  document.getElementById('importar').addEventListener('click', () => arquivo.click());
  arquivo.addEventListener('change', async () => {
    const f = arquivo.files[0];
    if (!f) return;
    try {
      const dados = JSON.parse(await f.text());
      const lista = Array.isArray(dados) ? dados : dados.musicas;
      if (!Array.isArray(lista)) throw new Error();
      const atuais = (await listarMusicas()).length;
      if (!estado.ativado && atuais + lista.length > CONFIG.limiteTeste) {
        aviso('Ative o app para importar todas as músicas', 'erro');
        return;
      }
      const n = await importarMusicas(lista);
      aviso(`${n} ${n === 1 ? 'música importada' : 'músicas importadas'}`, 'ok');
    } catch {
      aviso('Arquivo de backup inválido', 'erro');
    }
    arquivo.value = '';
  });
}

// ---------------------------------------------------------------- ativação
async function telaAtivacao() {
  const codigo = await codigoDoAparelho();
  const obrigatorio = CONFIG.limiteTeste === 0;
  if (estado.ativado) return location.replace('#/ajustes');

  app.innerHTML = `
    ${obrigatorio ? '' : cabecalho('Ativação')}
    <main class="ativacao">
      <div class="heroi">
        <img src="img/icone.svg" alt="" />
        <h1>Ative o ${esc(CONFIG.nomeApp)}</h1>
        <p>Libere músicas ilimitadas neste aparelho. A ativação é feita uma única vez.</p>
      </div>

      <section class="passo">
        <div class="passo-topo"><span class="num">1</span><h2>Envie o código deste aparelho</h2></div>
        <div class="codigo-aparelho" id="codigo">${codigo}</div>
        <div class="botoes">
          <button class="btn" id="copiar">${I.copiar} Copiar</button>
          <button class="btn whatsapp" id="whats">${I.zap} WhatsApp</button>
        </div>
      </section>

      <section class="passo">
        <div class="passo-topo"><span class="num">2</span><h2>Cole o código de ativação</h2></div>
        <div class="campo-colar">
          <textarea id="cod-ativacao" rows="3" spellcheck="false" autocapitalize="characters" autocomplete="off" placeholder="Cole aqui o código que você recebeu"></textarea>
          <button class="icone-btn" id="colar" aria-label="Colar">${I.colar}</button>
        </div>
        <button class="btn primario grande" id="ativar">Ativar</button>
      </section>
      ${obrigatorio ? '' : '<button class="link" data-ir="#/">Continuar na versão de teste</button>'}
    </main>`;

  document.getElementById('copiar').addEventListener('click', async () => {
    aviso((await copiarTexto(codigo)) ? 'Código copiado' : 'Não foi possível copiar', 'ok');
  });
  document.getElementById('whats').addEventListener('click', () => {
    const texto = `Olá! Quero ativar o ${CONFIG.nomeApp}.\nCódigo do meu aparelho: ${codigo}`;
    abrirLinkExterno(`https://wa.me/${CONFIG.whatsappVendedor}?text=${encodeURIComponent(texto)}`);
  });
  const campo = document.getElementById('cod-ativacao');
  document.getElementById('colar').addEventListener('click', async () => {
    const t = await lerAreaDeTransferencia();
    if (t) campo.value = t.trim();
    else {
      campo.focus();
      aviso('Toque e segure no campo para colar');
    }
  });
  const botao = document.getElementById('ativar');
  botao.addEventListener('click', async () => {
    if (!campo.value.trim()) {
      aviso('Cole o código de ativação', 'erro');
      return campo.focus();
    }
    botao.disabled = true;
    botao.textContent = 'Verificando…';
    const ok = await ativar(campo.value);
    if (ok) {
      estado.ativado = true;
      app.innerHTML = `<main class="sucesso"><div class="selo">${I.ok}</div><h1>Tudo pronto!</h1>
        <p>O ${esc(CONFIG.nomeApp)} foi ativado neste aparelho.</p>
        <button class="btn primario grande" id="comecar">Começar</button></main>`;
      document.getElementById('comecar').addEventListener('click', () => location.replace('#/'));
    } else {
      botao.disabled = false;
      botao.textContent = 'Ativar';
      campo.classList.add('invalido');
      setTimeout(() => campo.classList.remove('invalido'), 600);
      aviso('Código inválido para este aparelho', 'erro');
    }
  });
}

// ---------------------------------------------------------------- início
const EXEMPLO = `[Intro] G  D  Em  C

[Primeira parte]
G                 D
Esta é uma cifra de exemplo
Em                C
Toque no play para ela rolar
G                   D
Use o tom para transpor os acordes
Em            C          D
E o A+ para a letra aumentar

[Refrão]
C              G
Ligue o microfone e cante
D                Em
A cifra acompanha a sua voz
C               G
Edite ou apague esta música
D                   G
E cadastre as suas depois`;

async function iniciar() {
  estado.ativado = await estaAtivado();
  if (!localStorage.getItem('palco.exemplo')) {
    localStorage.setItem('palco.exemplo', '1');
    if (!(await listarMusicas()).length) {
      await salvarMusica({
        id: novoId(), criadoEm: Date.now(), titulo: 'Como usar o Palco', artista: 'Exemplo',
        tom: 'G', cifra: EXEMPLO, velocidade: 5, semitons: 0, fonte: 18,
      });
    }
  }
  window.addEventListener('hashchange', () => {
    sessionStorage.setItem('palco.navegou', '1');
    rotear();
  });
  rotear();
}

iniciar();
