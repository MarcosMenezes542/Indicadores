// =====================================================================
//  Segurança Empresarial · Sistema de chamados de fornecedores — API na nuvem
//  Versão em nuvem do antigo servidor do notebook (server.ps1 + usuarios.ps1).
//  As mesmas regras: situação, mês de faturamento, perfis/permissões, histórico,
//  importação de planilha, backups e exportação para Excel.
//  Dados no Postgres (Supabase). Acesso só por esta função (service role); RLS fecha o resto.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SITE = "https://chamados-seguranca-empresarial.vercel.app";
const ORIGEM_OK = /^https:\/\/chamados-seguranca-empresarial(-[a-z0-9-]+)?\.vercel\.app$/;
const TZ = "America/Sao_Paulo";
const COOKIE = "gitel_sessao";
const SESSAO_HORAS = 10;
const MAX_BACKUPS = 60;

class Erro extends Error { constructor(public status: number, msg: string, public extra: Record<string, unknown> = {}) { super(msg); } }
const bad = (m: string) => new Erro(400, m);
const proibido = (m: string) => new Erro(403, m);
const conflito = (m: string) => new Erro(409, m);

// ------------------------------------------------------------- colunas
type Col = { key: string; header: string; kind: string; width: number };
const COLUMNS: Col[] = [
  { key: "numero", header: "Nº CHAMADO CPFL", kind: "code", width: 15 },
  { key: "unidade", header: "UNIDADE", kind: "text", width: 28 },
  { key: "empresa", header: "EMPRESA", kind: "text", width: 26 },
  { key: "valorMaterial", header: "VALOR MATERIAL (R$)", kind: "money", width: 16 },
  { key: "valorMaoObra", header: "VALOR MÃO DE OBRA / DESLOC. (R$)", kind: "money", width: 18 },
  { key: "valorTotal", header: "VALOR TOTAL DO SERVIÇO (R$)", kind: "calc", width: 18 },
  { key: "dataChamado", header: "DATA DO CHAMADO", kind: "date", width: 13 },
  { key: "dataPrevista", header: "DATA PREVISTA DE CONCLUSÃO", kind: "date", width: 14 },
  { key: "prioridade", header: "PRIORIDADE", kind: "text", width: 11 },
  { key: "dataReal", header: "DATA REAL DE CONCLUSÃO", kind: "date", width: 14 },
  { key: "status", header: "STATUS DO CHAMADO", kind: "calc", width: 20 },
  { key: "chamadoFornecedor", header: "CHAMADO FORNECEDOR", kind: "text", width: 14 },
  { key: "osFornecedor", header: "OS FORNECEDOR", kind: "text", width: 13 },
  { key: "statusOrcamento", header: "STATUS DO ORÇAMENTO", kind: "text", width: 20 },
  { key: "mesFaturamento", header: "MÊS /ANO DE FATURAMENTO", kind: "calc", width: 13 },
  { key: "pendencia", header: "PENDÊNCIA", kind: "text", width: 30 },
  { key: "observacao", header: "OBSERVAÇÃO", kind: "text", width: 40 },
  { key: "id", header: "ID SISTEMA", kind: "int", width: 8 },
  { key: "atualizadoEm", header: "ATUALIZADO EM", kind: "text", width: 18 },
  { key: "criadoPor", header: "CADASTRADO POR", kind: "text", width: 28 },
  { key: "responsavel", header: "RESPONSÁVEL PELO CHAMADO", kind: "text", width: 26 },
  { key: "contatoResponsavel", header: "CONTATO DO RESPONSÁVEL", kind: "text", width: 22 },
  { key: "statusChamado", header: "STATUS DO CHAMADO (LISTA)", kind: "text", width: 22 },
  { key: "tipo", header: "TIPO", kind: "text", width: 16 },
];
const HEADER_ALIAS: Record<string, string> = {
  CHAMADOFRACTTAL: "chamadoFornecedor", NCHAMADOCPFL: "numero", CHAMADOCPFL: "numero", NUMERODOCHAMADO: "numero",
  NUMEROCHAMADOCPFL: "numero", NOCHAMADO: "numero", NCHAMADO: "numero", NUMERO: "numero",
  VALORMATERIAL: "valorMaterial", VALORMAODEOBRA: "valorMaoObra", VALORMAODEOBRADESLOC: "valorMaoObra",
  DATACHAMADO: "dataChamado", DATAPREVISTA: "dataPrevista", DATAREAL: "dataReal", DATADECONCLUSAO: "dataReal",
  STATUSORCAMENTO: "statusOrcamento", PENDENCIAS: "pendencia", OBSERVACOES: "observacao", FORNECEDOR: "empresa",
  RESPONSAVEL: "responsavel", RESPONSAVELDOCHAMADO: "responsavel", SOLICITANTE: "responsavel",
  CONTATO: "contatoResponsavel", CONTATODORESPONSAVELPELOCHAMADO: "contatoResponsavel", TELEFONE: "contatoResponsavel",
  STATUSDOCHAMADOCADASTRO: "statusChamado",
  // planilha "BASE DE REGISTROS DE CHAMADOS - FORNECEDORES"
  OSGITEL: "osFornecedor", OS: "osFornecedor", CONTATOSOLICITANTE: "contatoResponsavel",
  ABERTURA: "dataChamado", DATADEABERTURA: "dataChamado", DATAABERTURA: "dataChamado",
  PRAZO: "dataPrevista", PRAZODECONCLUSAO: "dataPrevista", CONCLUSAO: "dataReal", DATACONCLUSAO: "dataReal",
  MATERIAL: "valorMaterial", MATERIALR: "valorMaterial", MATERIALRS: "valorMaterial", MAODEOBRA: "valorMaoObra", MAODEOBRAR: "valorMaoObra", MAODEOBRARS: "valorMaoObra",
  TIPODESERVICO: "tipo", TIPODOCHAMADO: "tipo",
  // colunas calculadas na planilha: o sistema recalcula com as mesmas regras
  STATUS: "status", SITUACAO: "status", SITUACAOSLA: "status", MESFATURAMENTO: "mesFaturamento", MESDEFATURAMENTO: "mesFaturamento",
  FATURAMENTO: "valorTotal", FATURAMENTOR: "valorTotal", VALORTOTAL: "valorTotal", VALORTOTALR: "valorTotal",
};
const CADASTRO_DEFS = [
  { key: "unidades", header: "UNIDADES", campo: "unidade" },
  { key: "empresas", header: "EMPRESAS", campo: "empresa" },
  { key: "prioridades", header: "PRIORIDADES", campo: "prioridade" },
  { key: "statusOrcamento", header: "STATUS DO ORÇAMENTO", campo: "statusOrcamento" },
  { key: "pendencias", header: "PENDÊNCIAS", campo: "pendencia" },
  { key: "statusChamado", header: "STATUS DO CHAMADO", campo: "statusChamado" },
  { key: "tipos", header: "TIPOS", campo: "tipo" },
];
const DEFAULT_PRIORIDADES = ["Urgente", "Alta", "Média", "Baixa"];
const DEFAULT_STATUS_ORC = ["Aguardando orçamento", "Orçamento enviado", "Aprovado", "Reprovado"];
const DEFAULT_TIPOS = ["Manutenção", "Visita técnica", "Retrofit", "Outros"];
const STATUS_CHAMADO = ["Em aberto", "Atrasado", "Concluído", "Concluído com atraso"];
const BULK_FIELDS = ["statusOrcamento", "statusChamado", "pendencia", "prioridade", "tipo", "empresa", "unidade", "dataReal", "dataPrevista"];
const LABELS: Record<string, string> = Object.fromEntries(COLUMNS.map((c) => [c.key, c.header]));

