/* Funções compartilhadas entre o app do VMO e o painel do administrador */
const CFG = window.VMO_CONFIG;
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "vmo-auth" },
});

const Estado = { usuario: null, perfil: null, unidades: [] };
const NOME_PAPEL = { admin: "Administrador", vigilante: "VMO", gestor: "Gestor (visualização)" };
const nomePapel = (p) => NOME_PAPEL[p] || p;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function mostrar(el, sim = true) { (typeof el === "string" ? $(el) : el).classList.toggle("oculto", !sim); }

function carregando(sim, texto = "Carregando...") {
  $("#carregando-texto").textContent = texto;
  mostrar("#carregando", sim);
}

let _avisoTimer;
function aviso(msg, erro = false) {
  const a = $("#aviso");
  a.textContent = msg;
  a.classList.toggle("erro-aviso", erro);
  mostrar(a, true);
  clearTimeout(_avisoTimer);
  _avisoTimer = setTimeout(() => mostrar(a, false), erro ? 6000 : 3500);
}

function abrirModal(html) { $("#modal-conteudo").innerHTML = html; mostrar("#modal", true); }
function fecharModal() { mostrar("#modal", false); $("#modal-conteudo").innerHTML = ""; }
function verImagem(src) { abrirModal(`<img class="grande" src="${esc(src)}" alt="Foto" />`); }

/* ---------- Datas ---------- */
const fmtDataHora = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtData = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtHora = (d) => d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
function paraInputLocal(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
}
function minutosEntre(a, b) { return Math.round((new Date(b) - new Date(a)) / 60000); }
function fmtDuracao(min) {
  if (min == null || isNaN(min)) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}
function chaveDia(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }

/* ---------- Login ---------- */
function loginParaEmail(login) {
  const l = String(login || "").trim().toLowerCase();
  return l.includes("@") ? l : `${l}@${CFG.DOMINIO}`;
}

async function carregarPerfil() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  Estado.usuario = session.user;
  const { data, error } = await sb.from("perfis").select("*").eq("id", session.user.id).maybeSingle();
  if (error) throw error;
  Estado.perfil = data;
  return data;
}

async function carregarUnidades() {
  const { data, error } = await sb.from("unidades").select("*").order("nome");
  if (error) throw error;
  Estado.unidades = data.map((u) => u.nome);
  Estado.coordUnidades = {};
  data.forEach((u) => { if (u.latitude != null && u.longitude != null) Estado.coordUnidades[u.nome] = { lat: u.latitude, lng: u.longitude }; });
  const dl = $("#lista-unidades");
  if (dl) dl.innerHTML = Estado.unidades.map((n) => `<option value="${esc(n)}">`).join("");
  return Estado.unidades;
}

