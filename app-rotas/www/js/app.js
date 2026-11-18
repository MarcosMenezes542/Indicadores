import { CONFIG } from './config.js';
import {
  listarParadas, obterParada, salvarParada, salvarParadas, excluirParada, apagarTodas, importarParadas, novoId,
} from './db.js';
import {
  lerLicenca, ativar, codigoDoAparelho, tempoRestante, formatarData, NOMES_TIPO,
} from './licenca.js';
import {
  temCoord, minhaPosicao, posicaoConhecida, acompanharPosicao, buscarEndereco, enderecoDaPosicao, lerCoordenadas,
  otimizar, distanciaKm, distanciaTotal, formatarDistancia, trajetoPelasRuas, linkWaze, linkGoogleMaps,
} from './rota.js';
import {
  manterTelaLigada, copiarTexto, lerAreaDeTransferencia, compartilharArquivo, abrirLinkExterno,
} from './nativo.js';

const app = document.getElementById('app');
const estado = { ativado: false, licenca: null };
let limparTela = null;

const CHAVE_EM_ROTA = 'rota.emAndamento';
const emRota = () => localStorage.getItem(CHAVE_EM_ROTA) === '1';
const marcarEmRota = (sim) => (sim ? localStorage.setItem(CHAVE_EM_ROTA, '1') : localStorage.removeItem(CHAVE_EM_ROTA));

// ---------------------------------------------------------------- ícones
const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  voltar: svg('<path d="M15 18l-6-6 6-6"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  mais: svg('<path d="M12 5v14M5 12h14"/>'),
  copiar: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  zap: svg('<path d="M20.5 3.5A11 11 0 0 0 3.6 17.2L2.5 21.5l4.4-1.1A11 11 0 0 0 20.5 3.5z"/><path d="M8.5 8.5c.5 2.5 2.5 5 5.5 6l1.5-1.5 2 1-.5 2c-4 .5-9.5-4.5-9-9l2-.5 1 2z"/>'),
  colar: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
  cadeado: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  ok: svg('<path d="M20 6L9 17l-5-5"/>'),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  baixar: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  subir: svg('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
  lixo: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  pino: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  alvo: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>'),
  caminhao: svg('<path d="M1 6h13v10H1zM14 10h4l4 3v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'),
  fone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
  enviar: '<svg viewBox="0 0 24 24"><path d="M2 3l20 9-20 9 4-9z"/></svg>',
  editar: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>'),
  centro: svg('<path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>'),
};

// ---------------------------------------------------------------- utilidades
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function aviso(texto, tipo = '') {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.className = 'mostrar ' + tipo;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.className = ''), 2800);
}

const ir = (rota) => (location.hash = rota);
// Concluídas ficam antes das pendentes, na ordem em que foram feitas.
const ordemConcluida = () => Date.now() / 1000 - 3e9;
const nomeDe = (p) => p.nome || p.endereco || 'Entrega';
const soNumeros = (t) => String(t || '').replace(/\D/g, '');

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
  else if (history.length > 1 && sessionStorage.getItem('rota.navegou')) history.back();
  else location.replace(alvo.dataset.voltar);
});

/** Janela de baixo com opções. Retorna o texto escolhido ou null. */
function escolher(titulo, opcoes, { outro = true } = {}) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div');
    fundo.className = 'fundo-modal';
    fundo.innerHTML = `<div class="folha" role="dialog" aria-modal="true">
      <h2>${esc(titulo)}</h2>
      ${opcoes.map((o, i) => `<button class="btn" data-i="${i}">${esc(o)}</button>`).join('')}
      ${outro ? '<textarea id="m-outro" placeholder="Outro motivo (opcional)"></textarea><button class="btn laranja" data-outro>Confirmar</button>' : ''}
      <button class="link" data-cancelar>Cancelar</button>
    </div>`;
    const fechar = (v) => {
      fundo.remove();
      resolve(v);
    };
    fundo.addEventListener('click', (e) => {
      if (e.target === fundo || e.target.closest('[data-cancelar]')) return fechar(null);
      const b = e.target.closest('[data-i]');
      if (b) return fechar(opcoes[Number(b.dataset.i)]);
      if (e.target.closest('[data-outro]')) return fechar(fundo.querySelector('#m-outro').value.trim() || 'Não informado');
    });
    document.body.appendChild(fundo);
  });
}

// ---------------------------------------------------------------- licença
async function podeAdicionar() {
  if (estado.ativado) return true;
  return (await listarParadas()).length < CONFIG.limiteTeste;
}

const nomeTipo = (t) => NOMES_TIPO[t] || 'Licença';