// ------------------------------------------------------------- utilidades
function agora() {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return { y: g("year"), m: g("month"), d: g("day"), H: g("hour") === "24" ? "00" : g("hour"), M: g("minute"), S: g("second") };
}
const todayIso = () => { const p = agora(); return `${p.y}-${p.m}-${p.d}`; };
const nowText = () => { const p = agora(); return `${p.d}/${p.m}/${p.y} ${p.H}:${p.M}`; };
const nowSec = () => { const p = agora(); return `${p.d}/${p.m}/${p.y} ${p.H}:${p.M}:${p.S}`; };
const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const fmtN2 = (n: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
function clean(v: unknown, max = 3000) { const s = str(v).trim(); return s.length > max ? s.slice(0, max) : s; }
function normHeader(h: unknown) { return str(h).normalize("NFKD").replace(/\p{Mn}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function findColumn(header: unknown): Col | undefined {
  const h = normHeader(header); if (!h) return undefined;
  return COLUMNS.find((c) => normHeader(c.header) === h) || (HEADER_ALIAS[h] ? COLUMNS.find((c) => c.key === HEADER_ALIAS[h]) : undefined);
}
function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return round2(v);
  let s = String(v).trim().replace(/[R$\s]/g, "");
  if (s === "") return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const d = Number(s);
  if (!isFinite(d)) throw bad(`Valor inválido: '${v}'. Use números, ex.: 1234,56`);
  return round2(d);
}
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function dataValida(y: number, m: number, d: number) { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
function serialToIso(v: number) { const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000)); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
// '' = vazio; null = inválida
function parseDateIso(v: unknown): string | null {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return serialToIso(v);
  const s = String(v).trim(); if (s === "") return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return dataValida(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return dataValida(+m[3], +m[2], +m[1]) ? iso(+m[3], +m[2], +m[1]) : null;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) { const y = +m[3] <= 29 ? 2000 + +m[3] : 1900 + +m[3]; return dataValida(y, +m[2], +m[1]) ? iso(y, +m[2], +m[1]) : null; }
  return null;
}
function convertCell(kind: string, val: unknown): unknown {
  switch (kind) {
    case "code": if (val === null || val === undefined) return ""; if (typeof val === "number") return Number.isInteger(val) ? val.toFixed(0) : String(val); return String(val).trim();
    case "money": if (val === null || val === undefined) return 0; try { return parseMoney(val); } catch { return 0; }
    case "int": { if (val === null || val === undefined) return null; if (typeof val === "number") return Math.round(val); const n = parseInt(String(val).trim(), 10); return /^\s*-?\d+\s*$/.test(String(val)) ? n : null; }
    case "date": { const d = parseDateIso(val); return d === null ? "" : d; }
    default: if (val === null || val === undefined) return ""; if (typeof val === "number") return String(val); return String(val).trim();
  }
}

// ------------------------------------------------------------- regras (as mesmas fórmulas da planilha)
type Item = Record<string, any>;
function statusChamado(it: Item, hoje: string) {
  if (!str(it.numero).trim()) return "";
  if (it.dataReal) return (!it.dataPrevista || it.dataReal <= it.dataPrevista) ? "Concluído" : "Concluído com atraso";
  if (it.dataPrevista && hoje > it.dataPrevista) return "Atrasado";
  return "Em aberto";
}
// concluído até o dia 25 → fatura no mês seguinte; depois do dia 25 → dois meses depois
function mesFaturamento(dataReal: string) {
  if (!dataReal) return "";
  const [y, m, d] = dataReal.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + (d <= 25 ? 1 : 2), 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}
function completeItem(it: Item, hoje: string) {
  it.valorTotal = round2((Number(it.valorMaterial) || 0) + (Number(it.valorMaoObra) || 0));
  it.status = statusChamado(it, hoje);
  it.mesFaturamento = mesFaturamento(it.dataReal || "");
  return it;
}
function novoChamado(): Item { const o: Item = {}; for (const c of COLUMNS) o[c.key] = null; return o; }
const testNumeroPortal = (n: string) => /^\d+$/.test(n);
const getProp = (b: any, k: string) => (b && typeof b === "object" ? b[k] : undefined);

type Dados = { chamados: Item[]; cadastros: Record<string, string[]> };
function buildItem(b: any, existing: Item | null, data: Dados, usuarioAtual: string, avisosImport?: string[]): Item {
  const item = novoChamado();
  item.numero = clean(getProp(b, "numero"), 40);
  if (item.numero.toLowerCase() === "patrimonial") item.numero = "Patrimonial";
  item.unidade = clean(getProp(b, "unidade"), 150);
  item.empresa = clean(getProp(b, "empresa"), 150);
  if (!item.numero) throw bad("Informe o Nº do chamado CPFL.");
  if (!item.unidade) throw bad("Informe a unidade.");
  if (!item.empresa) throw bad("Informe a empresa.");
  // Nº do portal CPFL (só números) é único. "Patrimonial" e outros textos podem se repetir.
  if (testNumeroPortal(item.numero)) {
    const dup = data.chamados.find((x) => str(x.numero) === item.numero && (!existing || x.id !== existing.id));
    if (dup) throw bad(`Já existe um chamado com o Nº ${item.numero} do portal CPFL (unidade ${dup.unidade}).`);
  }
  item.valorMaterial = parseMoney(getProp(b, "valorMaterial"));
  item.valorMaoObra = parseMoney(getProp(b, "valorMaoObra"));
  if (item.valorMaterial < 0 || item.valorMaoObra < 0) throw bad("Os valores não podem ser negativos.");
  for (const k of ["dataChamado", "dataPrevista", "dataReal"]) {
    const bruto = getProp(b, k), d = parseDateIso(bruto);
    const anoRuim = !!d && (+d.slice(0, 4) < 1900 || +d.slice(0, 4) > 2100);
    if (d === null || anoRuim) {
      // na importação, só essa data fica em branco (o resto do chamado entra) e aparece um aviso
      if (avisosImport && k !== "dataChamado") { avisosImport.push(`Data inválida em '${LABELS[k]}' (${str(bruto)}): ficou em branco, corrija o ano na planilha ou no sistema.`); item[k] = ""; continue; }
      throw bad(`Data inválida em '${LABELS[k]}'${bruto ? ` (${str(bruto)})` : ""}.`);
    }
    item[k] = d;
  }
  if (!item.dataChamado) throw bad("Informe a data do chamado.");
  // na importação, a planilha é a referência: datas fora de ordem entram como estão e aparecem como aviso para conferir
  const problemaData = (msg: string) => { if (avisosImport) avisosImport.push(msg + " Importado como está na planilha."); else throw bad(msg); };
  if (item.dataPrevista && item.dataPrevista < item.dataChamado) problemaData("A data prevista é anterior à data do chamado.");
  if (item.dataReal && item.dataReal < item.dataChamado) problemaData("A data real de conclusão é anterior à data do chamado.");
  item.prioridade = clean(getProp(b, "prioridade"), 40);
  item.chamadoFornecedor = clean(getProp(b, "chamadoFornecedor"), 60);
  item.osFornecedor = clean(getProp(b, "osFornecedor"), 60);
  item.statusOrcamento = clean(getProp(b, "statusOrcamento"), 80);
  item.pendencia = clean(getProp(b, "pendencia"), 200);
  item.observacao = clean(getProp(b, "observacao"));
  item.responsavel = clean(getProp(b, "responsavel"), 120);
  item.contatoResponsavel = clean(getProp(b, "contatoResponsavel"), 120);
  item.statusChamado = clean(getProp(b, "statusChamado"), 80);
  // tipo: se a tela não enviar o campo, mantém o que já estava gravado
  item.tipo = b && typeof b === "object" && "tipo" in b ? clean(getProp(b, "tipo"), 80) : (existing ? clean(existing.tipo, 80) : "");
  item.id = existing ? existing.id : 0;
  item.atualizadoEm = nowSec();
  item.criadoPor = existing ? str(existing.criadoPor) : usuarioAtual;
  return completeItem(item, todayIso());
}
function describeChanges(old: Item, nw: Item) {
  const out: string[] = [];
  for (const c of COLUMNS) {
    if (c.kind === "calc" || ["atualizadoEm", "id", "criadoPor"].includes(c.key)) continue;
    let a = str(old[c.key]), b = str(nw[c.key]);
    if (c.kind === "money") { a = fmtN2(Number(old[c.key]) || 0); b = fmtN2(Number(nw[c.key]) || 0); }
    if (c.kind === "date") { a = a.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1"); b = b.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1"); }
    if (a !== b) out.push(`${c.header}: ${a || "(vazio)"} -> ${b || "(vazio)"}`);
  }
  return out.join(" | ");
}
function ensureCadastros(data: Dados): boolean {
  const cad = data.cadastros; const antes = JSON.stringify(cad);
  if (!(cad.prioridades || []).length) cad.prioridades = [...DEFAULT_PRIORIDADES];
  if (!(cad.statusOrcamento || []).length) cad.statusOrcamento = [...DEFAULT_STATUS_ORC];
  if (!(cad.tipos || []).length) cad.tipos = [...DEFAULT_TIPOS];
  for (const d of CADASTRO_DEFS) {
    const list: string[] = [];
    for (const v of cad[d.key] || []) if (v && !list.includes(v)) list.push(v);
    const extra = [...new Set(data.chamados.map((x) => str(x[d.campo])).filter((v) => v && !list.includes(v)))].sort();
    cad[d.key] = [...list, ...extra];
  }
  return JSON.stringify(cad) !== antes;
}

// ------------------------------------------------------------- permissões
const PERMISSOES = [
  { k: "ver_painel", n: "Visão geral", g: "Consulta" },
  { k: "ver_relatorio", n: "Relatório gerencial", g: "Consulta" },
  { k: "ver_faturamento", n: "Faturamento", g: "Consulta" },
  { k: "ver_chamados", n: "Consultar chamados (todos)", g: "Consulta" },
  { k: "ver_proprios", n: "Consultar só os chamados que cadastrou", g: "Consulta" },
  { k: "ver_valores", n: "Ver valores (R$)", g: "Consulta" },
  { k: "campos_gestao", n: "Ver e editar campos de gestão (prazos, situação, orçamento, OS, pendência)", g: "Consulta" },
  { k: "ver_historico", n: "Histórico de alterações", g: "Consulta" },
  { k: "exportar", n: "Exportar e imprimir", g: "Consulta" },
  { k: "criar_chamado", n: "Cadastrar chamados", g: "Chamados" },
  { k: "editar_chamado", n: "Editar chamados (todos)", g: "Chamados" },
  { k: "editar_proprios", n: "Editar só os chamados que cadastrou", g: "Chamados" },
  { k: "concluir_chamado", n: "Concluir chamados (data de conclusão)", g: "Chamados" },
  { k: "excluir_chamado", n: "Excluir chamados", g: "Chamados" },
  { k: "alterar_lote", n: "Alterações em lote", g: "Chamados" },
  { k: "importar", n: "Importar planilha", g: "Chamados" },
  { k: "gerenciar_cadastros", n: "Cadastros (unidades, fornecedores, listas)", g: "Administração" },
  { k: "gerenciar_backups", n: "Criar e restaurar backups", g: "Administração" },
  { k: "abrir_excel", n: "Abrir no Excel (baixar planilha)", g: "Administração" },
  { k: "gerenciar_usuarios", n: "Usuários e perfis de acesso", g: "Administração" },
];
const TODAS = PERMISSOES.map((p) => p.k);
const VERSAO_PERFIS = 2;
const CAMPOS_VALOR = ["valorMaterial", "valorMaoObra", "valorTotal", "mesFaturamento"];
const CAMPOS_GESTAO = ["dataPrevista", "dataReal", "status", "chamadoFornecedor", "osFornecedor", "statusOrcamento", "pendencia", "mesFaturamento", "statusChamado"];
const HEADERS_OCULTOS: Record<string, string> = {};
for (const c of COLUMNS) { if (CAMPOS_VALOR.includes(c.key)) HEADERS_OCULTOS[c.header] = "ver_valores"; else if (CAMPOS_GESTAO.includes(c.key)) HEADERS_OCULTOS[c.header] = "campos_gestao"; }

type Perfil = { id: string; nome: string; sistema: boolean; descricao: string; permissoes: string[] };
type Usuario = { id: number; nome: string; login: string; email: string; perfilId: string; ativo: boolean; salt: string; hash: string; iter: number; trocarSenha: boolean; criadoEm: string; ultimoAcesso: string };
type UDB = { perfis: Perfil[]; usuarios: Usuario[] };
const getPerfil = (udb: UDB, id: string) => udb.perfis.find((p) => p.id === id);
function getPerms(udb: UDB, u: Usuario) { const p = getPerfil(udb, u.perfilId); return p ? (p.sistema ? TODAS : p.permissoes || []) : []; }
const testPerm = (udb: UDB, u: Usuario, perm: string) => getPerms(udb, u).includes(perm);
function requirePerm(udb: UDB, u: Usuario, perms: string[]) {
  if (perms.some((p) => testPerm(udb, u, p))) return;
  const nomes = PERMISSOES.filter((p) => perms.includes(p.k)).map((p) => p.n).join(" ou ");
  throw proibido(`Seu perfil não tem permissão para esta ação (${nomes}). Peça a liberação ao administrador.`);
}
const ehDono = (it: Item, u: Usuario) => str(it.criadoPor).endsWith(`(${u.login})`);
function hideCampos(udb: UDB, it: Item, u: Usuario) {
  const vVal = testPerm(udb, u, "ver_valores"), vGes = testPerm(udb, u, "campos_gestao");
  if (vVal && vGes) return it;
  const c = { ...it };
  if (!vVal) for (const k of CAMPOS_VALOR) c[k] = null;
  if (!vGes) for (const k of CAMPOS_GESTAO) c[k] = null;
  return c;
}
function hideHistorico(udb: UDB, h: Item, u: Usuario) {
  const vVal = testPerm(udb, u, "ver_valores"), vGes = testPerm(udb, u, "campos_gestao");
  if (vVal && vGes) return h;
  const partes = str(h.detalhes).split(" | ").filter((p) => {
    if (!vVal && /^Total:/.test(p)) return false;
    for (const hd of Object.keys(HEADERS_OCULTOS)) if (p.startsWith(`${hd}:`) && !testPerm(udb, u, HEADERS_OCULTOS[hd])) return false;
    return true;
  });
  return { ...h, detalhes: partes.join(" | ") };
}
// campos que o usuário não pode ver: ao gravar, mantém o que já existe (ou vazio, se novo)
function protectBody(udb: UDB, b: any, existing: Item | null, u: Usuario) {
  const o: Item = { ...(b || {}) };
  if (!testPerm(udb, u, "ver_valores")) for (const k of ["valorMaterial", "valorMaoObra"]) o[k] = existing ? existing[k] : 0;
  if (!testPerm(udb, u, "campos_gestao")) for (const k of CAMPOS_GESTAO) if (!["status", "mesFaturamento"].includes(k)) o[k] = existing ? existing[k] : "";
  return o;
}

// ------------------------------------------------------------- senhas e sessões
const b64enc = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const b64dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(senha: string, saltB64: string, iter: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64dec(saltB64), iterations: iter }, key, 256);
  return b64enc(new Uint8Array(bits));
}
function testSenhaForte(s: string) {
  if (s.length < 8) throw bad("A senha precisa ter pelo menos 8 caracteres.");
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw bad("A senha precisa ter letras e números.");
}
async function setSenha(u: Usuario, senha: string) {
  testSenhaForte(senha);
  const s = new Uint8Array(16); crypto.getRandomValues(s);
  u.salt = b64enc(s); u.iter = 100000; u.hash = await pbkdf2(senha, u.salt, u.iter);
}
async function testSenha(u: Usuario, senha: string) {
  if (!u.hash) return false;
  const h = await pbkdf2(senha, u.salt, u.iter || 100000);
  const a = b64dec(h), b = b64dec(u.hash);
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function sha256hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function lerCookie(req: Request, nome: string) {
  const c = req.headers.get("cookie") || "";
  for (const p of c.split(";")) { const i = p.indexOf("="); if (i > 0 && p.slice(0, i).trim() === nome) return decodeURIComponent(p.slice(i + 1).trim()); }
  return "";
}
function ipCliente(req: Request) { return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?"; }
function cleanLogin(s: unknown) {
  const v = str(s).trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,40}$/.test(v)) throw bad("Login inválido: use de 3 a 40 letras, números, ponto, hífen ou @, sem espaços.");
  return v;
}
function userPublic(udb: UDB, u: Usuario) {
  const p = getPerfil(udb, u.perfilId);
  return { id: u.id, nome: u.nome, login: u.login, email: u.email, perfilId: u.perfilId, perfil: p ? p.nome : "(sem perfil)", ativo: u.ativo, trocarSenha: u.trocarSenha, criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso };
}
const countAdmins = (udb: UDB, ignorar = -1) => udb.usuarios.filter((x) => x.ativo && x.id !== ignorar && getPerms(udb, x).includes("gerenciar_usuarios")).length;