/* ---------- Geolocalização (dupla verificação da visita) ---------- */
function distanciaM(a, b) {
  const R = 6371000, rad = (x) => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDistancia = (m) => m == null ? "—" : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
const linkMapa = (g) => `https://www.google.com/maps?q=${g.lat},${g.lng}`;
const fmtCoord = (g) => `${Number(g.lat).toFixed(6)}, ${Number(g.lng).toFixed(6)}`;

// Compara a posição do VMO com a coordenada cadastrada da unidade
// Referência da unidade: a coordenada cadastrada (se houver) ou, automaticamente,
// o ponto mais comum (mediana) das localizações registradas pelos celulares dos VMOs nessa unidade.
function referenciaUnidade(unidade) {
  const c = Estado.coordUnidades?.[unidade];
  if (c) return { ...c, origem: "cadastro" };
  const a = Estado.refAuto?.[unidade];
  return a ? { ...a, origem: "auto" } : null;
}

// Calcula a referência automática de cada unidade a partir das visitas (mín. 3 leituras boas)
function calcularReferenciasAuto(listaVisitas) {
  const pontos = {};
  listaVisitas.forEach((v) => {
    const g = v.geo_chegada;
    if (g?.lat != null && (g.precisao ?? 999) <= 150) (pontos[v.unidade] ||= []).push(g);
  });
  const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  Estado.refAuto = {};
  Object.entries(pontos).forEach(([u, ps]) => {
    if (ps.length >= 3) Estado.refAuto[u] = { lat: +mediana(ps.map((p) => p.lat)).toFixed(6), lng: +mediana(ps.map((p) => p.lng)).toFixed(6), n: ps.length };
  });
  return Estado.refAuto;
}

function verificarGeo(geo, unidade) {
  if (!geo || geo.lat == null) return { codigo: "sem_gps", icone: "❌", rotulo: "Sem localização", classe: "geo-sem", detalhe: geo?.erro || "Localização não registrada" };
  const ref = referenciaUnidade(unidade);
  if (!ref) return { codigo: "sem_ref", icone: "📍", rotulo: "Localização registrada", classe: "geo-ref", detalhe: "Ainda sem referência da unidade (são necessárias 3 visitas com GPS ou o cadastro da coordenada). Confira no mapa." };
  const d = distanciaM(geo, ref);
  const limite = CFG.RAIO_VERIFICACAO_M + Math.min(geo.precisao || 0, 300);
  const base = ref.origem === "auto" ? `comparado às ${ref.n} visitas registradas nesta unidade` : "comparado à coordenada cadastrada da unidade";
  return d <= limite
    ? { codigo: "ok", icone: "✅", rotulo: `No local (${fmtDistancia(d)})`, classe: "geo-ok", dist: d, detalhe: base }
    : { codigo: "longe", icone: "⚠️", rotulo: `Fora da unidade (${fmtDistancia(d)})`, classe: "geo-longe", dist: d, detalhe: base };
}
const ROTULO_GEO = { ok: "✅ Confirmada no local", longe: "⚠️ Fora da unidade", sem_ref: "📍 Registrada (sem referência)", sem_gps: "❌ Sem localização" };

// Mapa (OpenStreetMap) com a posição do celular
function mapaEmbed(g, altura = 170) {
  const d = 0.004;
  const bbox = [g.lng - d, g.lat - d * 0.7, g.lng + d, g.lat + d * 0.7].map((x) => x.toFixed(6)).join(",");
  return `<iframe class="mapa" style="height:${altura}px" loading="lazy" title="Mapa da localização"
    src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${g.lat},${g.lng}"></iframe>`;
}

function obterLocalizacao(tempo = 20000) {
  return new Promise((ok) => {
    const em = new Date().toISOString();
    if (!navigator.geolocation) return ok({ erro: "Aparelho sem suporte a localização", em });
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), precisao: Math.round(p.coords.accuracy), em: new Date(p.timestamp || Date.now()).toISOString() }),
      (e) => ok({ erro: e.code === 1 ? "Permissão de localização negada" : e.code === 3 ? "Tempo esgotado ao obter a localização" : "Localização indisponível (sem sinal de GPS)", em }),
      { enableHighAccuracy: true, timeout: tempo, maximumAge: 0 });
  });
}

/* ---------- Fotos ---------- */
// Reduz a foto para no máximo 1600px e JPEG ~80% (economiza dados móveis)
async function comprimirImagem(arquivo, max = 1600, qualidade = 0.8) {
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * escala);
    c.height = Math.round(bmp.height * escala);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await new Promise((ok) => c.toBlob((b) => ok(b || arquivo), "image/jpeg", qualidade));
  } catch {
    return arquivo; // formato não suportado pelo navegador (ex.: HEIC): envia original
  }
}

async function urlsAssinadas(caminhos, segundos = 3600) {
  if (!caminhos.length) return {};
  const { data, error } = await sb.storage.from(CFG.BUCKET).createSignedUrls(caminhos, segundos);
  if (error) { console.error(error); return {}; }
  const mapa = {};
  data.forEach((d) => { if (d.signedUrl) mapa[d.path] = d.signedUrl; });
  return mapa;
}

/* Armazenamento local (IndexedDB) das fotos da visita em andamento,
   para não perder nada se o celular fechar o navegador. */