function faixaLicenca(restante) {
  const l = estado.licenca;
  const faixa = (titulo, texto, classe = '') => `
    <button class="faixa-teste ${classe}" data-ir="#/ativar">
      <span class="faixa-icone">${I.cadeado}</span>
      <span><strong>${titulo}</strong><small>${texto}</small></span>
    </button>`;
  if (l.ativo) {
    if (!l.expira) return '';
    const faltaMs = l.expira - Date.now();
    if (l.tipo === 'teste') {
      return faixa(`Teste: termina em ${tempoRestante(l.expira)}`, 'Gostou? Toque aqui para comprar.', 'aviso-teste');
    }
    if (faltaMs < 5 * 86400000) {
      return faixa(`Seu plano ${nomeTipo(l.tipo).toLowerCase()} vence em ${tempoRestante(l.expira)}`, 'Toque para renovar e não perder o acesso.', 'aviso-teste');
    }
    return '';
  }
  if (l.relogioAlterado) {
    return faixa('Data do celular incorreta', 'Ative a data e hora automáticas nas configurações do celular.', 'alerta-faixa');
  }
  const limite = restante > 0
    ? `Você ainda pode adicionar ${restante} ${restante === 1 ? 'entrega' : 'entregas'}`
    : 'Limite de entregas atingido';
  if (l.vencido) {
    return faixa(`${l.tipo === 'teste' ? 'Seu teste terminou' : 'Seu acesso venceu'} em ${formatarData(l.expira)}`,
      'Suas entregas continuam salvas. Toque para renovar.', 'alerta-faixa');
  }
  return faixa('Versão de teste', `Até ${CONFIG.limiteTeste} entregas por rota. ${limite}. Toque para ativar.`);
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
    case 'nova': return telaParada(null);
    case 'editar': return telaParada(id);
    case 'rota': return telaRota();
    case 'ajustes': return telaAjustes();
    case 'ativar': return telaAtivacao();
    default: return telaInicio();
  }
}

// ---------------------------------------------------------------- início
function numeroParada(p, i, atualId) {
  if (p.status === 'entregue') return `<span class="numero entregue">${I.ok}</span>`;
  if (p.status === 'nao') return `<span class="numero nao">${I.x}</span>`;
  return `<span class="numero ${p.id === atualId ? 'atual' : ''}">${i}</span>`;
}

function etiquetaParada(p, atualId) {
  if (p.status === 'entregue') return '<span class="etiqueta ok">Entregue</span>';
  if (p.status === 'nao') return `<span class="etiqueta nao">Não entregue${p.motivo ? ': ' + esc(p.motivo) : ''}</span>`;
  if (p.id === atualId) return '<span class="etiqueta agora">Agora</span>';
  if (!temCoord(p)) return '<span class="etiqueta sem">Sem localização no mapa</span>';
  return '';
}

async function telaInicio() {
  const paradas = await listarParadas();
  const pendentes = paradas.filter((p) => p.status === 'pendente');
  const entregues = paradas.filter((p) => p.status === 'entregue').length;
  const naoEntregues = paradas.filter((p) => p.status === 'nao').length;
  const restante = Math.max(0, CONFIG.limiteTeste - paradas.length);
  const andamento = emRota() && pendentes.length > 0;
  const atualId = andamento ? pendentes[0].id : null;
  let n = 0;

  app.innerHTML = `
    <header class="topo topo-inicio">
      <div class="marca">
        <img src="img/icone.svg" alt="" />
        <div><h1>${esc(CONFIG.nomeApp)}</h1><p>${paradas.length ? `${paradas.length} ${paradas.length === 1 ? 'entrega' : 'entregas'} na rota` : 'Nenhuma entrega cadastrada'}</p></div>
      </div>
      <button class="icone-btn" data-ir="#/ajustes" aria-label="Ajustes">${I.ajustes}</button>
    </header>
    ${faixaLicenca(restante)}
    ${paradas.length ? `
      <div class="resumo-inicio">
        <div><b>${pendentes.length}</b><small>A fazer</small></div>
        <div class="ok"><b>${entregues}</b><small>Entregues</small></div>
        <div class="nao"><b>${naoEntregues}</b><small>Não entregues</small></div>
      </div>
      <div class="acoes-inicio">
        ${pendentes.length
          ? `<button class="btn laranja grande" id="iniciar">${I.caminhao} ${andamento ? 'Continuar rota' : 'Iniciar rota'}</button>`
          : `<button class="btn grande" data-ir="#/rota">${I.ok} Ver resumo da rota</button>`}
      </div>
      <h2 class="titulo-secao">${andamento ? 'Sequência das entregas' : 'Entregas cadastradas'}</h2>` : ''}
    <main class="lista" id="lista">
      ${paradas.length ? paradas.map((p) => `
        <button class="cartao" data-ir="#/editar/${p.id}">
          ${numeroParada(p, p.status === 'pendente' ? ++n : 0, atualId)}
          <span class="info"><strong>${esc(nomeDe(p))}</strong><small>${esc(p.nome ? p.endereco : p.obs) || '&nbsp;'}</small>${etiquetaParada(p, atualId)}</span>
        </button>`).join('') : `
        <div class="vazio">${I.caminhao}<h2>Monte sua rota</h2>
          <p>Toque em <b>Nova entrega</b> e cadastre o nome do cliente e o endereço.<br>Depois toque em <b>Iniciar rota</b>: o app calcula a melhor sequência a partir de onde você está.</p></div>`}
    </main>
    <button class="fab" id="nova">${I.mais}<span>Nova entrega</span></button>`;

  document.getElementById('nova').addEventListener('click', async () => {
    if (await podeAdicionar()) ir('#/nova');
    else {
      aviso('Ative o app para adicionar mais entregas');
      ir('#/ativar');
    }
  });
  document.getElementById('iniciar')?.addEventListener('click', async (e) => {
    if (!estado.ativado && paradas.length > CONFIG.limiteTeste) {
      aviso('Ative o app para usar rotas com mais entregas');
      return ir('#/ativar');
    }
    if (andamento) return ir('#/rota');
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = 'Calculando a melhor rota…';
    await calcularRota();
    marcarEmRota(true);
    ir('#/rota');
  });
}

