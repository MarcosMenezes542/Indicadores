/* Funções compartilhadas entre o app do VMO e o painel do administrador */
const CFG = window.VMO_CONFIG;
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "vmo-auth" },
});

const Estado = { usuario: null, perfil: null, unidades: [] };

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
  const { data, error } = await sb.from("unidades").select("nome").order("nome");
  if (error) throw error;
  Estado.unidades = data.map((u) => u.nome);
  $("#lista-unidades").innerHTML = Estado.unidades.map((n) => `<option value="${esc(n)}">`).join("");
  return Estado.unidades;
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
