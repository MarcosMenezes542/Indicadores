// Sistema de Sites Monitorados — API (Supabase Edge Function)
// Autenticação própria (tabelas sites_*), acessadas somente com a service role.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const TABS = ["mon", "nao"];
const ABA: Record<string, string> = { mon: "Sites monitorados", nao: "Sites não monitorados" };
const PERFIS = ["admin", "editor", "visualizador"];
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12 h (acesso comum)
const SESSION_TTL_LEMBRAR = 1000 * 60 * 60 * 24 * 30; // 30 dias ("Lembrar meu login")
const ITER = 100_000;
const PRINT_MAX = 2_500_000; // tamanho máximo do print (data URL) em caracteres

// Permissões configuráveis por perfil (o administrador tem todas, sempre).
// Gestor = editor, Supervisor = visualizador (ids internos mantidos).
const PERMS = ["exportar", "importar", "unidades", "excluir"] as const;
type Perm = Record<(typeof PERMS)[number], boolean>;
const PERM_PADRAO: Record<string, Perm> = {
  editor: { exportar: true, importar: true, unidades: true, excluir: true },
  visualizador: { exportar: true, importar: false, unidades: false, excluir: false },
};
const TODAS: Perm = { exportar: true, importar: true, unidades: true, excluir: true };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-sessao, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const erro = (status: number, msg: string) => json({ erro: msg }, status);
class HttpErr extends Error { constructor(public code: number, msg: string) { super(msg); } }

/* ---------- utilidades ---------- */
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const randHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(s: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
async function pbkdf2(senha: string, salt: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITER }, k, 256));
}
async function hashSenha(senha: string) { const salt = randHex(16); return { salt, hash: await pbkdf2(senha, salt) }; }
async function confere(senha: string, u: { salt: string; hash: string }) {
  const h = await pbkdf2(String(senha), u.salt);
  if (h.length !== u.hash.length) return false;
  let d = 0; for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ u.hash.charCodeAt(i);
  return d === 0;
}
function senhaFraca(s: unknown) {
  const v = String(s || "");
  if (v.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "A senha precisa ter letras e números.";
  return null;
}
const limpa = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
// login: nome de usuário (ex.: marcos) ou e-mail
const loginOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || /^[a-z0-9._-]{3,40}$/.test(e);
const must = <T>(r: { data: T; error: unknown }) => { if (r.error) { console.error(r.error); throw new HttpErr(500, "Erro no banco de dados."); } return r.data; };

type U = { id: string; nome: string; email: string; perfil: string; abas: string[]; ativo: boolean; trocar_senha: boolean; salt: string; hash: string; criado_em: string; ultimo_acesso: string | null };
const publico = (u: U) => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, abas: u.abas, ativo: u.ativo, criadoEm: u.criado_em, ultimoAcesso: u.ultimo_acesso, trocarSenha: u.trocar_senha });

async function log(acao: string, por = "", detalhe = "") { await db.from("sites_logs").insert({ acao, por, detalhe }); }

/* ---------- permissões por perfil ---------- */
async function lerPerm(): Promise<Record<string, Perm>> {
  const r = must(await db.from("sites_config").select("valor").eq("chave", "perfis_perm").maybeSingle()) as { valor: string } | null;
  let salvo: Record<string, Record<string, unknown>> = {};
  try { salvo = r ? JSON.parse(r.valor) : {}; } catch { salvo = {}; }
  const out: Record<string, Perm> = {};
  for (const p of Object.keys(PERM_PADRAO)) {
    out[p] = { ...PERM_PADRAO[p] };
    for (const k of PERMS) if (typeof salvo[p]?.[k] === "boolean") out[p][k] = salvo[p][k] as boolean;
  }
  return out;
}
const permDe = (u: U, P: Record<string, Perm>): Perm => (u.perfil === "admin" ? { ...TODAS } : { ...(P[u.perfil] || PERM_PADRAO.visualizador) });

