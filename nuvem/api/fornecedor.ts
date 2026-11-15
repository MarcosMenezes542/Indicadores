// Camada extra da função "api": campo FORNECEDOR do chamado (Gitel, Sim Soluções...) e cadastro "fornecedores".
// O servidor principal continua sendo o do GitHub (importado em index.ts, sem alterações). Esta camada:
//  - grava o fornecedor enviado pela tela ao cadastrar/editar um chamado (e registra no histórico);
//  - preserva o fornecedor quando outras rotinas regravam o chamado (lote, importação, cadastros);
//  - atende o cadastro "fornecedores" (adicionar, colar vários, renomear, remover, ordenar) e a alteração em lote do fornecedor.
// Precisa ser importada ANTES do servidor principal (ela envolve o Deno.serve).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SITE = "https://chamados-seguranca-empresarial.vercel.app";
const ORIGEM_OK = /^https:\/\/chamados-seguranca-empresarial(-[a-z0-9-]+)?\.vercel\.app$/;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const limpa = (v: unknown, max = 120) => str(v).trim().slice(0, max);

type H = (req: Request, info?: unknown) => Response | Promise<Response>;
const resp = (status: number, o: unknown) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const erro = (status: number, m: string) => resp(status, { erro: m });
const ok = <T>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data; };

function agoraTxt() {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  const H = g("hour") === "24" ? "00" : g("hour");
  return { min: `${g("day")}/${g("month")}/${g("year")} ${H}:${g("minute")}`, seg: `${g("day")}/${g("month")}/${g("year")} ${H}:${g("minute")}:${g("second")}` };
}

async function todos(): Promise<{ id: number; dados: Record<string, any> }[]> {
  let out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const d = ok(await sb.from("chamados").select("id,dados").order("id").range(de, de + 999)) as any[];
    out = out.concat(d); if (d.length < 1000) break;
  }
  return out;
}
async function gravar(rows: { id: number; dados: Record<string, any> }[]) {
  for (let i = 0; i < rows.length; i += 500)
    ok(await sb.from("chamados").upsert(rows.slice(i, i + 500).map((r) => ({ id: r.id, dados: r.dados, atualizado: new Date().toISOString() }))));
}
async function historico(lista: { id: number | null; numero: string; acao: string; detalhes: string }[], usuario: string) {
  if (!lista.length) return;
  const q = agoraTxt().min;
  ok(await sb.from("historico").insert(lista.map((h) => ({ quando: q, chamado_id: h.id, numero: h.numero, acao: h.acao, detalhes: h.detalhes, usuario }))));
}
async function versao(usuario: string) { try { await sb.rpc("marcar_versao", { p_usuario: usuario }); } catch { /* só avisa as telas abertas */ } }
async function lerLista(): Promise<string[]> {
  const r = ok(await sb.from("cadastros").select("itens").eq("lista", "fornecedores").maybeSingle()) as any;
  return r && Array.isArray(r.itens) ? r.itens.map(String) : [];
}
async function salvarLista(itens: string[]) { ok(await sb.from("cadastros").upsert({ lista: "fornecedores", itens })); }

// quem está chamando (usa a própria rota de sessão do servidor principal)
async function sessao(req: Request, h: H, info: unknown) {
  const u = new URL(req.url); const i = u.pathname.indexOf("/api");
  u.pathname = (i >= 0 ? u.pathname.slice(0, i) : u.pathname.replace(/\/+$/, "")) + "/api/sessao";
  const r = await h(new Request(u.toString(), { method: "GET", headers: req.headers }), info);
  const j = await r.json().catch(() => ({}));
  if (!j || !j.logado) return null;
  return { perms: (j.permissoes || []) as string[], nome: j.usuario ? `${j.usuario.nome} (${j.usuario.login})` : "", trocar: !!(j.usuario && j.usuario.trocarSenha) };
}

