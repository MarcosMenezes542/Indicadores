"use strict";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const API = "https://bolls.life"; // usado só quando o app é aberto como arquivo local
// Versões disponíveis no serviço bolls.life (código do serviço em "id").
// A NVI não está disponível: a Biblica, detentora dos direitos, proibiu sua distribuição gratuita.
const VERSIONS = [
  { id: "NAA", short: "NAA", name: "Nova Almeida Atualizada", lang: "Português" },
  { id: "ARA", short: "ARA", name: "Almeida Revista e Atualizada", lang: "Português" },
  { id: "ARC09", short: "ARC", name: "Almeida Revista e Corrigida", lang: "Português" },
  { id: "ACF11", short: "ACF", name: "Almeida Corrigida Fiel", lang: "Português" },
  { id: "NVT", short: "NVT", name: "Nova Versão Transformadora", lang: "Português" },
  { id: "NTLH", short: "NTLH", name: "Nova Tradução na Linguagem de Hoje", lang: "Português" },
  { id: "KJA", short: "KJA", name: "King James Atualizada", lang: "Português" },
  { id: "ALM21", short: "A21", name: "Almeida Século 21", lang: "Português" },
  { id: "NBV07", short: "NBV", name: "Nova Bíblia Viva", lang: "Português" },
  { id: "VFL", short: "VFL", name: "Versão Fácil de Ler", lang: "Português" },
  { id: "TB10", short: "TB", name: "Tradução Brasileira", lang: "Português" },
  { id: "KJV", short: "KJV", name: "King James Version", lang: "Inglês" },
  { id: "WEB", short: "WEB", name: "World English Bible", lang: "Inglês" },
  { id: "RV1960", short: "RVR", name: "Reina-Valera 1960", lang: "Espanhol" },
  { id: "FRLSG", short: "LSG", name: "Louis Segond 1910", lang: "Francês" },
];
const CACHE_PREFIX = "nvi:ch:"; // chaves: nvi:ch:<versão>:<livro>:<capítulo>
const LS = {
  pos: "nvi:pos",
  marks: "nvi:marks",
  font: "nvi:font",
  theme: "nvi:theme",
  version: "nvi:version",
};
let VERSION = localStorage.getItem(LS.version) || "NAA";
if (!VERSIONS.some((v) => v.id === VERSION)) VERSION = "NAA"; // ex.: quem tinha "nvi" salvo
const currentVersion = () => VERSIONS.find((v) => v.id === VERSION);

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  bookIndex: 0,
  chapter: 1,
  verses: [],
  selected: null, // número do versículo selecionado
  pickerTestament: "AT",
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function normalize(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function toast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}
const book = () => BOOKS[state.bookIndex];
const refLabel = (b, c, v) => `${b.name} ${c}${v ? ":" + v : ""}`;

// ---------------------------------------------------------------------------
// API e cache offline
// ---------------------------------------------------------------------------
async function apiRequest(path, params = {}) {
  // Publicado na web: usa o intermediário do próprio site (/api/biblia), que evita bloqueios de CORS.
  // Aberto como arquivo local: chama o serviço diretamente.
  const qs = new URLSearchParams(params);
  const url = location.protocol.startsWith("http")
    ? `api/biblia?${new URLSearchParams({ path, ...params })}`
    : API + path + (qs.toString() ? "?" + qs : "");
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(navigator.onLine === false ? "Sem conexão com a internet." : "Não foi possível conectar ao servidor da Bíblia. Tente novamente.");
  }
  if (res.status === 429) throw new Error("Muitas consultas em pouco tempo. Aguarde um instante e tente novamente.");
  if (res.status >= 500) throw new Error("O serviço que fornece o texto bíblico está fora do ar no momento. Tente novamente mais tarde.");
  if (!res.ok) throw new Error(`Erro ao carregar (HTTP ${res.status}).`);
  return res.json();
}

