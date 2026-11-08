/* Controle de login e navegação entre as telas */
const Main = (() => {
  let adminIniciado = false;

  function telas(qual) {
    ["login", "vmo", "admin"].forEach((t) => mostrar(`#tela-${t}`, t === qual));
    mostrar("#topo", qual !== "login");
  }

  async function entrarNoApp() {
    carregando(true);
    try {
      const perfil = await carregarPerfil();
      if (!perfil) { telas("login"); return; }
      if (!perfil.ativo) {
        await sb.auth.signOut();
        telas("login");
        $("#login-erro").textContent = "Seu usuário está desativado. Procure o administrador.";
        return;
      }
      $("#nome-usuario").textContent = `${perfil.nome} · ${perfil.papel === "admin" ? "Administrador" : "VMO"}`;
      await carregarUnidades();
      if (perfil.papel === "admin") {
        mostrar("#nav-admin", true);
        telas("admin");
        if (!adminIniciado) { adminIniciado = true; await Admin.iniciar(); }
      } else {
        mostrar("#nav-admin", false);
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

  function abrirVmo() {
    $$("#nav-admin button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === "nova"));
    telas("vmo");
    VMO.iniciar();
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
      erro.textContent = /invalid/i.test(error.message) ? "Usuário ou senha incorretos." : /banned/i.test(error.message) ? "Usuário desativado. Procure o administrador." : error.message;
      return;
    }
    f.senha.value = "";
    await entrarNoApp();
  }

  async function sair() {
    if (!confirm("Deseja sair?")) return;
    await sb.auth.signOut();
    adminIniciado = false;
    Estado.usuario = Estado.perfil = null;
    location.reload();
  }

  function iniciar() {
    $("#form-login").onsubmit = login;
    $("#btn-sair").onclick = sair;
    $("#modal-fechar").onclick = fecharModal;
    $("#modal").onclick = (e) => { if (e.target.id === "modal") fecharModal(); };
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
    VMO.ligarEventos();
    Admin.ligarEventos();
    entrarNoApp();
  }

  return { iniciar, abrirVmo };
})();

Main.iniciar();