async function cadastro(b: any, usuario: string) {
  let cur = await lerLista();
  const valor = limpa(b.valor, 200), novo = limpa(b.novo, 200);
  let afetados = 0, adicionados = 0, ignorados = 0;
  const hs: any[] = [];
  switch (str(b.acao)) {
    case "adicionar-varios": {
      const colados = (b.itens || []).map((x: unknown) => limpa(x, 200)).filter((x: string) => x);
      if (!colados.length && !b.ordenarTudo) return erro(400, "Nenhum item informado.");
      const ja = new Set(cur.map((v) => v.toUpperCase()));
      for (const v of colados) { const k = v.toUpperCase(); if (ja.has(k)) { ignorados++; continue; } ja.add(k); cur.push(v); adicionados++; }
      if (b.ordenarTudo) cur.sort((a, c) => a.localeCompare(c, "pt-BR", { sensitivity: "base" }));
      if (adicionados) hs.push({ id: null, numero: "", acao: "Cadastro em lote", detalhes: `FORNECEDORES: ${adicionados} item(ns) adicionado(s), ${ignorados} já existiam ou estavam repetidos` });
      break;
    }
    case "adicionar":
      if (!valor) return erro(400, "Digite o nome.");
      if (cur.some((x) => x.toUpperCase() === valor.toUpperCase())) return erro(400, `'${valor}' já está cadastrado.`);
      cur.push(valor); break;
    case "renomear": {
      if (!novo) return erro(400, "Digite o novo nome.");
      const idx = cur.indexOf(valor); if (idx < 0) return erro(400, "Item não encontrado.");
      if (novo !== valor && cur.some((x) => x.toUpperCase() === novo.toUpperCase() && x !== valor)) return erro(400, `'${novo}' já está cadastrado.`);
      cur[idx] = novo;
      const t = agoraTxt().seg, mud = (await todos()).filter((r) => str(r.dados.fornecedor) === valor);
      for (const r of mud) { r.dados.fornecedor = novo; r.dados.atualizadoEm = t; }
      await gravar(mud); afetados = mud.length;
      if (afetados) hs.push({ id: null, numero: "", acao: "Cadastro renomeado", detalhes: `FORNECEDORES: ${valor} -> ${novo} (${afetados} chamados atualizados)` });
      break;
    }
    case "remover": {
      const uso = (await todos()).filter((r) => str(r.dados.fornecedor) === valor).length;
      if (uso) return erro(400, `'${valor}' está em uso em ${uso} chamado(s). Renomeie-o ou altere esses chamados antes de remover.`);
      cur = cur.filter((x) => x !== valor); break;
    }
    case "ordenar": {
      const nova = (b.itens || []).map(String);
      if (nova.length !== cur.length || nova.some((x: string) => !cur.includes(x))) return erro(400, "Lista inválida.");
      cur = nova; break;
    }
    default: return erro(400, "Ação inválida.");
  }
  await salvarLista(cur); await historico(hs, usuario); await versao(usuario);
  return resp(200, { ok: true, afetados, adicionados, ignorados });
}

async function lote(b: any, usuario: string) {
  const ids = new Set((b.ids || []).map(Number));
  if (!ids.size) return erro(400, "Selecione ao menos um chamado.");
  const valor = limpa(b.valor), t = agoraTxt().seg;
  const mud = (await todos()).filter((r) => ids.has(r.id) && str(r.dados.fornecedor) !== valor);
  const hs = mud.map((r) => ({ id: r.id, numero: str(r.dados.numero), acao: "Alterado (lote)", detalhes: `FORNECEDOR: ${str(r.dados.fornecedor) || "(vazio)"} -> ${valor || "(vazio)"}` }));
  for (const r of mud) { r.dados.fornecedor = valor; r.dados.atualizadoEm = t; }
  await gravar(mud); await historico(hs, usuario); if (mud.length) await versao(usuario);
  return resp(200, { ok: true, alterados: mud.length });
}

