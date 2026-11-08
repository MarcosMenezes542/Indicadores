import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DOMINIO = "vigilancia.local";
const PAPEIS = ["admin", "vigilante", "gestor", "supervisor"];
const PERMISSOES = ["registrar_visitas", "ver_painel", "ver_visitas", "exportar", "imprimir", "excluir_visitas", "gerenciar_unidades", "gerenciar_usuarios"];
const PADRAO: Record<string, string[]> = {
  admin: PERMISSOES,
  gestor: ["ver_painel", "ver_visitas", "exportar", "imprimir"],
  supervisor: ["registrar_visitas", "ver_painel", "ver_visitas", "exportar", "imprimir"],
  vigilante: ["registrar_visitas"],
};
// Permissões efetivas: o administrador tem todas; os demais usam as escolhidas ou as padrão do perfil
const permsDe = (p: { papel: string; permissoes?: string[] | null }) =>
  p.papel === "admin" ? PERMISSOES : (Array.isArray(p.permissoes) ? p.permissoes : PADRAO[p.papel] || []);
// Limpa a lista recebida (só aceita permissões conhecidas); admin não guarda lista própria
const limparPerms = (lista: unknown, papel: string) =>
  papel === "admin" || !Array.isArray(lista) ? null : [...new Set(lista.map(String).filter((x) => PERMISSOES.includes(x)))];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const toEmail = (login: string) => {
  const l = String(login || "").trim().toLowerCase();
  return l.includes("@") ? l : `${l}@${DOMINIO}`;
};
const loginValido = (l: string) => /^[a-zA-Z0-9._@-]{3,80}$/.test(String(l || "").trim());
const traduz = (m: string) => {
  if (/already been registered|already exists|duplicate/i.test(m)) return "Já existe um usuário com esse login.";
  if (/at least|weak|password/i.test(m)) return "Senha fraca: use pelo menos 8 caracteres.";
  return m;
};