/**
 * Reorganiza as entregas pendentes na melhor sequência, saindo da posição atual
 * do celular (ou da primeira entrega, se o GPS não responder).
 */
async function calcularRota({ posicao } = {}) {
  const paradas = await listarParadas();
  const pendentes = paradas.filter((p) => p.status === 'pendente');
  const origem = posicao !== undefined ? posicao : await minhaPosicao();
  const ordem = otimizar(pendentes, origem);
  ordem.forEach((p, i) => (p.ordem = i));
  await salvarParadas(ordem);
  return { origem, ordem };
}

// ---------------------------------------------------------------- cadastro de entrega
function criarMapa(el, { zoomInicial = 13 } = {}) {
  const mapa = L.map(el, { zoomControl: false, attributionControl: true }).setView([-22.9, -47.06], zoomInicial);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
  }).addTo(mapa);
  return mapa;
}

const iconePino = (texto, classe = '') =>
  L.divIcon({ className: `pino ${classe}`, html: `<div><span>${texto}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
const iconeEu = () => L.divIcon({ className: '', html: '<div class="eu"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

async function telaParada(id) {
  const parada = id ? await obterParada(id) : null;
  if (id && !parada) return location.replace('#/');
  if (!id && !(await podeAdicionar())) return location.replace('#/ativar');
  const local = parada && temCoord(parada) ? { lat: parada.lat, lon: parada.lon } : {};

  app.innerHTML = `
    ${cabecalho(parada ? 'Editar entrega' : 'Nova entrega', {
      voltar: '#/',
      direita: '<button class="btn laranja pequeno" id="salvar">Salvar</button>',
    })}
    <main class="formulario">
      <label class="campo"><span>Nome do cliente</span><input id="f-nome" maxlength="80" placeholder="Ex.: José" autocapitalize="words" value="${esc(parada?.nome)}" /></label>
      <div class="campo campo-endereco">
        <label class="campo"><span>Endereço</span>
          <input id="f-endereco" maxlength="200" autocomplete="off" placeholder="Rua, número, bairro, cidade (ou coordenadas)" value="${esc(parada?.endereco)}" />
        </label>
        <div class="sugestoes" id="sugestoes"></div>
        <div id="estado-local"></div>
        <button class="btn minha-local" id="minha-local">${I.alvo} Usar minha localização atual</button>
      </div>
      <div class="mapa-form" id="mapa-form"></div>
      <p class="dica">Toque no mapa para ajustar o ponto exato da entrega.</p>
      <label class="campo"><span>Telefone (opcional)</span><input id="f-telefone" type="tel" maxlength="20" placeholder="(19) 99999-9999" value="${esc(parada?.telefone)}" /></label>
      <label class="campo"><span>Observação (opcional)</span><textarea id="f-obs" maxlength="300" placeholder="Ex.: portão azul, deixar com o porteiro, cobrar R$ 50">${esc(parada?.obs)}</textarea></label>
      ${parada && parada.status !== 'pendente' ? `<button class="btn" id="reabrir">Marcar como pendente de novo</button>` : ''}
      ${parada ? `<button class="btn perigo" id="excluir">${I.lixo} Excluir entrega</button>` : ''}
    </main>`;

  const campoEnd = document.getElementById('f-endereco');
  const sugestoes = document.getElementById('sugestoes');
  const estadoLocal = document.getElementById('estado-local');
  let resultados = [];
  let enderecoEscolhido = parada?.endereco || '';

  const mapa = criarMapa(document.getElementById('mapa-form'), { zoomInicial: 12 });
  let marcador = null;
  const mostrarLocal = () => {
    if (temCoord(local)) {
      estadoLocal.innerHTML = `<p class="local-ok">${I.ok} Local marcado no mapa</p>`;
      if (!marcador) marcador = L.marker([local.lat, local.lon], { icon: iconePino('', 'atual') }).addTo(mapa);
      else marcador.setLatLng([local.lat, local.lon]);
      mapa.setView([local.lat, local.lon], Math.max(mapa.getZoom(), 16));
    } else {
      estadoLocal.innerHTML = '<p class="local-ok sem">Escolha um endereço da lista ou toque no mapa</p>';
    }
  };
  mostrarLocal();
  if (!temCoord(local)) {
    const pos = posicaoConhecida() || (await minhaPosicao({ tempo: 5000, recente: 300000 }));
    if (pos && !temCoord(local)) mapa.setView([pos.lat, pos.lon], 14);
  }
  mapa.on('click', (e) => {
    local.lat = e.latlng.lat;
    local.lon = e.latlng.lng;
    mostrarLocal();
  });

  let timer;
  let pedido = 0;
  const pesquisar = async () => {
    const texto = campoEnd.value.trim();
    const meu = ++pedido;
    if (texto.length < 3) {
      sugestoes.innerHTML = '';
      return;
    }
    sugestoes.innerHTML = '<div class="sugestao carregando">Buscando…</div>';
    try {
      resultados = await buscarEndereco(texto, posicaoConhecida());
    } catch {
      resultados = [];
      if (meu === pedido) sugestoes.innerHTML = '<div class="sugestao carregando">Sem internet para buscar. Toque no mapa para marcar o local.</div>';
      return;
    }
    if (meu !== pedido) return;
    const aqui = posicaoConhecida();
    sugestoes.innerHTML = resultados.length
      ? resultados.map((r, i) => `<button class="sugestao" data-r="${i}">${I.pino}<span><strong>${esc(r.titulo)}</strong><small>${esc(r.detalhe)}${aqui ? ' · ' + formatarDistancia(distanciaKm(aqui, r)) : ''}</small></span></button>`).join('')
      : '<div class="sugestao carregando">Nada encontrado. Confira o endereço ou toque no mapa.</div>';
  };
  campoEnd.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(pesquisar, 500);
  });
  sugestoes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const r = resultados[Number(b.dataset.r)];
    local.lat = r.lat;
    local.lon = r.lon;
    if (!lerCoordenadas(campoEnd.value)) {
      // Mantém o número da casa digitado quando o resultado não traz número.
      const numero = (campoEnd.value.match(/\b\d{1,5}[A-Za-z]?\b/) || [])[0];
      const titulo = numero && !/\d/.test(r.titulo) ? `${r.titulo}, ${numero}` : r.titulo;
      campoEnd.value = [titulo, r.detalhe].filter(Boolean).join(' - ');
    }
    enderecoEscolhido = campoEnd.value;
    sugestoes.innerHTML = '';
    mostrarLocal();
  });

  document.getElementById('minha-local').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = 'Procurando sua localização…';
    const pos = await minhaPosicao({ tempo: 15000, recente: 0 });
    b.disabled = false;
    b.innerHTML = `${I.alvo} Usar minha localização atual`;
    if (!pos) return aviso('Não foi possível obter a localização. Ligue o GPS e permita o acesso.', 'erro');
    local.lat = pos.lat;
    local.lon = pos.lon;
    mostrarLocal();
    if (!campoEnd.value.trim()) {
      const end = await enderecoDaPosicao(pos);
      if (end) campoEnd.value = enderecoEscolhido = end;
    }
  });

  document.getElementById('salvar').addEventListener('click', async () => {
    const nome = document.getElementById('f-nome').value.trim();
    const endereco = campoEnd.value.trim();
    if (!nome && !endereco) {
      aviso('Informe o nome do cliente ou o endereço', 'erro');
      return document.getElementById('f-nome').focus();
    }
    // Endereço digitado sem escolher da lista: usa o primeiro resultado encontrado.
    if (endereco && endereco !== enderecoEscolhido && !temCoord(local)) {
      const coord = lerCoordenadas(endereco);
      if (coord) Object.assign(local, coord);
      else {
        try {
          const r = (await buscarEndereco(endereco, posicaoConhecida()))[0];
          if (r) Object.assign(local, { lat: r.lat, lon: r.lon });
        } catch { /* sem internet: fica sem localização */ }
      }
    }
    const dados = {
      ...(parada || { id: novoId(), criadoEm: Date.now(), status: 'pendente' }),
      nome,
      endereco,
      telefone: document.getElementById('f-telefone').value.trim(),
      obs: document.getElementById('f-obs').value.trim(),
      lat: temCoord(local) ? local.lat : null,
      lon: temCoord(local) ? local.lon : null,
    };
    // Entrega nova durante uma rota em andamento entra no fim da fila.
    if (!parada && emRota()) dados.ordem = (await listarParadas()).length + 1000;
    await salvarParada(dados);
    aviso(temCoord(local) ? 'Entrega salva' : 'Entrega salva sem localização no mapa', temCoord(local) ? 'ok' : '');
    if (sessionStorage.getItem('rota.navegou')) history.back();
    else location.replace('#/');
  });

  document.getElementById('reabrir')?.addEventListener('click', async () => {
    await salvarParada({ ...parada, status: 'pendente', motivo: '', concluidaEm: null, ordem: 1e6 });
    aviso('Entrega voltou para a rota', 'ok');
    location.replace('#/');
  });

  document.getElementById('excluir')?.addEventListener('click', async () => {
    if (!confirm(`Excluir a entrega de “${nomeDe(parada)}”?`)) return;
    await excluirParada(parada.id);
    aviso('Entrega excluída');
    location.replace('#/');
  });

  limparTela = () => mapa.remove();
}

// ---------------------------------------------------------------- tela da rota
async function telaRota() {
  const paradas = await listarParadas();
  if (!paradas.length) return location.replace('#/');
  const pendentes = paradas.filter((p) => p.status === 'pendente');
  if (!pendentes.length) return telaConcluida(paradas);
  if (!estado.ativado && paradas.length > CONFIG.limiteTeste) return location.replace('#/ativar');
  marcarEmRota(true);

  const total = paradas.length;
  const concluidas = total - pendentes.length;
  const atual = pendentes[0];
  const proxima = pendentes[1];
  const feitas = paradas.filter((p) => p.status !== 'pendente');
  const tel = soNumeros(atual.telefone);
  const whats = tel.length >= 10 ? (tel.length <= 11 ? '55' + tel : tel) : '';

  app.innerHTML = `
    <div class="tela-rota">
      <div class="mapa-rota" id="mapa"></div>
      <div class="barra-mapa">
        <button class="icone-btn" data-voltar="#/" aria-label="Voltar">${I.voltar}</button>
        <button class="icone-btn" id="centralizar" aria-label="Ver toda a rota">${I.centro}</button>
      </div>
      <div class="progresso"><span style="width:${Math.round((concluidas / total) * 100)}%"></span></div>

      <section class="cartao-parada">
        <p class="contagem">Parada ${concluidas + 1} de ${total} · ${concluidas} concluída(s)</p>
        <h1>${esc(nomeDe(atual))}</h1>
        ${atual.nome && atual.endereco ? `<p class="endereco">${esc(atual.endereco)}</p>` : ''}
        ${atual.obs ? `<p class="obs">${esc(atual.obs)}</p>` : ''}
        <p class="distancia" id="distancia"></p>
        <p class="rotulo">Navegar até aqui com:</p>
        <div class="dois">
          <button class="btn laranja" id="waze">Waze</button>
          <button class="btn laranja" id="gmaps">Google Maps</button>
        </div>
        ${tel ? `<div class="contato">
          <button class="btn" id="ligar">${I.fone} Ligar</button>
          ${whats ? `<button class="btn whatsapp" id="whats">${I.zap} WhatsApp</button>` : ''}
        </div>` : ''}
      </section>

      <div class="acoes-parada">
        <button class="btn verde" id="entregue">${I.ok} Entrega concluída</button>
        <button class="btn contorno-vermelho" id="nao">Não entregue</button>
      </div>
      <button class="btn contorno recalcular" id="recalcular">Recalcular daqui</button>

      ${proxima ? `<p class="depois">Depois: <b>${esc(nomeDe(proxima))}</b></p>` : '<p class="depois">Esta é a <b>última entrega</b> da rota.</p>'}

      <h2 class="sequencia-titulo">Sequência das entregas</h2>
      <div class="sequencia">
        ${pendentes.map((p, i) => `
          <div class="item-seq ${i === 0 ? 'atual' : ''}">
            <span class="numero ${i === 0 ? 'atual' : ''}">${i + 1}</span>
            <span class="info"><strong>${esc(nomeDe(p))}${p.nome && p.endereco ? ' — ' + esc(p.endereco) : ''}</strong>
              ${i === 0 ? '<span class="etiqueta agora">Agora</span>' : !temCoord(p) ? '<span class="etiqueta sem">Sem localização no mapa</span>' : ''}</span>
            <button class="seta" data-agora="${p.id}" aria-label="Ir para esta entrega agora">${I.enviar}</button>
          </div>`).join('')}
      </div>
      ${feitas.length ? `
        <h2 class="titulo-secao" style="margin-top:22px">Concluídas (${feitas.length})</h2>
        <div class="sequencia">
          ${feitas.map((p) => `
            <div class="item-seq feito">
              ${numeroParada(p, 0, null)}
              <span class="info"><strong>${esc(nomeDe(p))}</strong>${etiquetaParada(p, null)}</span>
              <button class="desfazer" data-desfazer="${p.id}">Desfazer</button>
            </div>`).join('')}
        </div>` : ''}
    </div>`;

  // --- mapa
  const mapa = criarMapa(document.getElementById('mapa'));
  const camada = L.layerGroup().addTo(mapa);
  let marcadorEu = null;
  let linha = null;
  const pontosDaRota = () => pendentes.filter(temCoord);

  feitas.filter(temCoord).forEach((p) =>
    L.marker([p.lat, p.lon], { icon: iconePino(p.status === 'entregue' ? '✓' : '✕', p.status) }).addTo(camada));
  pendentes.forEach((p, i) => {
    if (!temCoord(p)) return;
    L.marker([p.lat, p.lon], { icon: iconePino(i + 1, i === 0 ? 'atual' : ''), zIndexOffset: i === 0 ? 1000 : 0 })
      .bindTooltip(esc(nomeDe(p)))
      .addTo(camada);
  });

  const enquadrar = () => {
    const pts = pontosDaRota().map((p) => [p.lat, p.lon]);
    const eu = posicaoConhecida();
    if (eu) pts.push([eu.lat, eu.lon]);
    if (pts.length === 1) mapa.setView(pts[0], 15);
    else if (pts.length) mapa.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
  };
  enquadrar();
  document.getElementById('centralizar').addEventListener('click', enquadrar);

  const desenharTrajeto = async () => {
    const eu = posicaoConhecida();
    const pontos = [...(eu ? [eu] : []), ...pontosDaRota()];
    if (pontos.length < 2) return;
    const t = await trajetoPelasRuas(pontos);
    if (linha) linha.remove();
    if (t) {
      linha = L.polyline(t.linha, { color: '#f7931e', weight: 6, opacity: 0.9 }).addTo(mapa);
      const ate = eu && temCoord(atual) ? t.trechos[0] : null;
      const el = document.getElementById('distancia');
      if (ate && el) el.textContent = `${formatarDistancia(ate.km)} daqui · cerca de ${Math.max(1, Math.round(ate.minutos))} min`;
    } else {
      linha = L.polyline(pontos.map((p) => [p.lat, p.lon]), { color: '#f7931e', weight: 4, dashArray: '8 10' }).addTo(mapa);
      const el = document.getElementById('distancia');
      if (eu && temCoord(atual) && el) el.textContent = `${formatarDistancia(distanciaKm(eu, atual))} em linha reta`;
    }
  };

  const mostrarEu = (pos) => {
    if (!pos) return;
    if (!marcadorEu) marcadorEu = L.marker([pos.lat, pos.lon], { icon: iconeEu(), zIndexOffset: 2000 }).addTo(mapa);
    else marcadorEu.setLatLng([pos.lat, pos.lon]);
  };
  mostrarEu(posicaoConhecida());
  desenharTrajeto();
  let primeira = !posicaoConhecida();
  const pararGps = acompanharPosicao((pos) => {
    mostrarEu(pos);
    if (primeira) {
      primeira = false;
      enquadrar();
      desenharTrajeto();
    }
  });

  // --- ações
  document.getElementById('waze').addEventListener('click', () => abrirLinkExterno(linkWaze(atual)));
  document.getElementById('gmaps').addEventListener('click', () => abrirLinkExterno(linkGoogleMaps(atual)));
  document.getElementById('ligar')?.addEventListener('click', () => abrirLinkExterno(`tel:${tel}`));
  document.getElementById('whats')?.addEventListener('click', () => abrirLinkExterno(`https://wa.me/${whats}`));

  const concluir = async (status, motivo = '') => {
    await salvarParada({ ...atual, status, motivo, concluidaEm: Date.now(), ordem: ordemConcluida() });
    if (navigator.vibrate) navigator.vibrate(60);
    aviso(status === 'entregue' ? `Entrega de ${nomeDe(atual)} concluída` : 'Marcada como não entregue', status === 'entregue' ? 'ok' : '');
    rotear();
  };
  document.getElementById('entregue').addEventListener('click', () => concluir('entregue'));
  document.getElementById('nao').addEventListener('click', async () => {
    const motivo = await escolher('Por que não foi entregue?', [
      'Cliente ausente', 'Endereço não encontrado', 'Cliente recusou', 'Local fechado',
    ]);
    if (motivo) concluir('nao', motivo);
  });
  document.getElementById('recalcular').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = 'Recalculando…';
    const pos = await minhaPosicao({ tempo: 12000, recente: 0 });
    if (!pos) aviso('GPS indisponível: rota calculada a partir da próxima entrega');
    await calcularRota({ posicao: pos });
    if (pos) aviso('Rota recalculada a partir de onde você está', 'ok');
    rotear();
  });

  app.querySelector('.sequencia').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-agora]');
    if (!b || b.dataset.agora === atual.id) return;
    const escolhida = pendentes.find((p) => p.id === b.dataset.agora);
    escolhida.ordem = pendentes[0].ordem - 1;
    await salvarParada(escolhida);
    aviso(`Próxima entrega: ${nomeDe(escolhida)}`);
    rotear();
  });
  app.querySelectorAll('[data-desfazer]').forEach((b) => b.addEventListener('click', async () => {
    const p = feitas.find((x) => x.id === b.dataset.desfazer);
    await salvarParada({ ...p, status: 'pendente', motivo: '', concluidaEm: null, ordem: pendentes[0].ordem - 1 });
    aviso('Entrega voltou para a rota');
    rotear();
  }));

  manterTelaLigada(true);
  limparTela = () => {
    pararGps();
    mapa.remove();
    manterTelaLigada(false);
  };
}

