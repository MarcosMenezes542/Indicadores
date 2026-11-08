/* Controle de login e de acesso por perfil.
   - index.html (app do VMO): somente a tela de registro de visitas.
   - admin.html (painel): somente administradores. */
const Main = (() => {
  const MODO = document.body.dataset.modo; // "vmo" | "admin"
  let iniciado = false;

  function telas(qual) {
    ["login", "vmo", "admin"].forEach((t) => { const el = $(`#tela-${t}`); if (el) mostrar(el, t === qual); });
    mostrar("#topo", qual !== "login");
  }

  async function negar(msg) {
    await sb.auth.signOut();
    telas("login");
    $("#login-erro").innerHTML = msg;
  }

  async function entrarNoApp() {
    carregando(true);
    try {
      const perfil = await carregarPerfil();
      if (!perfil) { telas("login"); return; }
      if (!perfil.ativo) return await negar("Seu usuário está desativado. Procure o administrador.");
      if (MODO === "admin" && !["admin", "gestor"].includes(perfil.papel))
        return await negar('Acesso restrito ao administrador.<br>VMO: use o <a href="./">aplicativo do VMO</a>.');
      if (MODO === "vmo" && perfil.papel === "gestor")
        return await negar('O perfil Gestor é somente de visualização.<br>Acesse o <a href="admin.html">painel</a>.');

      $("#nome-usuario").textContent = `${perfil.nome} · ${nomePapel(perfil.papel)}`;
      await carregarUnidades();
      if (MODO === "admin") {
        telas("admin");
        if (!iniciado) { iniciado = true; await Admin.iniciar(); }
      } else {
        mostrar("#link-painel", perfil.papel === "admin");
        telas("vmo");
        await VMO.iniciar();
      }
    } catch (e) {
      aviso("Erro ao entrar: " + e.message, true);
      telas("login");
    } finally {
      carregando(false);
    }
  }

  async function login(ev) {
    ev.preventDefault();
    const f = ev.target, erro = $("#login-erro");
    erro.textContent = "";
    const btn = f.querySelector("button");
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: loginParaEmail(f.login.value), password: f.senha.value });
    btn.disabled = false;
    if (error) {
      erro.textContent = /invalid/i.test(error.message) ? "Usuário ou senha incorretos."
        : /banned/i.test(error.message) ? "Usuário desativado. Procure o administrador."
        : /fetch|network/i.test(error.message) ? "Sem conexão com a internet." : error.message;
      return;
    }
    f.senha.value = "";
    await entrarNoApp();
  }

  async function sair() {
    if (!confirm("Deseja sair?")) return;
    await sb.auth.signOut();
    location.reload();
  }

  function iniciar() {
    $("#form-login").onsubmit = login;
    $("#btn-sair").onclick = sair;
    $("#btn-conta").onclick = abrirMinhaConta;
    $("#modal-fechar").onclick = fecharModal;
    $("#modal").onclick = (e) => { if (e.target.id === "modal") fecharModal(); };
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
    if (MODO === "vmo") { VMO.ligarEventos(); Instalacao.iniciar(); }
    else Admin.ligarEventos();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    entrarNoApp();
  }

  return { iniciar };
})();

Main.iniciar();