const BancoLocal = (() => {
  let dbp;
  const abrir = () => dbp ||= new Promise((ok, erro) => {
    const r = indexedDB.open("vmo-rascunho", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("fotos");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
  const tx = async (modo, fn) => {
    const db = await abrir();
    return new Promise((ok, erro) => {
      const t = db.transaction("fotos", modo);
      const req = fn(t.objectStore("fotos"));
      t.oncomplete = () => ok(req?.result);
      t.onerror = () => erro(t.error);
    });
  };
  return {
    salvar: (id, blob) => tx("readwrite", (s) => s.put(blob, id)),
    ler: (id) => tx("readonly", (s) => s.get(id)),
    apagar: (id) => tx("readwrite", (s) => s.delete(id)),
    limpar: () => tx("readwrite", (s) => s.clear()),
  };
})();

/* ---------- Downloads ---------- */
function baixarArquivo(nome, conteudo, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- Minha conta: dados e troca da própria senha ---------- */
function abrirMinhaConta() {
  const p = Estado.perfil;
  if (!p) return;
  abrirModal(`
    <h2>🔑 Minha conta</h2>
    <div class="detalhe-grid">
      <div><b>Nome</b>${esc(p.nome)}</div>
      <div><b>Usuário (login)</b>${esc(p.login)}</div>
      <div><b>Perfil</b>${nomePapel(p.papel)}</div>
    </div>
    <h3>Alterar minha senha</h3>
    <form id="form-minha-senha">
      <label>Senha atual <input type="password" name="atual" required autocomplete="current-password" /></label>
      <label>Nova senha <input type="password" name="nova" required minlength="8" autocomplete="new-password" placeholder="mínimo 8 caracteres" /></label>
      <label>Repita a nova senha <input type="password" name="confirma" required minlength="8" autocomplete="new-password" /></label>
      <label style="font-weight:400"><input type="checkbox" id="mostrar-senhas" style="display:inline;width:auto" /> Mostrar senhas</label>
      <p class="erro" id="minha-senha-erro"></p>
      <button class="btn primario">Salvar nova senha</button>
    </form>`);
  const f = $("#form-minha-senha");
  $("#mostrar-senhas").onchange = (e) => [f.atual, f.nova, f.confirma].forEach((i) => i.type = e.target.checked ? "text" : "password");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const erro = $("#minha-senha-erro");
    erro.textContent = "";
    if (f.nova.value.length < 8) return erro.textContent = "A nova senha precisa ter pelo menos 8 caracteres.";
    if (f.nova.value !== f.confirma.value) return erro.textContent = "As duas senhas novas não são iguais.";
    if (f.nova.value === f.atual.value) return erro.textContent = "A nova senha deve ser diferente da atual.";
    const btn = f.querySelector("button"); btn.disabled = true;
    try {
      // confirma a senha atual antes de trocar
      const { error: e1 } = await sb.auth.signInWithPassword({ email: Estado.usuario.email, password: f.atual.value });
      if (e1) throw new Error(/invalid/i.test(e1.message) ? "Senha atual incorreta." : e1.message);
      const { error: e2 } = await sb.auth.updateUser({ password: f.nova.value });
      if (e2) throw new Error(/same|different/i.test(e2.message) ? "A nova senha deve ser diferente da atual."
        : /weak|least|short/i.test(e2.message) ? "Senha fraca: use pelo menos 8 caracteres." : e2.message);
      fecharModal();
      aviso("✅ Senha alterada com sucesso!");
    } catch (er) {
      erro.textContent = er.message;
    } finally {
      btn.disabled = false;
    }
  };
}

/* ---------- Instalação do aplicativo (PWA) ---------- */
const Instalacao = (() => {
  let evento = null;
  const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const nomeApp = () => document.body.dataset.modo === "admin" ? "Gestão VMO" : "VMO Visitas";

  function atualizar() {
    const mostrarCartao = !instalado() && (!!evento || ios());
    $$("[data-instalar]").forEach((el) => mostrar(el, mostrarCartao));
    $$("[data-btn-instalar]").forEach((b) => mostrar(b, !!evento));
    $$("[data-instrucao-ios]").forEach((el) => mostrar(el, !evento && ios()));
    // botões que aparecem sempre (enquanto o app não estiver instalado)
    $$("[data-instalar-sempre]").forEach((el) => mostrar(el, !instalado()));
  }

  // Sem o convite automático do navegador: mostra o passo a passo
  function instrucoes() {
    abrirModal(`
      <h2>📲 Instalar o app "${nomeApp()}" no celular</h2>
      <div class="passos">
        <div><b>Android (Chrome)</b>
          <ol><li>Abra este endereço no <b>Chrome</b>.</li><li>Toque no menu <b>⋮</b> (três pontinhos, no canto superior direito).</li>
          <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li><li>Confirme em <b>Instalar</b>.</li></ol></div>
        <div><b>iPhone (Safari)</b>
          <ol><li>Abra este endereço no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (□↑, na barra de baixo).</li>
          <li>Role e toque em <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>.</li></ol></div>
      </div>
      <p class="dica">O ícone <b>${nomeApp()}</b> aparece na tela inicial e abre direto, em tela cheia.</p>
      <div class="link-publico"><input readonly value="${esc(location.href.split("#")[0])}" id="link-instalar" /><button class="btn" id="btn-copiar-instalar">Copiar link</button></div>`);
    $("#btn-copiar-instalar").onclick = async () => {
      try { await navigator.clipboard.writeText($("#link-instalar").value); } catch { $("#link-instalar").select(); document.execCommand("copy"); }
      aviso("Link copiado! Abra no navegador do celular.");
    };
  }

  async function instalar() {
    if (!evento) return instrucoes();
    evento.prompt();
    await evento.userChoice;
    evento = null;
    atualizar();
  }

  function iniciar() {
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); evento = e; atualizar(); });
    window.addEventListener("appinstalled", () => { evento = null; atualizar(); aviso(`✅ Aplicativo instalado! Abra pelo ícone ${nomeApp()}.`); });
    $$("[data-btn-instalar], [data-instalar-sempre]").forEach((b) => b.onclick = instalar);
    atualizar();
  }
  return { iniciar, instalar };
})();