function textoResumo(paradas) {
  const entregues = paradas.filter((p) => p.status === 'entregue');
  const nao = paradas.filter((p) => p.status === 'nao');
  const hora = (ms) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  const linhas = [
    `*Resumo da rota - ${new Date().toLocaleDateString('pt-BR')}*`,
    `Entregues: ${entregues.length} | Não entregues: ${nao.length}`,
    '',
    ...entregues.map((p) => `✅ ${nomeDe(p)}${p.endereco && p.nome ? ' - ' + p.endereco : ''} (${hora(p.concluidaEm)})`),
    ...nao.map((p) => `❌ ${nomeDe(p)}${p.endereco && p.nome ? ' - ' + p.endereco : ''}: ${p.motivo || 'sem motivo'}`),
  ];
  return linhas.join('\n');
}

function telaConcluida(paradas) {
  marcarEmRota(false);
  const entregues = paradas.filter((p) => p.status === 'entregue').length;
  const nao = paradas.filter((p) => p.status === 'nao').length;
  const pontos = paradas.filter(temCoord);
  app.innerHTML = `
    <main class="concluida">
      <div class="selo">${I.ok}</div>
      <h1>Rota concluída!</h1>
      <p class="texto">${entregues} ${entregues === 1 ? 'entrega feita' : 'entregas feitas'}${nao ? ` · ${nao} não ${nao === 1 ? 'entregue' : 'entregues'}` : ''}${pontos.length > 1 ? ` · cerca de ${formatarDistancia(distanciaTotal(pontos))} em linha reta` : ''}</p>
      <div class="lista-final">
        ${paradas.map((p) => `<div class="item-seq feito">${numeroParada(p, 0, null)}<span class="info"><strong>${esc(nomeDe(p))}</strong>${etiquetaParada(p, null)}</span></div>`).join('')}
      </div>
      <button class="btn whatsapp grande" id="enviar">${I.zap} Enviar resumo pelo WhatsApp</button>
      <button class="btn laranja grande" id="nova-rota">${I.mais} Começar nova rota</button>
      <button class="link" data-ir="#/">Voltar ao início</button>
    </main>`;
  document.getElementById('enviar').addEventListener('click', () =>
    abrirLinkExterno(`https://wa.me/?text=${encodeURIComponent(textoResumo(paradas))}`));
  document.getElementById('nova-rota').addEventListener('click', async () => {
    if (!confirm('Apagar as entregas desta rota e começar uma nova?')) return;
    await apagarTodas();
    aviso('Pronto! Cadastre as entregas da nova rota.', 'ok');
    location.replace('#/');
  });
}