// ------------------------------------------------------------- banco
async function selectAll(table: string, cols: string, order?: string): Promise<any[]> {
  let out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (order) q = q.order(order);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return out;
}
const ok = <T>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data; };
async function loadUDB(): Promise<UDB> {
  const [p, u] = await Promise.all([selectAll("perfis", "id,dados,ordem", "ordem"), selectAll("usuarios", "id,dados", "id")]);
  return { perfis: p.map((r) => r.dados), usuarios: u.map((r) => r.dados) };
}
async function saveUser(u: Usuario) { ok(await sb.from("usuarios").upsert({ id: u.id, login: u.login, dados: u })); }
async function savePerfis(udb: UDB) { ok(await sb.from("perfis").upsert(udb.perfis.map((p, i) => ({ id: p.id, dados: p, ordem: i })))); }
async function loadData(): Promise<Dados> {
  const [c, cad] = await Promise.all([selectAll("chamados", "id,dados", "id"), selectAll("cadastros", "lista,itens")]);
  const cadastros: Record<string, string[]> = {};
  for (const d of CADASTRO_DEFS) cadastros[d.key] = [];
  for (const r of cad) cadastros[r.lista] = r.itens || [];
  return { chamados: c.map((r) => r.dados), cadastros };
}
async function putChamados(items: Item[]) {
  for (let i = 0; i < items.length; i += 500) ok(await sb.from("chamados").upsert(items.slice(i, i + 500).map((x) => ({ id: x.id, dados: x, atualizado: new Date().toISOString() }))));
}
async function delChamados(ids: number[]) { if (ids.length) ok(await sb.from("chamados").delete().in("id", ids)); }
async function putCadastros(cad: Record<string, string[]>) { ok(await sb.from("cadastros").upsert(Object.keys(cad).map((k) => ({ lista: k, itens: cad[k] })))); }
type Hist = { quando: string; id: number | null; numero: string; acao: string; detalhes: string; usuario?: string };
async function addHist(list: Hist[], usuario: string) {
  if (!list.length) return;
  for (let i = 0; i < list.length; i += 500) ok(await sb.from("historico").insert(list.slice(i, i + 500).map((h) => ({ quando: h.quando, chamado_id: h.id, numero: h.numero || "", acao: h.acao, detalhes: h.detalhes || "", usuario: h.usuario ?? usuario }))));
}
const hist = (it: Item | null, acao: string, detalhes: string): Hist => ({ quando: nowText(), id: it ? it.id : null, numero: it ? str(it.numero) : "", acao, detalhes });
async function marcarVersao(usuario: string) { ok(await sb.rpc("marcar_versao", { p_usuario: usuario })); }
async function getVersao() { const r = ok(await sb.from("estado").select("v").eq("k", "versao").maybeSingle()) as any; return r ? r.v : { n: 0 }; }

