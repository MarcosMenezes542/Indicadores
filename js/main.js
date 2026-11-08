/* Controle de login e de acesso por perfil.
   - index.html (app do VMO): somente a tela de registro de visitas.
   - admin.html (painel): somente administradores. */
const Main = (() => {
  const MODO = document.body.dataset.modo; // "vmo" (index.html: login único + app do VMO) | "admin" (admin.html: painel)
  let iniciado = false;

  function telas(qual) {
    ["login", "vmo", "admin"].forEach((t) => { const el = $(`#tela-${t}`); if (el) mostrar(el, t === qual); });
    mostrar("#topo", qual !== "login");
  }

  // Volta para a tela de login única (index.html), opcionalmente com uma mensagem
  function irParaLogin(msg) {
    if (msg) sessionStorage.setItem("msg-login", msg);
    if (MODO === "admin") { location.replace("index.html"); return; }
    telas("login");
    const m = sessionStorage.getItem("msg-login");
    if (m) { $("#login-erro").innerHTML = m; sessionStorage.removeItem("msg-login"); }
  }

  async function negar(msg) {
    await sb.auth.signOut();
    irParaLogin(msg);
  }

  async function entrarNoApp() {
    carregando(true);
    try {
      const perfil = await carregarPerfil();
      if (!perfil) return irParaLogin();
      if (!perfil.ativo) return await negar("Seu usuário está desativado. Procure o administrador.");

      // Cada usuário vai para a área permitida
      const painel = acessaPainel(perfil);
      const registrar = permissoesDe(perfil).includes("registrar_visitas");
      if (!painel && !registrar) return await negar("Seu usuário ainda não tem nenhuma permissão. Procure o administrador.");
      const querRegistrar = new URLSearchParams(location.search).get("registrar") === "1";
      if (MODO === "vmo" && painel && !(registrar && querRegistrar)) { location.replace("admin.html"); return; }
      if (MODO === "admin" && !painel) { location.replace("index.html"); return; }
      mostrar("#link-painel", MODO === "vmo" && painel);
      mostrar("#btn-registrar-visita", MODO === "admin" && registrar);

      if ($("#papel-usuario")) {
        $("#nome-usuario").textContent = perfil.nome;
        $("#papel-usuario").textContent = nomePapel(perfil.papel);
        $("#avatar-usuario").textContent = perfil.nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
      } else $("#nome-usuario").textContent = `${perfil.nome} · ${nomePapel(perfil.papel)}`;
      await carregarUnidades();
      if (MODO === "admin") {
        telas("admin");
        if (!iniciado) { iniciado = true; await Admin.iniciar(); }
      } else {
        telas("vmo");
        await VMO.iniciar();
      }
    } catch (e) {
      aviso("Erro ao entrar: " + e.message, true);
      if (MODO === "vmo") telas("login");
    } finally {
      carregando(false);
    }
  }

  async function login(ev) {
    ev.preventDefault();
    const f = ev.target, erro = $("#login-erro");
    erro.textContent = "";
    const btn = f.querySelector(".btn-entrar");
    if (!f.login.value.trim() || !f.senha.value) { erro.textContent = "Informe o usuário e a senha."; tremer(); return; }
    btn.disabled = true;
    btn.classList.add("carregando-btn");
    const { error } = await sb.auth.signInWithPassword({ email: loginParaEmail(f.login.value), password: f.senha.value });
    btn.disabled = false;
    btn.classList.remove("carregando-btn");
    if (error) {
      tremer();
      erro.textContent = /invalid/i.test(error.message) ? "Usuário ou senha incorretos."
        : /banned/i.test(error.message) ? "Usuário desativado. Procure o administrador."
        : /fetch|network/i.test(error.message) ? "Sem conexão com a internet." : error.message;
      return;
    }
    if ($("#lembrar-usuario").checked) localStorage.setItem("vmo-ultimo-login", f.login.value.trim());
    else localStorage.removeItem("vmo-ultimo-login");
    f.senha.value = "";
    await entrarNoApp();
  }

  // Sair sempre encerra a sessão NESTE aparelho, mesmo sem internet ou se o servidor não responder
  async function sair() {
    if (!confirm("Deseja sair da sua conta?")) return;
    carregando(true, "Saindo...");
    try {
      // encerra a sessão no servidor (se responder em até 4 s)
      await Promise.race([sb.auth.signOut({ scope: "global" }), new Promise((ok) => setTimeout(ok, 4000))]);
    } catch {}
    try { await sb.auth.signOut({ scope: "local" }); } catch {}
    try {
      // garante que nenhuma sessão fique guardada no aparelho
      Object.keys(localStorage).filter((k) => k === "vmo-auth" || k.startsWith("vmo-auth") || /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k));
      sessionStorage.removeItem("app-gestao");
    } catch {}
    location.replace("index.html");
  }

  function tremer() {
    const c = $(".entrada-cartao");
    if (!c) return;
    c.classList.remove("tremer"); void c.offsetWidth; c.classList.add("tremer");
  }

  function prepararLogin() {
    const f = $("#form-login");
    if (!f) return;
    f.onsubmit = login;
    const salvo = localStorage.getItem("vmo-ultimo-login");
    if (salvo) { f.login.value = salvo; $("#lembrar-usuario").checked = true; }
    $("#btn-ver-senha").onclick = () => {
      const ver = f.senha.type === "password";
      f.senha.type = ver ? "text" : "password";
      $("#btn-ver-senha").textContent = ver ? "🙈" : "👁️";
    };
    const caps = (e) => mostrar("#aviso-caps", !!e.getModifierState?.("CapsLock"));
    f.senha.addEventListener("keyup", caps);
    f.senha.addEventListener("keydown", caps);
  }

  function iniciar() {
    prepararLogin();
    $("#btn-sair").onclick = sair;
    $("#btn-conta").onclick = abrirMinhaConta;
    $("#modal-fechar").onclick = fecharModal;
    $("#modal").onclick = (e) => { if (e.target.id === "modal") fecharModal(); };
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
    if (MODO === "vmo") VMO.ligarEventos();
    else Admin.ligarEventos();
    Instalacao.iniciar();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    entrarNoApp();
  }

  return { iniciar };
})();

Main.iniciar();