async function interceptar(req: Request, h: H, info: unknown): Promise<Response> {
  const url = new URL(req.url); const ix = url.pathname.indexOf("/api");
  const path = (ix >= 0 ? url.pathname.slice(ix) : url.pathname).replace(/\/+$/, "");
  const m = req.method.toUpperCase();
  const vigia = m !== "GET" && m !== "OPTIONS" && /^\/api\/(chamados|lote|cadastros|importar)/.test(path);
  if (!vigia) return h(req, info);
  const o = req.headers.get("origin");
  if (o && o !== SITE && !ORIGEM_OK.test(o)) return erro(403, "Origem não permitida.");

  const texto = await req.text();
  let b: any = {}; try { b = texto.trim() ? JSON.parse(texto) : {}; } catch { b = {}; }
  const repassar = () => h(new Request(req.url, { method: req.method, headers: req.headers, body: texto || undefined }), info);

  // rotas atendidas aqui
  const proprio = (path === "/api/cadastros" && m === "PUT" && str(b.lista) === "fornecedores") || (path === "/api/lote" && m === "POST" && str(b.campo) === "fornecedor");
  if (proprio) {
    const s = await sessao(req, h, info);
    if (!s) return resp(401, { erro: "Sessão expirada. Entre novamente.", login: true });
    if (s.trocar) return resp(403, { erro: "Troque sua senha provisória para continuar.", trocarSenha: true });
    const perm = path === "/api/lote" ? "alterar_lote" : "gerenciar_cadastros";
    if (!s.perms.includes(perm)) return erro(403, "Seu perfil não tem permissão para esta ação. Peça a liberação ao administrador.");
    try { return path === "/api/lote" ? await lote(b, s.nome) : await cadastro(b, s.nome); }
    catch (e) { console.error(e); return erro(500, "Erro no servidor: " + (e as Error).message); }
  }

  // demais gravações: o servidor principal grava; depois o fornecedor é aplicado/preservado
  let antes: Map<number, string>;
  try { antes = new Map((await todos()).map((r) => [r.id, str(r.dados.fornecedor)])); }
  catch (e) { console.error(e); return repassar(); }
  const r = await repassar();
  if (!r.ok) return r;
  try {
    const desejado = new Map(antes);
    const mudouTela: number[] = [];
    const corpo = await r.clone().json().catch(() => null);
    const mc = path.match(/^\/api\/chamados(?:\/(\d+))?$/);
    if (mc && b && typeof b === "object" && "fornecedor" in b) {
      const id = mc[1] ? Number(mc[1]) : Number(corpo && corpo.id);
      if (id && (m === "POST" || m === "PUT")) { desejado.set(id, limpa(b.fornecedor)); if (m === "PUT" && limpa(b.fornecedor) !== (antes.get(id) || "")) mudouTela.push(id); }
    }
    const atuais = await todos();
    const fix = atuais.filter((x) => (desejado.get(x.id) || "") !== str(x.dados.fornecedor));
    for (const x of fix) x.dados.fornecedor = desejado.get(x.id) || "";
    if (fix.length) {
      await gravar(fix);
      if (mudouTela.length) {
        const s = await sessao(req, h, info);
        await historico(fix.filter((x) => mudouTela.includes(x.id)).map((x) => ({ id: x.id, numero: str(x.dados.numero), acao: "Alterado", detalhes: `FORNECEDOR: ${antes.get(x.id) || "(vazio)"} -> ${x.dados.fornecedor || "(vazio)"}` })), s ? s.nome : "");
        await versao(s ? s.nome : "");
      }
    }
  } catch (e) { console.error("fornecedor:", e); }
  return r;
}

// envolve o Deno.serve do servidor principal
const serveOriginal = Deno.serve.bind(Deno) as any;
const novoServe = (a: any, b?: any) => {
  const h: H = typeof a === "function" ? a : b;
  const w = (req: Request, info: unknown) => interceptar(req, h, info);
  return typeof a === "function" ? serveOriginal(w) : serveOriginal(a, w);
};
try { (Deno as any).serve = novoServe; } catch { Object.defineProperty(Deno, "serve", { value: novoServe, configurable: true, writable: true }); }