// backups: foto completa dos chamados e cadastros
async function criarBackup(tipo: string, data?: Dados) {
  const d = data || await loadData();
  const p = agora();
  const nome = `backup_${p.y}-${p.m}-${p.d}_${p.H}-${p.M}-${p.S}_${tipo}`;
  const dados = { chamados: d.chamados, cadastros: d.cadastros };
  const kb = Math.round(JSON.stringify(dados).length / 102.4) / 10;
  ok(await sb.from("backups").insert({ nome, tipo, dados, tamanho_kb: kb }));
  const auto = ok(await sb.from("backups").select("id").eq("tipo", "auto").order("criado", { ascending: false }).range(MAX_BACKUPS, MAX_BACKUPS + 500)) as any[];
  if (auto.length) ok(await sb.from("backups").delete().in("id", auto.map((x) => x.id)));
  return nome;
}
// uma cópia automática por dia, antes da primeira alteração
async function backupDiario(data: Dados) {
  const r = ok(await sb.from("backups").select("criado").eq("tipo", "auto").order("criado", { ascending: false }).limit(1)) as any[];
  if (!r.length || Date.now() - new Date(r[0].criado).getTime() > 20 * 3600 * 1000) await criarBackup("auto", data);
}

// ------------------------------------------------------------- importação
function findHeaderRow(rows: { row: number; cells: Record<number, unknown> }[]) {
  const lim = Math.min(20, rows.length);
  for (let i = 0; i < lim; i++) {
    const hm: Record<number, Col> = {};
    for (const k of Object.keys(rows[i].cells)) { const col = findColumn(rows[i].cells[+k]); if (col) hm[+k] = col; }
    if (Object.values(hm).some((c) => c.key === "numero") && Object.keys(hm).length >= 3) return { index: i, map: hm };
  }
  return null;
}
function convertImportRow(cells: Record<number, unknown>, hm: Record<number, Col>) {
  const r: Item = {};
  for (const k of Object.keys(hm)) {
    const col = hm[+k];
    if (col.key === "id") { r._id = convertCell("int", cells[+k]); continue; }
    if (col.kind === "calc" || col.key === "atualizadoEm" || col.key === "criadoPor") continue;
    let v = cells[+k];
    if (col.kind === "code" || col.kind === "text") v = convertCell(col.kind, v);
    else if (typeof v === "string") v = v.trim();
    r[col.key] = v;
  }
  return r;
}
type Imp = { aba: string; colunas: string[]; linhas: { linha: number; dados: Item }[] };
function readImportXlsx(bytes: Uint8Array): Imp {
  let wb: any;
  try { wb = XLSX.read(bytes, { type: "array" }); } catch { throw bad("Não consegui abrir o arquivo. Envie uma planilha .xlsx (no Excel: Salvar como > Pasta de Trabalho do Excel)."); }
  const nomes = wb.SheetNames;
  const pref = [...new Set(["CHAMADOS", "BASE", ...nomes.map((n) => n.toUpperCase())])];
  for (const nm of pref) {
    const real = nomes.find((n) => n.toUpperCase() === nm); if (!real) continue;
    const ws = wb.Sheets[real]; if (!ws || !ws["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const rows: { row: number; cells: Record<number, unknown> }[] = [];
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cells: Record<number, unknown> = {};
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]; if (!cell) continue;
        let v: unknown = cell.v;
        if (cell.t === "s" && typeof v === "string") v = v; else if (cell.t === "b") v = String(v);
        if (v !== null && v !== undefined && String(v) !== "") cells[C + 1] = v;
      }
      rows.push({ row: R + 1, cells });
    }
    const h = findHeaderRow(rows); if (!h) continue;
    const out: { linha: number; dados: Item }[] = [];
    for (let i = h.index + 1; i < rows.length; i++) out.push({ linha: rows[i].row, dados: convertImportRow(rows[i].cells, h.map) });
    return { aba: nm, colunas: Object.values(h.map).map((c) => c.header), linhas: out };
  }
  throw bad('Não encontrei uma aba com a coluna "Nº CHAMADO CPFL" e os demais títulos da planilha de chamados.');
}
function readImportCsv(linhas: any[]): Imp {
  if (!linhas.length) throw bad("O arquivo está vazio.");
  const headers = Object.keys(linhas[0]);
  const hm: Record<number, Col> = {};
  headers.forEach((h, i) => { const col = findColumn(h); if (col) hm[i + 1] = col; });
  if (!Object.values(hm).some((c) => c.key === "numero")) throw bad('O arquivo precisa ter a coluna "Nº CHAMADO CPFL".');
  const out = linhas.map((l, n) => { const cells: Record<number, unknown> = {}; headers.forEach((h, i) => { const v = str(l[h]); if (v !== "") cells[i + 1] = v; }); return { linha: n + 2, dados: convertImportRow(cells, hm) }; });
  return { aba: "CSV", colunas: Object.values(hm).map((c) => c.header), linhas: out };
}
const isEmptyVal = (v: unknown) => v === null || v === undefined || str(v).trim() === "";
// chave de cada linha da planilha (para achar linhas repetidas dentro do próprio arquivo).
// Nº só com números = número único do portal CPFL. Demais ("Patrimonial", "IE_2026_...") podem se repetir:
// a linha é identificada por Nº + unidade + empresa + data do chamado + OS + chamado do fornecedor.
const up = (v: unknown) => str(v).trim().toUpperCase();
const baseKey = (d: Item) => [up(d.numero), up(d.unidade), up(d.empresa), str(parseDateIso(d.dataChamado))].join("|");
function importKey(d: Item) {
  if (d._id) return `id:${d._id}`;
  const num = str(d.numero).trim();
  if (testNumeroPortal(num)) return `num:${num}`;
  return "txt:" + [baseKey(d), up(d.osFornecedor), up(d.chamadoFornecedor)].join("|");
}
// liga cada linha da planilha a um chamado já gravado (ou a nenhum = chamado novo).
// 1ª passada: ligações certas (ID SISTEMA, Nº do portal, ou mesma OS / chamado do fornecedor).
// 2ª passada: linhas restantes com os chamados restantes de mesmo Nº, unidade, empresa e data (pela observação; senão, pela ordem).
function matchImport(data: Dados, rows: { linha: number; dados: Item }[]) {
  const res = new Map<number, { item: Item | null; porId?: boolean }>();
  const usados = new Set<number>();
  const porBase = new Map<string, Item[]>();
  for (const c of data.chamados) { const k = baseKey(c); if (!porBase.has(k)) porBase.set(k, []); porBase.get(k)!.push(c); }
  const livres = (d: Item) => (porBase.get(baseKey(d)) || []).filter((c) => !usados.has(c.id)).sort((x, y) => x.id - y.id);
  const resto: { linha: number; dados: Item }[] = [];
  for (const r of rows) {
    const d = r.dados;
    if (d._id) { const x = data.chamados.find((c) => c.id === Number(d._id)); if (x && !usados.has(x.id)) { usados.add(x.id); res.set(r.linha, { item: x, porId: true }); continue; } }
    const num = str(d.numero).trim();
    if (testNumeroPortal(num)) { const x = data.chamados.find((c) => str(c.numero) === num) || null; if (x) usados.add(x.id); res.set(r.linha, { item: x }); continue; }
    let achou: Item | null = null;
    for (const k of ["osFornecedor", "chamadoFornecedor"]) {
      const v = up(d[k]); if (!v) continue;
      const m = livres(d).filter((c) => up(c[k]) === v);
      if (m.length === 1) { achou = m[0]; break; }
    }
    if (achou) { usados.add(achou.id); res.set(r.linha, { item: achou }); } else resto.push(r);
  }
  for (const r of resto) {
    const c = livres(r.dados);
    const obs = up(r.dados.observacao);
    const m = obs ? c.filter((x) => up(x.observacao) === obs) : [];
    const x = m.length === 1 ? m[0] : (c[0] || null);
    if (x) usados.add(x.id);
    res.set(r.linha, { item: x });
  }
  return res;
}
function planImport(data: Dados, imp: Imp, apagarVazios: boolean, usuarioAtual: string) {
  const novos: Item[] = [], atual: { old: Item; nw: Item; mudancas: string }[] = [], erros: any[] = [], avisos: string[] = [];
  let iguais = 0;
  const ult: Record<string, number> = {};
  for (const r of imp.linhas) ult[importKey(r.dados)] = r.linha;
  let maxId = data.chamados.reduce((m, x) => Math.max(m, x.id), 0);
  const base: Dados = { chamados: [...data.chamados], cadastros: data.cadastros };
  const validas: { linha: number; dados: Item }[] = [];
  for (const r of imp.linhas) {
    const d = r.dados;
    if (Object.keys(d).every((k) => k === "_id" || isEmptyVal(d[k]))) continue;
    const num = str(d.numero);
    if (!num) { erros.push({ linha: r.linha, numero: "", erro: 'Linha sem Nº do chamado (use o número do portal CPFL ou "Patrimonial").' }); continue; }
    const key = importKey(d);
    if (ult[key] !== r.linha) { avisos.push(`O chamado da linha ${r.linha} (Nº ${num}) aparece de novo na linha ${ult[key]} com os mesmos dados de identificação; foi usada a linha ${ult[key]}.`); continue; }
    validas.push(r);
  }
  const ligacao = matchImport(data, validas);
  for (const r of validas) {
    const d = r.dados, num = str(d.numero);
    const achado = ligacao.get(r.linha) || { item: null };
    const old = achado.item || null;
    const body: Item = old ? { ...old } : {};
    for (const k of Object.keys(d)) {
      if (k === "_id") continue;
      if (isEmptyVal(d[k]) && !apagarVazios) continue;
      if (old && k === "numero" && !achado.porId) continue;
      body[k] = d[k];
    }
    let nw: Item; const av: string[] = [];
    try { nw = buildItem(body, old, base, usuarioAtual, av); } catch (e) { erros.push({ linha: r.linha, numero: num, erro: (e as Error).message }); continue; }
    for (const a of av) avisos.push(`Linha ${r.linha} (Nº ${num}, ${str(nw.unidade)}): ${a}`);
    if (old) { const chg = describeChanges(old, nw); if (chg) { nw.id = old.id; atual.push({ old, nw, mudancas: chg }); } else iguais++; }
    else { maxId++; nw.id = maxId; novos.push(nw); base.chamados.push(nw); }
  }
  return { novos, atualizados: atual, iguais, erros, avisos };
}