// ---------------------------------------------------------------- ajustes
function painelLicenca(total) {
  const l = estado.licenca;
  const status = (ok, titulo, texto) =>
    `<div class="status ${ok ? 'ok' : ''}">${ok ? I.ok : I.cadeado}<div><strong>${titulo}</strong><small>${texto}</small></div></div>`;
  const info = (rotulo, valor) => `<div class="linha-info"><span>${rotulo}</span><b>${valor}</b></div>`;
  if (l.ativo) {
    if (!l.expira) return status(true, 'Ativado neste aparelho', 'Licença vitalícia. Obrigado pela compra!');
    return status(true, `${nomeTipo(l.tipo)}: ativo`, `Termina em ${tempoRestante(l.expira)}`) +
      info('Válido até', formatarData(l.expira)) +
      `<button class="btn ${l.tipo === 'teste' ? 'primario' : ''}" data-ir="#/ativar">${l.tipo === 'teste' ? 'Comprar' : 'Renovar'}</button>`;
  }
  if (l.relogioAlterado) {
    return status(false, 'Data do celular incorreta', 'Ative a data e hora automáticas e abra o app de novo.');
  }
  if (l.vencido) {
    return status(false, `${nomeTipo(l.tipo)}: vencido`, `Venceu em ${formatarData(l.expira)}`) +
      `<button class="btn primario" data-ir="#/ativar">Renovar</button>`;
  }
  return status(false, 'Versão de teste', `${total} de ${CONFIG.limiteTeste} entregas usadas`) +
    '<button class="btn primario" data-ir="#/ativar">Ativar agora</button>';
}