function validaUsuario(b: Record<string, unknown>, novo: boolean) {
  const nome = limpa(b.nome).slice(0, 120);
  const email = limpa(b.email).toLowerCase().slice(0, 160);
  const perfil = PERFIS.includes(b.perfil as string) ? (b.perfil as string) : null;
  const abas = Array.isArray(b.abas) ? TABS.filter((t) => (b.abas as string[]).includes(t)) : null;
  if (!nome) return { e: "Informe o nome." };
  if (!loginOk(email)) return { e: "Informe um usuário (3 a 40 letras, números, ponto ou hífen, sem espaços) ou um e-mail válido." };
  if (!perfil) return { e: "Perfil inválido." };
  if (!abas || !abas.length) return { e: "Selecione ao menos uma aba de acesso." };
  if (novo || b.senha) { const f = senhaFraca(b.senha); if (f) return { e: f }; }
  return { nome, email, perfil, abas, ativo: b.ativo !== false };
}

async function sessao(req: Request) {
  const token = req.headers.get("x-sessao") || "";
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const th = await sha256(token);
  const s = must(await db.from("sites_sessoes").select("uid, exp, lembrar").eq("token_hash", th).maybeSingle()) as { uid: string; exp: string; lembrar: boolean } | null;
  if (!s || new Date(s.exp).getTime() < Date.now()) return null;
  const u = must(await db.from("sites_usuarios").select("*").eq("id", s.uid).maybeSingle()) as U | null;
  if (!u || !u.ativo) return null;
  // sessão deslizante (renova se faltar menos da metade)
  const ttl = s.lembrar ? SESSION_TTL_LEMBRAR : SESSION_TTL;
  if (new Date(s.exp).getTime() - Date.now() < ttl / 2)
    await db.from("sites_sessoes").update({ exp: new Date(Date.now() + ttl).toISOString() }).eq("token_hash", th);
  return { u, th };
}
async function novaSessao(uid: string, lembrar = false) {
  const token = randHex(32);
  const ttl = lembrar ? SESSION_TTL_LEMBRAR : SESSION_TTL;
  must(await db.from("sites_sessoes").insert({ token_hash: await sha256(token), uid, lembrar, exp: new Date(Date.now() + ttl).toISOString() }));
  await db.from("sites_sessoes").delete().lt("exp", new Date().toISOString());
  return token;
}
async function adminsAtivos() {
  return (must(await db.from("sites_usuarios").select("id").eq("perfil", "admin").eq("ativo", true)) as { id: string }[]).length;
}
async function lerBases() {
  const rows = must(await db.from("sites_bases").select("tab, dados, origem, por, em")) as { tab: string; dados: unknown[]; origem: string; por: string; em: string }[];
  const m = Object.fromEntries(rows.map((r) => [r.tab, r]));
  return m;
}

/* ---------- versões (para atualizar o painel dos outros usuários) ---------- */
// versão dos dados = data da última gravação das bases (mesmo cálculo de /painel)
const revDe = (B: Record<string, { em: string }>) => Math.max(0, ...TABS.map((t) => (B[t] ? new Date(B[t].em).getTime() : 0)));
async function revDados() {
  const rows = must(await db.from("sites_bases").select("tab, em")) as { tab: string; em: string }[];
  return revDe(Object.fromEntries(rows.map((r) => [r.tab, r])));
}
async function revPrints() {
  const r = must(await db.from("sites_config").select("valor").eq("chave", "prints_rev").maybeSingle()) as { valor: string } | null;
  return r ? Number(r.valor) || 0 : 0;
}
async function marcaPrints() {
  const v = Date.now();
  must(await db.from("sites_config").upsert({ chave: "prints_rev", valor: String(v), em: new Date().toISOString() }));
  return v;
}
const chavePrint = (k: unknown) => {
  const v = String(k ?? "").trim();
  if (!v || v.length > 200) throw new HttpErr(400, "Unidade do print inválida.");
  return v;
};