// Remove marcações do texto (números de Strong, notas, quebras de linha) e decodifica entidades HTML.
function cleanText(html) {
  const s = String(html)
    .replace(/<S>\s*\d+\s*<\/S>/gi, "")
    .replace(/<sup>[\s\S]*?<\/sup>/gi, "")
    .replace(/<br\s*\/?>/gi, " ");
  const doc = new DOMParser().parseFromString(s, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

async function getChapter(abbrev, chapter) {
  const key = `${CACHE_PREFIX}${VERSION}:${abbrev}:${chapter}`;
  const cached = readJSON(key, null);
  if (cached) return cached;

  const bookNumber = BOOKS.findIndex((b) => b.abbrev === abbrev) + 1;
  const data = await apiRequest(`/get-text/${VERSION}/${bookNumber}/${chapter}/`);
  const verses = (Array.isArray(data) ? data : [])
    .map((v) => ({ n: v.verse, t: cleanText(v.text) }))
    .filter((v) => v.t);
  if (!verses.length) throw new Error("Este capítulo não está disponível nesta versão.");
  if (!writeJSON(key, verses)) {
    // Armazenamento cheio: remove metade dos capítulos salvos e tenta de novo.
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
    keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => localStorage.removeItem(k));
    writeJSON(key, verses);
  }
  return verses;
}

// ---------------------------------------------------------------------------
// Marcações, favoritos e anotações
// ---------------------------------------------------------------------------
let marks = readJSON(LS.marks, {});
const markKey = (abbrev, c, v) => `${abbrev}|${c}|${v}`;
function getMark(v) { return marks[markKey(book().abbrev, state.chapter, v)] || {}; }
function setMark(v, patch) {
  const key = markKey(book().abbrev, state.chapter, v);
  const verse = state.verses.find((x) => x.n === v);
  const m = { ...(marks[key] || {}), ...patch, text: verse ? verse.t : "" };
  if (!m.color && !m.fav && !m.note) delete marks[key];
  else marks[key] = m;
  writeJSON(LS.marks, marks);
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
function savePosition() {
  writeJSON(LS.pos, { abbrev: book().abbrev, chapter: state.chapter });
}

function updateHeader() {
  $("#current-ref").textContent = `${book().name} ${state.chapter}`;
  document.title = `${book().name} ${state.chapter} (${currentVersion().short}) – Bíblia Sagrada`;
  $("#btn-version").textContent = currentVersion().short;
  const isFirst = state.bookIndex === 0 && state.chapter === 1;
  const isLast = state.bookIndex === BOOKS.length - 1 && state.chapter === book().chapters;
  $("#btn-prev").disabled = isFirst;
  $("#btn-next").disabled = isLast;
}

function renderStatus(html) {
  $("#content").innerHTML = `<div class="status">${html}</div>`;
}

function renderChapter(highlightVerse, { flash = true } = {}) {
  const b = book();
  const parts = state.verses.map((v) => {
    const m = getMark(v.n);
    const cls = ["verse", m.color ? `hl-${m.color}` : "", m.fav ? "fav" : ""].filter(Boolean).join(" ");
    const note = m.note ? `<span class="note-badge">✎ ${escapeHtml(m.note)}</span>` : "";
    return `<span class="${cls}" data-v="${v.n}" id="v${v.n}"><sup>${v.n}</sup>${escapeHtml(v.t)}</span> ${note}`;
  });
  $("#content").innerHTML = `
    <h1 class="chapter-heading">${escapeHtml(b.name)} ${state.chapter}</h1>
    <p class="chapter-sub">${escapeHtml(currentVersion().name)} (${currentVersion().short})</p>
    <div class="verses">${parts.join("")}</div>`;

  if (highlightVerse) {
    const el = document.getElementById(`v${highlightVerse}`);
    if (el) {
      el.scrollIntoView({ block: flash ? "center" : "start" });
      if (flash) el.classList.add("flash");
      else window.scrollBy(0, -70); // compensa a barra superior
    }
  }
}

async function openChapter(bookIndex, chapter, verse, { pushHash = true, flash = true } = {}) {
  bookIndex = Math.max(0, Math.min(BOOKS.length - 1, bookIndex));
  chapter = Math.max(1, Math.min(BOOKS[bookIndex].chapters, chapter));
  state.bookIndex = bookIndex;
  state.chapter = chapter;
  closeVerseMenu();
  updateHeader();
  savePosition();
  if (pushHash) {
    const h = `#/${BOOKS[bookIndex].abbrev}/${chapter}${verse ? "/" + verse : ""}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  renderStatus(`<div class="spinner"></div>Carregando ${escapeHtml(refLabel(book(), chapter))}…`);
  if (!verse) window.scrollTo(0, 0);

  const requested = `${VERSION}:${bookIndex}:${chapter}`;
  openChapter._last = requested;
  try {
    const verses = await getChapter(book().abbrev, chapter);
    if (openChapter._last !== requested) return; // usuário já navegou para outro capítulo
    state.verses = verses;
    renderChapter(verse, { flash });
  } catch (err) {
    if (openChapter._last !== requested) return;
    renderStatus(`<p>${escapeHtml(err.message)}</p><button class="btn" id="retry">Tentar novamente</button>`);
    $("#retry").onclick = () => openChapter(bookIndex, chapter, verse);
  }
}

function goRelative(delta) {
  let bi = state.bookIndex;
  let c = state.chapter + delta;
  if (c < 1) {
    if (bi === 0) return;
    bi -= 1;
    c = BOOKS[bi].chapters;
  } else if (c > BOOKS[bi].chapters) {
    if (bi === BOOKS.length - 1) return;
    bi += 1;
    c = 1;
  }
  openChapter(bi, c);
}

// ---------------------------------------------------------------------------
// Referências (ex.: "Jo 3:16", "1 Coríntios 13", "sl 23")
// ---------------------------------------------------------------------------
function findBook(text) {
  const q = normalize(text).replace(/\s/g, "");
  if (!q) return -1;
  let idx = BOOKS.findIndex((b) => normalize(b.abbrev) === q || normalize(b.name).replace(/\s/g, "") === q);
  if (idx === -1) idx = BOOKS.findIndex((b) => normalize(b.name).replace(/\s/g, "").startsWith(q));
  return idx;
}

function parseReference(input) {
  const m = normalize(input).match(/^([1-3]?\s?[a-z]+)\s*(\d+)(?:\s*[:.,]\s*(\d+))?$/);
  if (!m) return null;
  const bi = findBook(m[1]);
  if (bi === -1) return null;
  const chapter = parseInt(m[2], 10);
  if (chapter < 1 || chapter > BOOKS[bi].chapters) return null;
  return { bookIndex: bi, chapter, verse: m[3] ? parseInt(m[3], 10) : null };
}

function parseHash() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
  if (parts.length < 1) return null;
  const bi = BOOKS.findIndex((b) => b.abbrev === parts[0]);
  if (bi === -1) return null;
  return { bookIndex: bi, chapter: parseInt(parts[1], 10) || 1, verse: parseInt(parts[2], 10) || null };
}

// ---------------------------------------------------------------------------
// Painéis
// ---------------------------------------------------------------------------
// Versões
function renderVersionList() {
  let lastLang = "";
  $("#version-list").innerHTML = VERSIONS.map((v) => {
    const head = v.lang !== lastLang ? `<h3 class="version-lang">${escapeHtml(v.lang)}</h3>` : "";
    lastLang = v.lang;
    return `${head}<button class="version-item ${v.id === VERSION ? "current" : ""}" data-version="${v.id}">
        <span class="version-short">${escapeHtml(v.short)}</span>
        <span class="version-name">${escapeHtml(v.name)}</span>
        ${v.id === VERSION ? '<span class="check">✓</span>' : ""}
      </button>`;
  }).join("");
}

function setVersion(id) {
  if (!VERSIONS.some((v) => v.id === id)) return;
  VERSION = id;
  localStorage.setItem(LS.version, id);
  closePanels();
  toast(`Versão: ${currentVersion().name}`);
  const top = state.verses.length ? firstVisibleVerse() : null;
  openChapter(state.bookIndex, state.chapter, top && top > 1 ? top : null, { flash: false });
}

// Número do primeiro versículo visível, para manter o ponto de leitura ao trocar de versão
function firstVisibleVerse() {
  const el = $$(".verse").find((e) => e.getBoundingClientRect().bottom > 70);
  return el ? +el.dataset.v : null;
}

function openPanel(id) {
  $$(".panel").forEach((p) => (p.hidden = p.id !== id));
  $("#backdrop").hidden = false;
  closeVerseMenu();
}
function closePanels() {
  $$(".panel").forEach((p) => (p.hidden = true));
  $("#backdrop").hidden = true;
}

// Livros e capítulos
function renderBookList() {
  const filter = normalize($("#book-filter").value);
  const list = BOOKS.map((b, i) => ({ b, i })).filter(({ b }) =>
    filter ? normalize(b.name).includes(filter) || normalize(b.abbrev).startsWith(filter) : b.testament === state.pickerTestament
  );
  if (filter) {
    const rank = ({ b }) => { const n = normalize(b.name); return n === filter ? 0 : n.startsWith(filter) ? 1 : 2; };
    list.sort((a, z) => rank(a) - rank(z) || a.i - z.i);
  }
  $("#book-list").innerHTML = list
    .map(({ b, i }) => `<li><button data-book="${i}" class="${i === state.bookIndex ? "current" : ""}">
        <span>${escapeHtml(b.name)}</span><span class="count">${b.chapters} cap.</span></button></li>`)
    .join("");
}

function showChapterPicker(bi) {
  const b = BOOKS[bi];
  $("#book-list").hidden = true;
  $("#book-filter").hidden = true;
  $(".tabs").hidden = true;
  $("#chapter-picker").hidden = false;
  $("#chapter-picker-title").textContent = b.name;
  let html = "";
  for (let c = 1; c <= b.chapters; c++) {
    const cur = bi === state.bookIndex && c === state.chapter ? "current" : "";
    html += `<button class="${cur}" data-chapter="${c}">${c}</button>`;
  }
  const grid = $("#chapter-grid");
  grid.innerHTML = html;
  grid.dataset.book = bi;
}

function showBookList() {
  $("#book-list").hidden = false;
  $("#book-filter").hidden = false;
  $(".tabs").hidden = false;
  $("#chapter-picker").hidden = true;
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.testament === state.pickerTestament));
  renderBookList();
}

function openBooksPanel(direct) {
  state.pickerTestament = book().testament;
  $("#book-filter").value = "";
  showBookList();
  if (direct) showChapterPicker(state.bookIndex);
  openPanel("panel-books");
}

// Busca
async function doSearch(query) {
  const ref = parseReference(query);
  if (ref) {
    closePanels();
    openChapter(ref.bookIndex, ref.chapter, ref.verse);
    return;
  }
  const out = $("#search-results");
  if (query.trim().length < 3) {
    out.innerHTML = `<p class="hint">Digite pelo menos 3 letras.</p>`;
    return;
  }
  out.innerHTML = `<div class="status"><div class="spinner"></div>Buscando…</div>`;
  try {
    const data = await apiRequest(`/v2/find/${VERSION}`, {
      search: query.trim(), match_case: "false", match_whole: "false", limit: "200",
    });
    const verses = Array.isArray(data) ? data : data.results || [];
    if (!verses.length) {
      out.innerHTML = `<p class="hint">Nenhum resultado para “${escapeHtml(query)}”.</p>`;
      return;
    }
    const re = new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    out.innerHTML =
      `<p class="hint">${data.total ?? verses.length} versículo(s)${(data.total ?? 0) > verses.length ? ` — mostrando os primeiros ${verses.length}` : ""}</p>` +
      verses
        .map((v) => {
          const bi = v.book - 1;
          if (!BOOKS[bi]) return "";
          const text = escapeHtml(cleanText(v.text)).replace(re, "<mark>$1</mark>");
          return `<button class="result" data-book="${bi}" data-chapter="${v.chapter}" data-verse="${v.verse}">
              <strong>${escapeHtml(BOOKS[bi].name)} ${v.chapter}:${v.verse}</strong><span>${text}</span></button>`;
        })
        .join("");
  } catch (err) {
    out.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
  }
}

// Favoritos
function renderFavs() {
  const entries = Object.entries(marks)
    .map(([key, m]) => {
      const [abbrev, c, v] = key.split("|");
      return { key, m, bi: BOOKS.findIndex((b) => b.abbrev === abbrev), c: +c, v: +v };
    })
    .filter((e) => e.bi >= 0)
    .sort((a, b) => a.bi - b.bi || a.c - b.c || a.v - b.v);

  if (!entries.length) {
    $("#favs-list").innerHTML = `<p class="hint">Toque em um versículo para marcar, favoritar ou anotar. Eles aparecerão aqui.</p>`;
    return;
  }
  $("#favs-list").innerHTML = entries
    .map(({ key, m, bi, c, v }) => {
      const tags = [m.fav ? "★" : "", m.color ? "●" : ""].join(" ");
      return `<div class="result" data-book="${bi}" data-chapter="${c}" data-verse="${v}" role="button" tabindex="0">
          <button class="remove" data-remove="${escapeHtml(key)}" aria-label="Remover">✕</button>
          <strong>${escapeHtml(refLabel(BOOKS[bi], c, v))} ${tags}</strong>
          <span>${escapeHtml(m.text || "")}</span>
          ${m.note ? `<span class="note-badge">✎ ${escapeHtml(m.note)}</span>` : ""}
        </div>`;
    })
    .join("");
}

// Configurações
function applyFont(px) {
  px = Math.max(14, Math.min(32, px));
  document.documentElement.style.setProperty("--font-size", px + "px");
  $("#font-size-label").textContent = px + "px";
  localStorage.setItem(LS.font, px);
}
function applyTheme(theme) {
  if (theme === "light") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  const colors = { light: "#5b3a1e", sepia: "#5b3a1e", dark: "#16151a" };
  document.querySelector('meta[name="theme-color"]').setAttribute("content", colors[theme] || colors.light);
  localStorage.setItem(LS.theme, theme);
}
function updateCacheInfo() {
  const n = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).length;
  $("#cache-info").textContent = `${n} capítulo(s) salvos para leitura offline.`;
}

// ---------------------------------------------------------------------------
// Menu do versículo
// ---------------------------------------------------------------------------
function openVerseMenu(v) {
  $$(".verse.selected").forEach((el) => el.classList.remove("selected"));
  state.selected = v;
  document.getElementById(`v${v}`)?.classList.add("selected");
  $("#verse-menu-ref").textContent = refLabel(book(), state.chapter, v);
  $("#vm-fav").textContent = getMark(v).fav ? "★ Desfavoritar" : "☆ Favoritar";
  $("#verse-menu").hidden = false;
  $(".chapter-nav").hidden = true;
}
function closeVerseMenu() {
  state.selected = null;
  $$(".verse.selected").forEach((el) => el.classList.remove("selected"));
  $("#verse-menu").hidden = true;
  $(".chapter-nav").hidden = false;
}
function selectedVerseText() {
  const v = state.verses.find((x) => x.n === state.selected);
  return v ? `“${v.t}” — ${refLabel(book(), state.chapter, v.n)} (${currentVersion().short})` : "";
}
function rerenderKeepingScroll() {
  const y = window.scrollY;
  const sel = state.selected;
  renderChapter();
  window.scrollTo(0, y);
  if (sel) openVerseMenu(sel);
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
function bindEvents() {
  $("#btn-books").onclick = () => openBooksPanel(false);
  $("#btn-title").onclick = () => openBooksPanel(true);
  $("#btn-search").onclick = () => { openPanel("panel-search"); $("#search-input").focus(); };
  $("#btn-favs").onclick = () => { renderFavs(); openPanel("panel-favs"); };
  $("#btn-settings").onclick = () => { updateCacheInfo(); openPanel("panel-settings"); };
  $("#btn-version").onclick = () => { renderVersionList(); openPanel("panel-version"); };
  $("#settings-version").onclick = () => { renderVersionList(); openPanel("panel-version"); };
  $("#version-list").onclick = (e) => {
    const btn = e.target.closest("[data-version]");
    if (btn) setVersion(btn.dataset.version);
  };
  $("#btn-prev").onclick = () => goRelative(-1);
  $("#btn-next").onclick = () => goRelative(1);
  $("#backdrop").onclick = closePanels;
  $$("[data-close]").forEach((b) => (b.onclick = closePanels));

  // Livros
  $$(".tab").forEach((t) => (t.onclick = () => { state.pickerTestament = t.dataset.testament; showBookList(); }));
  $("#book-filter").oninput = renderBookList;
  $("#book-list").onclick = (e) => {
    const btn = e.target.closest("[data-book]");
    if (btn) showChapterPicker(+btn.dataset.book);
  };
  $("#back-to-books").onclick = showBookList;
  $("#chapter-grid").onclick = (e) => {
    const btn = e.target.closest("[data-chapter]");
    if (!btn) return;
    closePanels();
    openChapter(+$("#chapter-grid").dataset.book, +btn.dataset.chapter);
  };

  // Busca e favoritos: clicar no resultado abre o versículo
  const openResult = (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) {
      delete marks[rm.dataset.remove];
      writeJSON(LS.marks, marks);
      renderFavs();
      if (state.verses.length) rerenderKeepingScroll();
      return;
    }
    const r = e.target.closest(".result");
    if (!r || +r.dataset.book < 0) return;
    closePanels();
    openChapter(+r.dataset.book, +r.dataset.chapter, +r.dataset.verse);
  };
  $("#search-results").onclick = openResult;
  $("#favs-list").onclick = openResult;
  $("#search-form").onsubmit = (e) => { e.preventDefault(); doSearch($("#search-input").value); };

  // Versículos
  $("#content").onclick = (e) => {
    const el = e.target.closest(".verse");
    if (!el) return;
    const v = +el.dataset.v;
    if (state.selected === v) closeVerseMenu();
    else openVerseMenu(v);
  };
  $("#vm-close").onclick = closeVerseMenu;
  // Tocar fora do versículo e do menu fecha o menu
  document.addEventListener("click", (e) => {
    if (state.selected && !e.target.closest(".verse, #verse-menu")) closeVerseMenu();
  });
  $$(".swatch").forEach((s) => (s.onclick = () => {
    if (!state.selected) return;
    setMark(state.selected, { color: s.dataset.color || undefined });
    rerenderKeepingScroll();
  }));
  $("#vm-fav").onclick = () => {
    const v = state.selected;
    setMark(v, { fav: !getMark(v).fav });
    rerenderKeepingScroll();
    toast(getMark(v).fav ? "Adicionado aos favoritos" : "Removido dos favoritos");
  };
  $("#vm-note").onclick = () => {
    const v = state.selected;
    const note = prompt(`Anotação para ${refLabel(book(), state.chapter, v)}:`, getMark(v).note || "");
    if (note === null) return;
    setMark(v, { note: note.trim() || undefined });
    rerenderKeepingScroll();
  };
  $("#vm-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(selectedVerseText()); toast("Versículo copiado"); }
    catch { toast("Não foi possível copiar"); }
  };
  $("#vm-share").onclick = async () => {
    const text = selectedVerseText();
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* cancelado */ }
    } else {
      try { await navigator.clipboard.writeText(text); toast("Copiado para compartilhar"); } catch { toast("Não foi possível compartilhar"); }
    }
  };

  // Configurações
  $("#font-dec").onclick = () => applyFont(parseInt(localStorage.getItem(LS.font) || 18, 10) - 1);
  $("#font-inc").onclick = () => applyFont(parseInt(localStorage.getItem(LS.font) || 18, 10) + 1);
  $$("[data-theme-set]").forEach((b) => (b.onclick = () => applyTheme(b.dataset.themeSet)));
  $("#clear-cache").onclick = () => {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
    updateCacheInfo();
    toast("Capítulos salvos removidos");
  };

  // Teclado: ← → para navegar, Esc para fechar
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "Escape") { closePanels(); closeVerseMenu(); }
    const panelOpen = $$(".panel").some((p) => !p.hidden);
    if (panelOpen) return;
    if (e.key === "ArrowLeft") goRelative(-1);
    if (e.key === "ArrowRight") goRelative(1);
  });

  // Gesto de deslizar para trocar de capítulo
  let sx = 0, sy = 0;
  $("#reader").addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $("#reader").addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) goRelative(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.addEventListener("hashchange", () => {
    const r = parseHash();
    if (r) openChapter(r.bookIndex, r.chapter, r.verse, { pushHash: false });
  });
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
function init() {
  applyFont(parseInt(localStorage.getItem(LS.font) || 18, 10));
  applyTheme(localStorage.getItem(LS.theme) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  bindEvents();

  const fromHash = parseHash();
  const saved = readJSON(LS.pos, null);
  if (fromHash) {
    openChapter(fromHash.bookIndex, fromHash.chapter, fromHash.verse);
  } else if (saved) {
    const bi = BOOKS.findIndex((b) => b.abbrev === saved.abbrev);
    openChapter(bi >= 0 ? bi : 0, saved.chapter || 1);
  } else {
    openChapter(BOOKS.findIndex((b) => b.abbrev === "jo"), 1);
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