async function criarConta(nome: string, login: string, senha: string, papel: string, permissoes: unknown = null) {
  if (!nome || String(nome).trim().length < 2) return { erro: "Informe o nome (mínimo 2 letras)." };
  if (!loginValido(login)) return { erro: "Usuário inválido: use de 3 a 80 caracteres, sem espaços nem acentos." };
  if (!senha || String(senha).length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (!PAPEIS.includes(papel)) return { erro: "Perfil inválido." };
  const { data, error } = await admin.auth.admin.createUser({
    email: toEmail(login),
    password: String(senha),
    email_confirm: true,
    app_metadata: { papel, nome: String(nome).trim() },
  });
  if (error) return { erro: traduz(error.message) };
  const perms = limparPerms(permissoes, papel);
  if (perms) await admin.from("perfis").update({ permissoes: perms }).eq("id", data.user.id);
  return { ok: true, id: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return resp("ok");
  if (req.method !== "POST") return resp({ erro: "Método não permitido" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return resp({ erro: "Requisição inválida" }, 400); }
  const acao = body.acao;

  // Primeiro acesso: só funciona enquanto não houver nenhum administrador ativo
  if (acao === "configurar") {
    const { count, error } = await admin.from("perfis").select("id", { count: "exact", head: true })
      .eq("papel", "admin").eq("ativo", true);
    if (error) return resp({ erro: error.message }, 500);
    if ((count ?? 0) > 0) return resp({ erro: "O sistema já foi configurado. Entre com seu usuário." }, 403);
    const r = await criarConta(body.nome, body.login, body.senha, "admin");
    return resp(r, r.erro ? 400 : 200);
  }

  // Demais ações: somente administradores ativos
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return resp({ erro: "Sessão expirada. Entre novamente." }, 401);
  // padrões de permissões salvos pelo administrador para cada perfil
  const { data: padroes } = await admin.from("perfis_permissoes").select("papel,permissoes");
  (padroes || []).forEach((r) => { if (Array.isArray(r.permissoes)) PADRAO[r.papel] = r.permissoes; });
  const { data: eu } = await admin.from("perfis").select("papel,ativo,permissoes").eq("id", u.user.id).maybeSingle();
  if (!eu || !eu.ativo || !permsDe(eu).includes("gerenciar_usuarios"))
    return resp({ erro: "Você não tem permissão para gerenciar usuários." }, 403);
  const souAdmin = eu.papel === "admin";

  if (acao === "criar") {
    const papel = body.papel || "vigilante";
    if (papel === "admin" && !souAdmin) return resp({ erro: "Apenas administradores podem criar outro administrador." }, 403);
    const r = await criarConta(body.nome, body.login, body.senha, papel, body.permissoes);
    return resp(r, r.erro ? 400 : 200);
  }

  // Lista os usuários com a data do último acesso
  if (acao === "listar") {
    const { data: perfis, error } = await admin.from("perfis").select("*").order("nome");
    if (error) return resp({ erro: error.message }, 500);
    const acessos: Record<string, string | null> = {};
    for (let page = 1; page <= 20; page++) {
      const { data, error: e } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (e) break;
      data.users.forEach((x) => { acessos[x.id] = x.last_sign_in_at ?? null; });
      if (data.users.length < 1000) break;
    }
    return resp({ ok: true, usuarios: perfis.map((p) => ({ ...p, ultimo_acesso: acessos[p.id] ?? null })) });
  }

  const id = String(body.id || "");
  if (!id) return resp({ erro: "Usuário não informado." }, 400);
  const { data: alvo } = await admin.from("perfis").select("*").eq("id", id).maybeSingle();
  if (!alvo) return resp({ erro: "Usuário não encontrado." }, 404);

  if (acao === "atualizar") {
    const nome = String(body.nome || "").trim();
    const papel = body.papel;
    const ativo = !!body.ativo;
    if (nome.length < 2) return resp({ erro: "Informe o nome (mínimo 2 letras)." }, 400);
    if (!PAPEIS.includes(papel)) return resp({ erro: "Perfil inválido." }, 400);
    if (!souAdmin && (papel === "admin" || alvo.papel === "admin"))
      return resp({ erro: "Apenas administradores podem alterar um administrador." }, 403);
    // permissões: se não vierem na requisição, mantém as atuais
    const permissoes = "permissoes" in body ? limparPerms(body.permissoes, papel) : (papel === "admin" ? null : alvo.permissoes);
    if (id === u.user.id) {
      const minhas = permsDe({ papel, permissoes });
      if (!ativo || (souAdmin && papel !== "admin") || !minhas.includes("gerenciar_usuarios"))
        return resp({ erro: "Você não pode desativar a sua conta, mudar o seu perfil nem tirar a sua permissão de gerenciar usuários." }, 400);
    }
    const { error: e1 } = await admin.from("perfis").update({ nome, papel, ativo, permissoes }).eq("id", id);
    if (e1) return resp({ erro: e1.message }, 500);
    const { error: e2 } = await admin.auth.admin.updateUserById(id, {
      app_metadata: { papel, nome },
      ban_duration: ativo ? "none" : "876000h",
    });
    if (e2) return resp({ erro: e2.message }, 500);
    return resp({ ok: true });
  }

  if (alvo.papel === "admin" && !souAdmin) return resp({ erro: "Apenas administradores podem alterar um administrador." }, 403);

  if (acao === "senha") {
    const senha = String(body.senha || "");
    if (senha.length < 8) return resp({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
    if (error) return resp({ erro: traduz(error.message) }, 400);
    return resp({ ok: true });
  }

  // Exclui o usuário. As visitas dele são mantidas (o nome do VMO continua no registro).
  if (acao === "excluir") {
    if (id === u.user.id) return resp({ erro: "Você não pode excluir a sua própria conta." }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return resp({ erro: error.message }, 500);
    return resp({ ok: true });
  }

  return resp({ erro: "Ação desconhecida." }, 400);
});