/* ---------- rotas ---------- */
async function rotear(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^.*?\/sites-api/, "").replace(/\/+$/, "") || "/";
  const m = req.method;
  const body = async () => { try { return m === "GET" ? {} : await req.json(); } catch { throw new HttpErr(400, "JSON inválido."); } };

  if (p === "/status" && m === "GET") {
    const s = await sessao(req);
    return json({ precisaConfigurar: false, logado: !!s, usuario: s ? publico(s.u) : null });
  }

  if (p === "/login" && m === "POST") {
    const b = await body();
    const email = limpa(b.email).toLowerCase();
    const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const falhas = must(await db.from("sites_logs").select("id", { count: "exact", head: false }).eq("acao", "Falha de login").eq("por", email).gte("em", desde)) as unknown[];
    if (falhas.length >= 5) return erro(429, "Muitas tentativas. Aguarde 5 minutos e tente novamente.");
    const u = must(await db.from("sites_usuarios").select("*").eq("email", email).maybeSingle()) as U | null;
    if (!u || !(await confere(b.senha || "", u))) { await log("Falha de login", email); return erro(401, "Usuário ou senha incorretos."); }
    if (!u.ativo) { await log("Login bloqueado (usuário inativo)", email); return erro(403, "Usuário desativado. Procure o administrador."); }
    const agora = new Date().toISOString();
    await db.from("sites_usuarios").update({ ultimo_acesso: agora }).eq("id", u.id);
    u.ultimo_acesso = agora;
    const lembrar = b.lembrar === true;
    await log("Login", u.email, lembrar ? "lembrar neste aparelho" : "");
    return json({ token: await novaSessao(u.id, lembrar), usuario: publico(u), lembrar });
  }

  const s = await sessao(req);
  if (p === "/logout" && m === "POST") {
    if (s) { await db.from("sites_sessoes").delete().eq("token_hash", s.th); await log("Logout", s.u.email); }
    return json({ ok: true });
  }
  if (!s) return erro(401, "Sessão expirada. Entre novamente.");
  const eu = s.u;

  if (p === "/eu" && m === "GET") return json({ usuario: { ...publico(eu), perm: permDe(eu, await lerPerm()) } });

  if (p === "/eu/senha" && m === "POST") {
    const b = await body();
    if (!(await confere(b.atual || "", eu))) return erro(400, "Senha atual incorreta.");
    const f = senhaFraca(b.nova); if (f) return erro(400, f);
    must(await db.from("sites_usuarios").update({ ...(await hashSenha(b.nova)), trocar_senha: false }).eq("id", eu.id));
    await db.from("sites_sessoes").delete().eq("uid", eu.id).neq("token_hash", s.th);
    await log("Senha alterada", eu.email);
    return json({ ok: true });
  }

  // dados para montar o painel (somente abas liberadas)
  if (p === "/painel" && m === "GET") {
    if (eu.trocar_senha) return erro(403, "Defina uma nova senha para continuar.");
    const [cfg, B, P] = await Promise.all([db.from("sites_config").select("valor").eq("chave", "painel_tpl").single(), lerBases(), lerPerm()]);
    const tpl = must(cfg) as { valor: string };
    const pick = (t: string) => {
      if (!eu.abas.includes(t)) return { d: [], s: "Sem acesso" };
      const r = B[t] || B[t + "_original"];
      return { d: r ? r.dados : [], s: r ? r.origem : "" };
    };
    const rev = revDe(B);
    return json({ usuario: { ...publico(eu), perm: permDe(eu, P) }, rev, tpl: tpl.valor, mon: pick("mon"), nao: pick("nao") });
  }

  // consulta leve: o painel pergunta periodicamente se algo mudou
  if (p === "/rev" && m === "GET") {
    const [dados, prints] = await Promise.all([revDados(), revPrints()]);
    return json({ dados, prints });
  }

  /* ---------- prints dos mosaicos (compartilhados entre os usuários) ---------- */
  if (p === "/prints" && m === "GET") {
    const k = url.searchParams.get("k");
    if (k != null) {
      const r = must(await db.from("sites_prints").select("img, em").eq("k", chavePrint(k)).maybeSingle()) as { img: string; em: string } | null;
      if (!r) return erro(404, "Print não encontrado.");
      return json({ k, img: r.img, em: r.em });
    }
    const [lista, rev] = await Promise.all([db.from("sites_prints").select("k, em"), revPrints()]);
    return json({ lista: must(lista), rev });
  }
  if (p === "/prints" && (m === "PUT" || m === "DELETE")) {
    const P = permDe(eu, await lerPerm());
    if (!P.importar && !P.unidades) return erro(403, "Seu perfil não tem permissão para alterar prints.");
    if (m === "PUT") {
      const b = await body();
      const k = chavePrint(b.k);
      const img = String(b.img || "");
      if (!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(img)) return erro(400, "Imagem inválida.");
      if (img.length > PRINT_MAX) return erro(413, "Imagem muito grande.");
      const em = new Date().toISOString();
      must(await db.from("sites_prints").upsert({ k, img, por: eu.email, em }));
      const rev = await marcaPrints();
      if (b.log !== false) await log("Print anexado", eu.email, k);
      return json({ ok: true, k, em, rev });
    }
    const k = chavePrint(url.searchParams.get("k"));
    must(await db.from("sites_prints").delete().eq("k", k));
    const rev = await marcaPrints();
    await log("Print removido", eu.email, k);
    return json({ ok: true, rev });
  }

  const md = p.match(/^\/dados\/(mon|nao)$/);
  if (md && m === "PUT") {
    const t = md[1];
    const P = permDe(eu, await lerPerm());
    if (!P.importar && !P.unidades) return erro(403, "Seu perfil não tem permissão para alterar as bases.");
    if (!eu.abas.includes(t)) return erro(403, "Sem acesso a esta aba.");
    const b = await body();
    if (!Array.isArray(b.d)) return erro(400, "Lista de sites inválida.");
    const d = b.d.filter((r: Record<string, unknown>) => r && typeof r === "object" && typeof r.unidade === "string");
    if (!P.importar && !P.excluir) {
      const B = await lerBases();
      const atual = B[t] || B[t + "_original"];
      if (atual && d.length < atual.dados.length) return erro(403, "Seu perfil não tem permissão para excluir unidades.");
    }
    must(await db.from("sites_bases").upsert({ tab: t, dados: d, origem: limpa(b.s).slice(0, 300) || "Base personalizada", por: eu.email, em: new Date().toISOString() }));
    await log("Base atualizada", eu.email, `${ABA[t]} · ${d.length} sites`);
    return json({ ok: true, total: d.length, rev: await revDados() });
  }
  if (md && m === "DELETE") {
    if (eu.perfil !== "admin") return erro(403, "Apenas administradores.");
    must(await db.from("sites_bases").delete().eq("tab", md[1]));
    await log("Base restaurada para a original", eu.email, ABA[md[1]]);
    return json({ ok: true });
  }

  if (p.startsWith("/usuarios") || p === "/logs" || p === "/bases" || p === "/permissoes") {
    if (eu.perfil !== "admin") return erro(403, "Apenas administradores.");
    if (p === "/permissoes" && m === "GET") return json({ perfis: await lerPerm() });
    if (p === "/permissoes" && m === "PUT") {
      const b = await body();
      const novo: Record<string, Perm> = {};
      for (const pf of Object.keys(PERM_PADRAO)) {
        const x = (b.perfis || {})[pf] || {};
        novo[pf] = Object.fromEntries(PERMS.map((k) => [k, x[k] === true])) as Perm;
      }
      must(await db.from("sites_config").upsert({ chave: "perfis_perm", valor: JSON.stringify(novo), em: new Date().toISOString() }));
      const nomes: Record<string, string> = { editor: "Gestor", visualizador: "Supervisor" };
      await log("Permissões dos perfis alteradas", eu.email, Object.entries(novo).map(([pf, v]) => `${nomes[pf]}: ${PERMS.filter((k) => v[k]).join(", ") || "só consulta"}`).join(" · "));
      return json({ perfis: novo });
    }
    if (p === "/logs" && m === "GET") {
      const l = must(await db.from("sites_logs").select("em, acao, por, detalhe").order("em", { ascending: false }).limit(200));
      return json({ logs: l });
    }
    if (p === "/bases" && m === "GET") {
      const B = await lerBases();
      const info = (t: string) => B[t]
        ? { personalizada: true, total: B[t].dados.length, origem: B[t].origem, por: B[t].por, em: B[t].em }
        : { personalizada: false, total: B[t + "_original"]?.dados.length || 0, origem: B[t + "_original"]?.origem || "" };
      return json({ mon: info("mon"), nao: info("nao") });
    }
    if (p === "/usuarios" && m === "GET") {
      const us = must(await db.from("sites_usuarios").select("*").order("nome")) as U[];
      return json({ usuarios: us.map(publico) });
    }
    if (p === "/usuarios" && m === "POST") {
      const b = await body();
      const v = validaUsuario(b, true);
      if ("e" in v) return erro(400, v.e!);
      const ex = must(await db.from("sites_usuarios").select("id").eq("email", v.email).maybeSingle());
      if (ex) return erro(409, "Já existe um usuário com este login.");
      const u = must(await db.from("sites_usuarios").insert({ ...v, ...(await hashSenha(b.senha)), trocar_senha: b.trocarSenha !== false, criado_por: eu.email }).select("*").single()) as U;
      await log("Usuário cadastrado", eu.email, `${u.nome} <${u.email}> · ${u.perfil}`);
      return json({ usuario: publico(u) });
    }
    const mu = p.match(/^\/usuarios\/([0-9a-f-]{36})$/);
    if (mu) {
      const u = must(await db.from("sites_usuarios").select("*").eq("id", mu[1]).maybeSingle()) as U | null;
      if (!u) return erro(404, "Usuário não encontrado.");
      if (m === "PUT") {
        const b = await body();
        const v = validaUsuario(b, false);
        if ("e" in v) return erro(400, v.e!);
        const ex = must(await db.from("sites_usuarios").select("id").eq("email", v.email).neq("id", u.id).maybeSingle());
        if (ex) return erro(409, "Já existe um usuário com este login.");
        const perdeAdmin = u.perfil === "admin" && u.ativo && (v.perfil !== "admin" || !v.ativo);
        if (perdeAdmin && (await adminsAtivos()) <= 1) return erro(400, "É necessário manter ao menos um administrador ativo.");
        const upd: Record<string, unknown> = { ...v };
        if (b.senha) Object.assign(upd, await hashSenha(b.senha), { trocar_senha: b.trocarSenha !== false });
        const nu = must(await db.from("sites_usuarios").update(upd).eq("id", u.id).select("*").single()) as U;
        if (!nu.ativo || b.senha) {
          let q = db.from("sites_sessoes").delete().eq("uid", u.id);
          if (u.id === eu.id) q = q.neq("token_hash", s.th);
          await q;
        }
        await log("Usuário alterado", eu.email, `${nu.nome} <${nu.email}> · ${nu.perfil}${nu.ativo ? "" : " · inativo"}${b.senha ? " · senha redefinida" : ""}`);
        return json({ usuario: publico(nu) });
      }
      if (m === "DELETE") {
        if (u.id === eu.id) return erro(400, "Você não pode excluir o próprio usuário.");
        if (u.perfil === "admin" && u.ativo && (await adminsAtivos()) <= 1) return erro(400, "É necessário manter ao menos um administrador ativo.");
        must(await db.from("sites_usuarios").delete().eq("id", u.id));
        await log("Usuário excluído", eu.email, `${u.nome} <${u.email}>`);
        return json({ ok: true });
      }
    }
  }
  return erro(404, "Rota não encontrada.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try { return await rotear(req); }
  catch (e) {
    if (e instanceof HttpErr) return erro(e.code, e.message);
    console.error(e);
    return erro(500, "Erro interno.");
  }
});