// ------------------------------------------------------------- Excel (download)
function planilhaExportacao(items: Item[], filtros: string[], tela: string, usuario: string) {
  const temValor = (c: Col, v: unknown) => v !== null && v !== undefined && ((c.kind === "money" || c.key === "valorTotal") ? Number(v) !== 0 : str(v).trim() !== "");
  let cols = COLUMNS.filter((c) => items.some((it) => temValor(c, it[c.key])));
  if (!cols.length) cols = COLUMNS.filter((c) => ["numero", "unidade", "empresa", "dataChamado"].includes(c.key));
  const toSerial = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return (Date.UTC(y, m - 1, dd) - Date.UTC(1899, 11, 30)) / 86400000; };
  const aoa: unknown[][] = [cols.map((c) => c.header)];
  for (const it of items) aoa.push(cols.map((c) => {
    const v = it[c.key];
    if (c.kind === "money" || c.key === "valorTotal") return v === null || v === undefined ? null : Number(v);
    if (c.kind === "date") return v ? toSerial(v) : null;
    if (c.key === "mesFaturamento") return v ? toSerial(v + "-01") : null;
    if (c.kind === "code") return /^\d{1,15}$/.test(str(v)) ? Number(v) : str(v);
    if (c.kind === "int") return v === null || v === undefined ? null : Number(v);
    return str(v);
  }));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map((c) => ({ wch: c.width + 2 }));
  ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(cols.length - 1)}${Math.max(2, items.length + 1)}` };
  for (let r = 1; r <= items.length; r++) cols.forEach((c, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r, c: i })]; if (!cell || cell.t !== "n") return;
    if (c.kind === "date") cell.z = "dd/mm/yyyy"; else if (c.key === "mesFaturamento") cell.z = "mm/yyyy"; else if (c.kind === "money" || c.key === "valorTotal") cell.z = '"R$" #,##0.00';
  });
  const total = round2(items.reduce((s, x) => s + (Number(x.valorTotal) || 0), 0));
  const f = [["Segurança Empresarial - chamados exportados do sistema"], [`Gerado em ${nowText()} por ${usuario}. Cópia para consulta: alterações aqui não voltam para o sistema.`], [], ["Tela", tela], ["Chamados", items.length],
    ["Valor total", cols.some((c) => c.key === "valorTotal") ? total : "—"], [], ["Filtros aplicados"], ...(filtros.length ? filtros : ["Nenhum filtro (todos os chamados)"]).map((x) => [x])];
  const ws2 = XLSX.utils.aoa_to_sheet(f); ws2["!cols"] = [{ wch: 60 }, { wch: 40 }];
  if (ws2["B6"] && ws2["B6"].t === "n") ws2["B6"].z = '"R$" #,##0.00';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CHAMADOS"); XLSX.utils.book_append_sheet(wb, ws2, "FILTROS");
  return { bytes: XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer, colunas: cols.length };
}

// ------------------------------------------------------------- HTTP
type Ctx = { cookies: string[] };
function json(status: number, obj: unknown, ctx: Ctx) {
  const h = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  for (const c of ctx.cookies) h.append("Set-Cookie", c);
  return new Response(JSON.stringify(obj ?? null), { status, headers: h });
}
async function readBody(req: Request): Promise<any> { const t = await req.text(); if (!t.trim()) return {}; try { return JSON.parse(t); } catch { throw bad("Dados inválidos."); } }
const linkInfo = () => ({ ativo: true, link: SITE, erro: "", fixo: true, desde: "sempre (nuvem)" });

async function novaSessao(ctx: Ctx, u: Usuario) {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  const tok = b64enc(b).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  ok(await sb.from("sessoes").insert({ h: await sha256hex(tok), user_id: u.id, ultimo: new Date().toISOString() }));
  ctx.cookies.push(`${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 3600}`);
  u.ultimoAcesso = nowText(); await saveUser(u);
}
async function fecharSessoesDoUsuario(id: number, excetoTok = "") {
  const ex = excetoTok ? await sha256hex(excetoTok) : "";
  let q = sb.from("sessoes").delete().eq("user_id", id); if (ex) q = q.neq("h", ex);
  ok(await q);
}
async function usuarioDaSessao(req: Request, udb: UDB): Promise<Usuario | null> {
  const tok = lerCookie(req, COOKIE); if (!tok) return null;
  const h = await sha256hex(tok);
  const s = ok(await sb.from("sessoes").select("user_id,ultimo").eq("h", h).maybeSingle()) as any;
  if (!s) return null;
  const idade = Date.now() - new Date(s.ultimo).getTime();
  if (idade > SESSAO_HORAS * 3600 * 1000) { await sb.from("sessoes").delete().eq("h", h); return null; }
  const u = udb.usuarios.find((x) => x.id === s.user_id);
  if (!u || !u.ativo) { await sb.from("sessoes").delete().eq("h", h); return null; }
  if (idade > 5 * 60 * 1000) await sb.from("sessoes").update({ ultimo: new Date().toISOString() }).eq("h", h);
  return u;
}
async function falha(chave: string) {
  const f = ok(await sb.from("falhas_login").select("n,quando").eq("chave", chave).maybeSingle()) as any;
  return f ? { n: f.n as number, min: (Date.now() - new Date(f.quando).getTime()) / 60000 } : null;
}
async function registrarFalha(chave: string, janelaMin: number) {
  const f = await falha(chave);
  const n = f && f.min < janelaMin ? f.n + 1 : 1;
  ok(await sb.from("falhas_login").upsert({ chave, n, quando: new Date().toISOString() }));
}

function payload(udb: UDB, data: Dados, u: Usuario) {
  const hoje = todayIso();
  const todos = testPerm(udb, u, "ver_chamados");
  const list = data.chamados.map((it) => completeItem({ ...it }, hoje)).filter((x) => todos || ehDono(x, u)).map((x) => hideCampos(udb, x, u));
  return { chamados: list, cadastros: data.cadastros, statusChamado: STATUS_CHAMADO, arquivo: "", pasta: "", hoje, nuvem: true };
}

async function rotear(req: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  let path = url.pathname; const ix = path.indexOf("/api"); path = (ix >= 0 ? path.slice(ix) : path).replace(/\/+$/, "");
  const method = req.method.toUpperCase();
  // só aceita alterações vindas da própria página do sistema
  if (method !== "GET") { const o = req.headers.get("origin"); if (o && o !== SITE && !ORIGEM_OK.test(o)) throw proibido("Origem não permitida."); }

  const udb = await loadUDB();
  const u = await usuarioDaSessao(req, udb);
  const usuarioAtual = u ? `${u.nome} (${u.login})` : "";

  // ---------------- entrada
  if (path === "/api/sessao" && method === "GET") {
    if (!u) return json(200, { logado: false, primeiroAcesso: udb.usuarios.length === 0, local: false, nuvem: true }, ctx);
    return json(200, { logado: true, usuario: userPublic(udb, u), permissoes: getPerms(udb, u), local: false, nuvem: true, versaoPerms: VERSAO_PERFIS }, ctx);
  }
  if (path === "/api/primeiro-acesso" && method === "POST") throw proibido("O administrador do sistema já está configurado.");
  if (path === "/api/login" && method === "POST") {
    const b = await readBody(req);
    const login = str(b.login).trim().toLowerCase();
    const ip = ipCliente(req);
    const fi = await falha("ip:" + ip);
    if (fi && fi.n >= 20 && fi.min < 15) throw bad("Muitas tentativas erradas a partir deste endereço. Aguarde 15 minutos.");
    const f = await falha("u:" + login);
    if (f && f.n >= 5 && f.min < 5) throw bad("Muitas tentativas erradas. Aguarde 5 minutos e tente novamente.");
    const cand = udb.usuarios.find((x) => x.login === login);
    if (!cand || !(await testSenha(cand, str(b.senha)))) {
      await registrarFalha("u:" + login, 5); await registrarFalha("ip:" + ip, 15);
      await new Promise((r) => setTimeout(r, 400));
      throw bad("Login ou senha incorretos.");
    }
    if (!cand.ativo) throw bad("Usuário desativado. Procure o administrador.");
    await sb.from("falhas_login").delete().eq("chave", "u:" + login);
    await novaSessao(ctx, cand);
    return json(200, { ok: true }, ctx);
  }
  if (path === "/api/logout" && method === "POST") {
    const tok = lerCookie(req, COOKIE); if (tok) await sb.from("sessoes").delete().eq("h", await sha256hex(tok));
    ctx.cookies.push(`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return json(200, { ok: true }, ctx);
  }
  if (!u) return json(401, { erro: "Sessão expirada. Entre novamente.", login: true }, ctx);
  if (path === "/api/minha-senha" && method === "POST") {
    const b = await readBody(req);
    if (!(await testSenha(u, str(b.atual)))) throw bad("A senha atual está incorreta.");
    if (str(b.atual) === str(b.nova)) throw bad("A nova senha deve ser diferente da atual.");
    await setSenha(u, str(b.nova)); u.trocarSenha = false; await saveUser(u);
    await fecharSessoesDoUsuario(u.id, lerCookie(req, COOKIE));
    return json(200, { ok: true }, ctx);
  }
  if (u.trocarSenha) return json(403, { erro: "Troque sua senha provisória para continuar.", trocarSenha: true }, ctx);

  // ---------------- usuários e perfis
  if (path.startsWith("/api/usuarios") || path.startsWith("/api/perfis")) {
    requirePerm(udb, u, ["gerenciar_usuarios"]);
    if (path === "/api/usuarios" && method === "GET")
      return json(200, { usuarios: udb.usuarios.map((x) => userPublic(udb, x)), perfis: udb.perfis, catalogo: PERMISSOES, rede: { ativa: false, links: [], porta: 0, publico: linkInfo(), nuvem: true } }, ctx);
    if (path === "/api/usuarios" && method === "POST") {
      const b = await readBody(req);
      const login = cleanLogin(b.login);
      if (udb.usuarios.some((x) => x.login === login)) throw bad(`Já existe um usuário com o login '${login}'.`);
      const nome = clean(b.nome, 120); if (!nome) throw bad("Informe o nome.");
      if (!getPerfil(udb, str(b.perfilId))) throw bad("Escolha um perfil.");
      const nu: Usuario = { id: udb.usuarios.reduce((m, x) => Math.max(m, x.id), 0) + 1, nome, login, email: clean(b.email, 150), perfilId: str(b.perfilId), ativo: true, salt: "", hash: "", iter: 0, trocarSenha: true, criadoEm: nowText(), ultimoAcesso: "" };
      await setSenha(nu, str(b.senha)); await saveUser(nu);
      return json(201, userPublic(udb, nu), ctx);
    }
    let m = path.match(/^\/api\/usuarios\/(\d+)(\/senha)?$/);
    if (m) {
      const alvo = udb.usuarios.find((x) => x.id === Number(m![1])); if (!alvo) throw bad("Usuário não encontrado.");
      if (m[2] && method === "POST") {
        const b = await readBody(req);
        const proprio = alvo.id === u.id;
        const provisoria = proprio ? false : (b.provisoria !== undefined && b.provisoria !== null ? !!b.provisoria : true);
        await setSenha(alvo, str(b.senha)); alvo.trocarSenha = provisoria; await saveUser(alvo);
        await sb.from("falhas_login").delete().eq("chave", "u:" + alvo.login);
        await fecharSessoesDoUsuario(alvo.id, proprio ? lerCookie(req, COOKIE) : "");
        return json(200, { ok: true, provisoria }, ctx);
      }
      if (method === "PUT") {
        const b = await readBody(req);
        const nome = clean(b.nome, 120); if (!nome) throw bad("Informe o nome.");
        const perfilId = str(b.perfilId); if (!getPerfil(udb, perfilId)) throw bad("Escolha um perfil.");
        const ativo = !!b.ativo;
        if (alvo.id === u.id && !ativo) throw bad("Você não pode desativar o seu próprio usuário.");
        const ant = { perfilId: alvo.perfilId, ativo: alvo.ativo };
        Object.assign(alvo, { nome, email: clean(b.email, 150), perfilId, ativo });
        if (countAdmins(udb) === 0) { Object.assign(alvo, ant); throw bad("É preciso manter pelo menos um usuário ativo com acesso a Usuários e perfis."); }
        if (!ativo) await fecharSessoesDoUsuario(alvo.id);
        await saveUser(alvo);
        return json(200, userPublic(udb, alvo), ctx);
      }
      if (method === "DELETE") {
        if (alvo.id === u.id) throw bad("Você não pode excluir o seu próprio usuário.");
        if (countAdmins(udb, alvo.id) === 0) throw bad("É preciso manter pelo menos um usuário ativo com acesso a Usuários e perfis.");
        ok(await sb.from("usuarios").delete().eq("id", alvo.id)); await fecharSessoesDoUsuario(alvo.id);
        return json(200, { ok: true }, ctx);
      }
    }
    if (path === "/api/perfis" && method === "POST") {
      const b = await readBody(req);
      const nome = clean(b.nome, 60); if (!nome) throw bad("Informe o nome do perfil.");
      if (udb.perfis.some((p) => p.nome.toUpperCase() === nome.toUpperCase())) throw bad(`Já existe um perfil chamado '${nome}'.`);
      const np: Perfil = { id: "p" + crypto.randomUUID().replace(/-/g, "").slice(0, 8), nome, sistema: false, descricao: clean(b.descricao, 200), permissoes: (b.permissoes || []).filter((x: string) => TODAS.includes(x)) };
      udb.perfis.push(np); await savePerfis(udb);
      return json(201, np, ctx);
    }
    m = path.match(/^\/api\/perfis\/([\w-]+)$/);
    if (m) {
      const p = getPerfil(udb, m[1]); if (!p) throw bad("Perfil não encontrado.");
      if (p.sistema) throw bad("O perfil Administrador não pode ser alterado nem excluído.");
      if (method === "PUT") {
        const b = await readBody(req);
        const nome = clean(b.nome, 60); if (!nome) throw bad("Informe o nome do perfil.");
        if (udb.perfis.some((x) => x.id !== p.id && x.nome.toUpperCase() === nome.toUpperCase())) throw bad(`Já existe um perfil chamado '${nome}'.`);
        const ant = [...p.permissoes];
        p.nome = nome; p.descricao = clean(b.descricao, 200); p.permissoes = (b.permissoes || []).filter((x: string) => TODAS.includes(x));
        if (countAdmins(udb) === 0) { p.permissoes = ant; throw bad("Essa mudança deixaria o sistema sem nenhum usuário capaz de administrar usuários."); }
        await savePerfis(udb);
        return json(200, p, ctx);
      }
      if (method === "DELETE") {
        const uso = udb.usuarios.filter((x) => x.perfilId === p.id).length;
        if (uso > 0) throw bad(`O perfil está em uso por ${uso} usuário(s). Mude o perfil deles antes de excluir.`);
        ok(await sb.from("perfis").delete().eq("id", p.id));
        return json(200, { ok: true }, ctx);
      }
    }
    return json(404, { erro: "Rota não encontrada." }, ctx);
  }

  // ---------------- dados
  if (method === "GET" && path === "/api/dados") {
    requirePerm(udb, u, ["ver_painel", "ver_relatorio", "ver_faturamento", "ver_chamados", "ver_proprios"]);
    const [data, v] = await Promise.all([loadData(), getVersao()]);
    return json(200, { ...payload(udb, data, u), versao: String(v.n ?? 0) }, ctx);
  }
  if (method === "GET" && path === "/api/versao") {
    const v = await getVersao();
    return json(200, { versao: String(v.n ?? 0), ultima: v.quando ? { quando: v.quando, usuario: v.usuario } : null }, ctx);
  }
  if (method === "GET" && path === "/api/link") { requirePerm(udb, u, ["gerenciar_usuarios"]); return json(200, linkInfo(), ctx); }

  if (path === "/api/chamados" && method === "POST") {
    requirePerm(udb, u, ["criar_chamado"]);
    const data = await loadData();
    const item = buildItem(protectBody(udb, await readBody(req), null, u), null, data, usuarioAtual);
    await backupDiario(data);
    // próximo ID livre (tenta de novo se outra pessoa gravou no mesmo instante)
    for (let t = 0; ; t++) {
      item.id = ok(await sb.rpc("proximo_id_chamado")) as number;
      const r = await sb.from("chamados").insert({ id: item.id, dados: item });
      if (!r.error) break;
      if (t >= 4) throw new Error(r.error.message);
    }
    data.chamados.push(item);
    if (ensureCadastros(data)) await putCadastros(data.cadastros);
    await addHist([hist(item, "Criado", `Unidade: ${item.unidade} | Empresa: ${item.empresa} | Total: ${fmtN2(item.valorTotal)}`)], usuarioAtual);
    await marcarVersao(usuarioAtual);
    return json(201, hideCampos(udb, item, u), ctx);
  }
  let mm = path.match(/^\/api\/chamados\/(\d+)$/);
  if (mm) {
    const id = Number(mm[1]);
    const data = await loadData();
    const existing = data.chamados.find((x) => x.id === id);
    if (!existing) throw bad("Chamado não encontrado (pode ter sido excluído). Atualize a tela.");
    completeItem(existing, todayIso());
    if (method === "PUT") {
      requirePerm(udb, u, ["editar_chamado", "editar_proprios", "concluir_chamado"]);
      const dono = ehDono(existing, u);
      const podeEditar = testPerm(udb, u, "editar_chamado") || (testPerm(udb, u, "editar_proprios") && dono);
      if (!podeEditar && !(testPerm(udb, u, "concluir_chamado") && (testPerm(udb, u, "ver_chamados") || dono)))
        throw proibido(testPerm(udb, u, "editar_proprios") ? "Você só pode editar os chamados que você mesmo cadastrou." : "Seu perfil não permite editar chamados.");
      const body = await readBody(req);
      const baseV = str(getProp(body, "atualizadoEm"));
      if (baseV && baseV !== str(existing.atualizadoEm)) {
        const q = ok(await sb.from("historico").select("usuario").eq("chamado_id", id).order("seq", { ascending: false }).limit(1)) as any[];
        const por = q.length && q[0].usuario ? ` por ${q[0].usuario}` : "";
        throw conflito(`O chamado ${existing.numero} foi alterado${por} enquanto você editava (às ${existing.atualizadoEm}). Feche a janela, confira os dados atualizados e faça a sua alteração de novo.`);
      }
      const item = buildItem(protectBody(udb, body, existing, u), existing, data, usuarioAtual);
      const chg = describeChanges(existing, item);
      if (!podeEditar && chg) {
        const outros = chg.split(" | ").filter((x) => !x.startsWith("DATA REAL DE CONCLUSÃO:"));
        const msg = testPerm(udb, u, "editar_proprios") ? `Você só pode editar os chamados que você mesmo cadastrou (este foi cadastrado por ${existing.criadoPor || "outra pessoa"}).` : "Seu perfil só permite concluir chamados (alterar a data real de conclusão).";
        if (outros.length || !testPerm(udb, u, "concluir_chamado")) throw proibido(msg);
      }
      await backupDiario(data);
      await putChamados([item]);
      data.chamados[data.chamados.indexOf(existing)] = item;
      if (ensureCadastros(data)) await putCadastros(data.cadastros);
      if (chg) await addHist([hist(item, "Alterado", chg)], usuarioAtual);
      await marcarVersao(usuarioAtual);
      return json(200, hideCampos(udb, item, u), ctx);
    }
    if (method === "DELETE") {
      requirePerm(udb, u, ["excluir_chamado"]);
      await backupDiario(data);
      await delChamados([id]);
      await addHist([hist(existing, "Excluído", `Unidade: ${existing.unidade} | Empresa: ${existing.empresa} | Total: ${fmtN2(existing.valorTotal)}`)], usuarioAtual);
      await marcarVersao(usuarioAtual);
      return json(200, { ok: true }, ctx);
    }
  }
  if (path === "/api/lote" && method === "POST") {
    const b = await readBody(req);
    const campo = str(b.campo); const ids = (b.ids || []).map(Number);
    requirePerm(udb, u, ["alterar_lote"]);
    if (campo === "excluir") requirePerm(udb, u, ["excluir_chamado"]);
    const data = await loadData();
    if (campo === "excluir") {
      const alvo = data.chamados.filter((x) => ids.includes(x.id));
      await backupDiario(data);
      await delChamados(alvo.map((x) => x.id));
      await addHist(alvo.map((it) => hist(it, "Excluído (lote)", `Unidade: ${it.unidade} | Empresa: ${it.empresa}`)), usuarioAtual);
      if (alvo.length) await marcarVersao(usuarioAtual);
      return json(200, { ok: true, alterados: alvo.length }, ctx);
    }
    if (!BULK_FIELDS.includes(campo)) throw bad("Campo inválido para alteração em lote.");
    if (!ids.length) throw bad("Selecione ao menos um chamado.");
    const mud: Item[] = [], hs: Hist[] = [];
    for (const id of ids) {
      const old = data.chamados.find((x) => x.id === id); if (!old) continue;
      completeItem(old, todayIso());
      const body = { ...old, [campo]: b.valor };
      let nw: Item; try { nw = buildItem(body, old, data, usuarioAtual); } catch (e) { throw bad(`Chamado ${old.numero}: ${(e as Error).message}`); }
      const chg = describeChanges(old, nw);
      if (chg) { data.chamados[data.chamados.indexOf(old)] = nw; mud.push(nw); hs.push(hist(nw, "Alterado (lote)", chg)); }
    }
    if (mud.length) {
      await backupDiario(data); await putChamados(mud);
      if (ensureCadastros(data)) await putCadastros(data.cadastros);
      await addHist(hs, usuarioAtual); await marcarVersao(usuarioAtual);
    }
    return json(200, { ok: true, alterados: mud.length }, ctx);
  }
  if (path === "/api/cadastros" && method === "PUT") {
    requirePerm(udb, u, ["gerenciar_cadastros"]);
    const b = await readBody(req);
    const data = await loadData();
    const lista = str(b.lista);
    const def = CADASTRO_DEFS.find((d) => d.key === lista); if (!def) throw bad("Cadastro inválido.");
    let cur = [...(data.cadastros[lista] || [])];
    const valor = clean(b.valor, 200), novo = clean(b.novo, 200);
    let afetados = 0, adicionados = 0, ignorados = 0;
    const mud: Item[] = []; const hs: Hist[] = [];
    switch (str(b.acao)) {
      case "adicionar-varios": {
        const colados = (b.itens || []).map((x: unknown) => clean(x, 200)).filter((x: string) => x);
        if (!colados.length && !b.ordenarTudo) throw bad("Nenhum item informado.");
        if (colados.length > 5000) throw bad("Máximo de 5.000 itens por vez.");
        const ja = new Set(cur.map((v) => v.toUpperCase()));
        for (const v of colados) { const k = v.toUpperCase(); if (ja.has(k)) { ignorados++; continue; } ja.add(k); cur.push(v); adicionados++; }
        if (b.ordenarTudo) cur.sort((a, c) => a.localeCompare(c, "pt-BR", { sensitivity: "base" }));
        if (!adicionados && !b.ordenarTudo) return json(200, { ok: true, adicionados: 0, ignorados }, ctx);
        hs.push(hist(null, "Cadastro em lote", `${def.header}: ${adicionados} item(ns) adicionado(s), ${ignorados} já existiam ou estavam repetidos`));
        break;
      }
      case "adicionar":
        if (!valor) throw bad("Digite o nome.");
        if (cur.some((x) => x.toUpperCase() === valor.toUpperCase())) throw bad(`'${valor}' já está cadastrado.`);
        cur.push(valor); break;
      case "renomear": {
        if (!novo) throw bad("Digite o novo nome.");
        const idx = cur.indexOf(valor); if (idx < 0) throw bad("Item não encontrado.");
        if (novo !== valor && cur.some((x) => x.toUpperCase() === novo.toUpperCase() && x !== valor)) throw bad(`'${novo}' já está cadastrado.`);
        cur[idx] = novo;
        for (const it of data.chamados) if (str(it[def.campo]) === valor) { it[def.campo] = novo; it.atualizadoEm = nowSec(); mud.push(it); afetados++; }
        if (afetados) hs.push(hist(null, "Cadastro renomeado", `${def.header}: ${valor} -> ${novo} (${afetados} chamados atualizados)`));
        break;
      }
      case "remover": {
        const uso = data.chamados.filter((x) => str(x[def.campo]) === valor).length;
        if (uso) throw bad(`'${valor}' está em uso em ${uso} chamado(s). Renomeie-o ou altere esses chamados antes de remover.`);
        cur = cur.filter((x) => x !== valor); break;
      }
      case "ordenar": {
        const nova = (b.itens || []).map(String);
        if (nova.length !== cur.length || nova.some((x: string) => !cur.includes(x))) throw bad("Lista inválida.");
        cur = nova; break;
      }
      default: throw bad("Ação inválida.");
    }
    data.cadastros[lista] = cur;
    if (mud.length) { await backupDiario(data); await putChamados(mud); }
    await putCadastros(data.cadastros);
    await addHist(hs, usuarioAtual); await marcarVersao(usuarioAtual);
    return json(200, { ok: true, afetados, adicionados, ignorados }, ctx);
  }
  if (path === "/api/importar/previa" && method === "POST") {
    requirePerm(udb, u, ["importar"]);
    const b = await readBody(req);
    const nome = clean(b.nome, 200);
    let imp: Imp;
    if (b.base64) { let bytes: Uint8Array; try { bytes = b64dec(str(b.base64)); } catch { throw bad("Arquivo corrompido no envio. Tente novamente."); } imp = readImportXlsx(bytes); }
    else if (b.linhas) imp = readImportCsv(b.linhas);
    else throw bad("Nenhum arquivo recebido.");
    const apagar = !!b.apagarVazios;
    const plan = planImport(await loadData(), imp, apagar, usuarioAtual);
    const token = crypto.randomUUID().replace(/-/g, "");
    await sb.from("importacoes").delete().lt("quando", new Date(Date.now() - 2 * 3600 * 1000).toISOString());
    ok(await sb.from("importacoes").insert({ token, dados: { imp, nome, apagar } }));
    return json(200, {
      token, arquivo: nome, aba: imp.aba, colunas: COLUMNS.filter((c) => imp.colunas.includes(c.header)).map((c) => c.header), linhasLidas: imp.linhas.length,
      novos: plan.novos.map((x) => ({ numero: x.numero, unidade: x.unidade, empresa: x.empresa, dataChamado: x.dataChamado, valorTotal: x.valorTotal, status: x.status })),
      atualizados: plan.atualizados.map((x) => ({ numero: x.nw.numero, unidade: x.nw.unidade, mudancas: x.mudancas })),
      iguais: plan.iguais, erros: plan.erros, avisos: plan.avisos,
    }, ctx);
  }
  if (path === "/api/importar/aplicar" && method === "POST") {
    requirePerm(udb, u, ["importar"]);
    const b = await readBody(req);
    const r = ok(await sb.from("importacoes").select("dados").eq("token", str(b.token)).maybeSingle()) as any;
    if (!r) throw bad("A prévia expirou. Selecione o arquivo novamente.");
    const info = r.dados;
    const data = await loadData();
    const plan = planImport(data, info.imp, info.apagar, usuarioAtual);   // recalcula sobre os dados atuais
    const nn = plan.novos.length, na = plan.atualizados.length;
    if (nn + na > 0) {
      await criarBackup("antes-da-importacao", data);
      await putChamados([...plan.atualizados.map((x) => x.nw), ...plan.novos]);
      for (const x of plan.atualizados) data.chamados[data.chamados.indexOf(x.old)] = x.nw;
      data.chamados.push(...plan.novos);
      if (ensureCadastros(data)) await putCadastros(data.cadastros);
      await addHist([
        ...plan.atualizados.map((x) => hist(x.nw, "Atualizado (importação)", x.mudancas)),
        ...plan.novos.map((n) => hist(n, "Criado (importação)", `Unidade: ${n.unidade} | Empresa: ${n.empresa} | Total: ${fmtN2(n.valorTotal)}`)),
        hist(null, "Importação de planilha", `Arquivo: ${info.nome} | ${nn} novo(s), ${na} atualizado(s), ${plan.iguais} sem alteração, ${plan.erros.length} com erro (não importados)`),
      ], usuarioAtual);
      await marcarVersao(usuarioAtual);
    }
    await sb.from("importacoes").delete().eq("token", str(b.token));
    return json(200, { ok: true, novos: nn, atualizados: na, iguais: plan.iguais, erros: plan.erros.length }, ctx);
  }
  if (path === "/api/historico" && method === "GET") {
    const id = url.searchParams.get("id") || "";
    const porId = /^\d+$/.test(id);
    requirePerm(udb, u, porId ? ["ver_historico", "ver_chamados", "ver_proprios"] : ["ver_historico"]);
    let rows: any[];
    if (porId) {
      if (!testPerm(udb, u, "ver_historico") && !testPerm(udb, u, "ver_chamados")) {
        const a = ok(await sb.from("chamados").select("dados").eq("id", Number(id)).maybeSingle()) as any;
        if (!a || !ehDono(a.dados, u)) return json(200, [], ctx);
      }
      rows = ok(await sb.from("historico").select("quando,chamado_id,numero,acao,detalhes,usuario").eq("chamado_id", Number(id)).order("seq", { ascending: false }).limit(1000)) as any[];
    } else rows = ok(await sb.from("historico").select("quando,chamado_id,numero,acao,detalhes,usuario").order("seq", { ascending: false }).limit(1000)) as any[];
    const out = rows.map((h) => hideHistorico(udb, { quando: h.quando, id: h.chamado_id, numero: h.numero, acao: h.acao, detalhes: h.detalhes, usuario: h.usuario }, u)).filter((h) => h.detalhes || !str(h.acao).startsWith("Alterado"));
    return json(200, out, ctx);
  }
  if (path.startsWith("/api/backups")) {
    requirePerm(udb, u, ["gerenciar_backups"]);
    if (path === "/api/backups" && method === "GET") {
      const r = ok(await sb.from("backups").select("nome,criado,tamanho_kb").order("criado", { ascending: false }).limit(200)) as any[];
      return json(200, r.map((x) => ({ nome: x.nome, data: new Date(x.criado).toLocaleString("pt-BR", { timeZone: TZ }), tamanho: Number(x.tamanho_kb) })), ctx);
    }
    if (path === "/api/backups" && method === "POST") return json(200, { ok: true, nome: await criarBackup("manual") }, ctx);
    if (path === "/api/backups/restaurar" && method === "POST") {
      const b = await readBody(req);
      const bk = ok(await sb.from("backups").select("dados,nome").eq("nome", str(b.nome)).maybeSingle()) as any;
      if (!bk) throw bad("Backup não encontrado.");
      await criarBackup("antes-de-restaurar");
      ok(await sb.from("chamados").delete().gte("id", 0));
      await putChamados(bk.dados.chamados || []);
      await putCadastros(bk.dados.cadastros || {});
      await addHist([hist(null, "Backup restaurado", `Backup: ${bk.nome} | ${(bk.dados.chamados || []).length} chamado(s)`)], usuarioAtual);
      await marcarVersao(usuarioAtual);
      return json(200, { ok: true }, ctx);
    }
  }
  if (path === "/api/abrir-excel-filtrado" && method === "POST") {
    requirePerm(udb, u, ["abrir_excel", "exportar"]);
    const b = await readBody(req);
    const pl = payload(udb, await loadData(), u);
    const porId = new Map(pl.chamados.map((x: Item) => [x.id, x]));
    const sel = (b.ids || []).map(Number).map((i: number) => porId.get(i)).filter(Boolean) as Item[];
    if (!sel.length) throw bad("Nenhum chamado com os filtros atuais para abrir no Excel.");
    const filtros = (b.filtros || []).map((x: unknown) => clean(x, 300)).slice(0, 30);
    const { bytes } = planilhaExportacao(sel, filtros, clean(b.tela, 80), usuarioAtual);
    const p = agora();
    const nome = `Chamados filtrados ${p.y}-${p.m}-${p.d} ${p.H}-${p.M}.xlsx`;
    const h = new Headers({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="chamados.xlsx"; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "no-store" });
    return new Response(bytes, { status: 200, headers: h });
  }
  if (path.startsWith("/api/abrir-")) throw bad("Esta função era só do computador antigo. Use o botão Abrir no Excel para baixar a planilha.");
  return json(404, { erro: "Rota não encontrada." }, ctx);
}

Deno.serve(async (req: Request) => {
  const ctx: Ctx = { cookies: [] };
  try { return await rotear(req, ctx); }
  catch (e) {
    if (e instanceof Erro) return json(e.status, { erro: e.message, ...e.extra }, ctx);
    console.error(e);
    return json(500, { erro: "Erro no servidor: " + (e as Error).message }, ctx);
  }
});