async function telaAjustes() {
  const codigo = await codigoDoAparelho();
  const paradas = await listarParadas();
  const feitas = paradas.filter((p) => p.status !== 'pendente').length;
  app.innerHTML = `
    ${cabecalho('Ajustes')}
    <main class="ajustes">
      <section class="painel">
        <h2>Licença</h2>
        ${painelLicenca(paradas.length)}
        <div class="linha-info"><span>Código do aparelho</span><code>${codigo}</code></div>
        ${CONFIG.chaveDeTeste ? '<p class="alerta">Este aplicativo está usando a <b>chave de teste</b>. Troque pela sua chave definitiva antes de vender (veja o LEIAME).</p>' : ''}
      </section>
      <section class="painel">
        <h2>Rota</h2>
        <div class="botoes">
          <button class="btn" id="limpar-feitas" ${feitas ? '' : 'disabled'}>Remover concluídas (${feitas})</button>
        </div>
        <button class="btn perigo" id="apagar-tudo" ${paradas.length ? '' : 'disabled'}>${I.lixo} Apagar todas as entregas</button>
      </section>
      <section class="painel">
        <h2>Cópia de segurança</h2>
        <p class="texto">As entregas ficam salvas só neste celular. Exporte para guardar ou passar para outro aparelho.</p>
        <div class="botoes">
          <button class="btn" id="exportar">${I.baixar} Exportar</button>
          <button class="btn" id="importar">${I.subir} Importar</button>
        </div>
        <input type="file" id="arquivo" accept="application/json,.json" hidden />
      </section>
      <section class="painel">
        <h2>Dicas</h2>
        <ul class="dicas">
          <li><b>Melhor sequência:</b> cadastre as entregas e toque em <b>Iniciar rota</b>. O app ordena a partir de onde você está.</li>
          <li><b>Recalcular daqui:</b> mudou o caminho? Toque e a ordem das entregas restantes é refeita.</li>
          <li><b>Pular entrega:</b> na sequência, toque na seta laranja para fazer aquela entrega agora.</li>
          <li><b>Navegação:</b> os botões Waze e Google Maps abrem o trajeto até o cliente.</li>
          <li><b>Coordenadas:</b> no endereço, você pode colar latitude e longitude (ex.: -22.85, -47.13).</li>
        </ul>
      </section>
      <p class="versao">${esc(CONFIG.nomeApp)} · versão ${esc(CONFIG.versao)}</p>
    </main>`;

  document.getElementById('limpar-feitas').addEventListener('click', async () => {
    if (!confirm(`Remover ${feitas} ${feitas === 1 ? 'entrega concluída' : 'entregas concluídas'}?`)) return;
    for (const p of paradas.filter((x) => x.status !== 'pendente')) await excluirParada(p.id);
    aviso('Entregas concluídas removidas', 'ok');
    rotear();
  });
  document.getElementById('apagar-tudo').addEventListener('click', async () => {
    if (!confirm('Apagar TODAS as entregas? Essa ação não pode ser desfeita.')) return;
    await apagarTodas();
    marcarEmRota(false);
    aviso('Todas as entregas foram apagadas');
    rotear();
  });
  document.getElementById('exportar').addEventListener('click', async () => {
    const dados = JSON.stringify({ app: 'rota-de-entregas', versao: 1, exportadoEm: new Date().toISOString(), paradas }, null, 1);
    const data = new Date().toISOString().slice(0, 10);
    try {
      await compartilharArquivo(`rota-entregas-backup-${data}.json`, dados);
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
      const lista = Array.isArray(dados) ? dados : dados.paradas;
      if (!Array.isArray(lista)) throw new Error();
      const atuais = (await listarParadas()).length;
      if (!estado.ativado && atuais + lista.length > CONFIG.limiteTeste) {
        aviso('Ative o app para importar todas as entregas', 'erro');
        return;
      }
      const n = await importarParadas(lista);
      aviso(`${n} ${n === 1 ? 'entrega importada' : 'entregas importadas'}`, 'ok');
    } catch {
      aviso('Arquivo de backup inválido', 'erro');
    }
    arquivo.value = '';
  });
}

// ---------------------------------------------------------------- ativação
async function telaAtivacao() {
  const codigo = await codigoDoAparelho();
  const l = estado.licenca;
  const obrigatorio = CONFIG.limiteTeste === 0 && !l.ativo;
  if (l.ativo && !l.expira) return location.replace('#/ajustes');
  const renovar = l.tipo && l.tipo !== 'teste';
  const situacao = l.ativo
    ? `${nomeTipo(l.tipo)} ativo até <b>${formatarData(l.expira)}</b>.`
    : l.vencido ? `${l.tipo === 'teste' ? 'Seu teste terminou' : 'Seu acesso venceu'} em <b>${formatarData(l.expira)}</b>.` : '';

  app.innerHTML = `
    ${obrigatorio ? '' : cabecalho(renovar ? 'Renovação' : 'Ativação')}
    <main class="ativacao">
      <div class="heroi">
        <img src="img/icone.svg" alt="" />
        <h1>${renovar ? 'Renove seu acesso' : `Ative o ${esc(CONFIG.nomeApp)}`}</h1>
        <p>${situacao ? situacao + ' ' : ''}Envie o código abaixo ao vendedor e cole o código que receber.</p>
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
    const acao = renovar ? 'renovar meu acesso ao' : l.tipo === 'teste' ? 'comprar o' : 'ativar o';
    const texto = `Olá! Quero ${acao} ${CONFIG.nomeApp}.\nCódigo do meu aparelho: ${codigo}`;
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
    const r = await ativar(campo.value);
    if (r.ok) {
      estado.licenca = r.licenca;
      estado.ativado = r.licenca.ativo;
      const nova = r.licenca;
      const detalhe = nova.expira
        ? `${nomeTipo(nova.tipo)} válido até <b>${formatarData(nova.expira)}</b>.`
        : 'Licença vitalícia. Obrigado pela compra!';
      app.innerHTML = `<main class="sucesso"><div class="selo">${I.ok}</div><h1>Tudo pronto!</h1>
        <p>O ${esc(CONFIG.nomeApp)} foi ativado neste aparelho.<br>${detalhe}</p>
        <button class="btn primario grande" id="comecar">Começar</button></main>`;
      document.getElementById('comecar').addEventListener('click', () => location.replace('#/'));
    } else {
      botao.disabled = false;
      botao.textContent = 'Ativar';
      campo.classList.add('invalido');
      setTimeout(() => campo.classList.remove('invalido'), 600);
      aviso({
        invalido: 'Código inválido para este aparelho',
        vencido: 'Este código já venceu. Peça um novo ao vendedor.',
        relogio: 'A data do celular está incorreta. Ative a data e hora automáticas.',
      }[r.motivo], 'erro');
    }
  });
}

// ---------------------------------------------------------------- início do app
async function atualizarLicenca() {
  estado.licenca = await lerLicenca();
  estado.ativado = estado.licenca.ativo;
}

async function iniciar() {
  await atualizarLicenca();
  // Confere a validade a cada minuto (para testes curtos, de horas).
  setInterval(async () => {
    const antes = estado.ativado;
    await atualizarLicenca();
    if (antes && !estado.ativado) {
      aviso(estado.licenca.tipo === 'teste' ? 'Seu teste terminou' : 'Seu acesso venceu', 'erro');
      if (!location.hash.startsWith('#/rota')) rotear();
    }
  }, 60000);
  window.addEventListener('hashchange', () => {
    sessionStorage.setItem('rota.navegou', '1');
    rotear();
  });
  // Rota em andamento: abre direto na próxima entrega.
  if (!location.hash && emRota()) location.replace('#/rota');
  rotear();
  minhaPosicao({ tempo: 8000, recente: 300000 });
}

iniciar();
