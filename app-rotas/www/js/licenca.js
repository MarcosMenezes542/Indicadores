// Licença por código de ativação preso ao aparelho.
//
// Como funciona:
//  1. O app calcula um "código do aparelho" a partir do identificador do celular.
//  2. O vendedor assina esse código com a chave PRIVADA (no gerador) e devolve
//     o "código de ativação".
//  3. O app confere a assinatura com a chave PÚBLICA. A assinatura só vale
//     para aquele código de aparelho, então copiar o app para outro celular
//     não adianta.

import { CONFIG } from './config.js';
import { plugin, ehNativo } from './nativo.js';

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Base32 Crockford
const CHAVE_ARMAZENADA = 'rota.ativacao';
const CHAVE_ID_LOCAL = 'rota.idAparelho';

export function base32(bytes) {
  let bits = 0, valor = 0, saida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function base32Decodificar(texto) {
  const bytes = [];
  let bits = 0, valor = 0;
  for (const c of texto) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) continue;
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** Deixa o texto só com caracteres válidos, tolerando confusões comuns (O/0, I/1, L/1). */
export function normalizarCodigo(texto) {
  return String(texto || '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '');
}

export function agrupar(texto, tamanho = 4) {
  return (texto.match(new RegExp(`.{1,${tamanho}}`, 'g')) || []).join('-');
}

function base64urlParaBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function obterIdAparelho() {
  if (ehNativo()) {
    try {
      const { identifier } = await plugin('Device').getId();
      if (identifier) return identifier;
    } catch (e) {
      console.warn('Device.getId falhou', e);
    }
  }
  let id = localStorage.getItem(CHAVE_ID_LOCAL);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
    localStorage.setItem(CHAVE_ID_LOCAL, id);
  }
  return id;
}

let codigoAparelhoCache = null;

/** Código curto (XXXX-XXXX-XXXX) que o cliente envia ao vendedor. */
export async function codigoDoAparelho() {
  if (codigoAparelhoCache) return codigoAparelhoCache;
  const id = await obterIdAparelho();
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ROTA|' + id)),
  );
  codigoAparelhoCache = agrupar(base32(hash).slice(0, 12));
  return codigoAparelhoCache;
}

// ------------------------------------------------------------------ códigos
//
// Formato 1 (antigo): só a assinatura (64 bytes). Vale como vitalício.
// Formato 2: cabeçalho (6 bytes) + assinatura (64 bytes).
//   cabeçalho = [versão=2, tipo, validade em minutos desde 1970 (4 bytes)]
//   validade 0 = sem prazo.
// O cabeçalho também é assinado: mexer no tipo ou na data invalida o código.

export const TIPOS = { 0: 'vitalicio', 1: 'teste', 2: 'mensal', 3: 'anual', 4: 'personalizado' };
export const NOMES_TIPO = {
  vitalicio: 'Vitalício', teste: 'Teste', mensal: 'Mensal', anual: 'Anual', personalizado: 'Personalizado',
};

/** Mensagem que é assinada: tem que ser idêntica no app e no gerador. */
export function mensagemParaAssinar(codigoAparelho, cabecalho = null) {
  const aparelho = normalizarCodigo(codigoAparelho);
  if (!cabecalho) return new TextEncoder().encode('ROTA-ATIVACAO|' + aparelho);
  const texto = new TextEncoder().encode('ROTA-ATIVACAO-V2|' + aparelho + '|');
  const msg = new Uint8Array(texto.length + cabecalho.length);
  msg.set(texto);
  msg.set(cabecalho, texto.length);
  return msg;
}

let chavePublicaCache = null;
function chavePublica() {
  if (!chavePublicaCache) {
    chavePublicaCache = crypto.subtle.importKey(
      'raw', base64urlParaBytes(CONFIG.chavePublica), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
  }
  return chavePublicaCache;
}

/**
 * Confere o código. Retorna null se for inválido para este aparelho, ou
 * { tipo, expira } (expira = data em milissegundos, ou null se não vence).
 */
export async function lerCodigo(codigoAtivacao, codigoAparelho) {
  const bytes = base32Decodificar(normalizarCodigo(codigoAtivacao));
  let cabecalho = null, assinatura;
  if (bytes.length === 64) assinatura = bytes;
  else if (bytes.length === 70 && bytes[0] === 2) {
    cabecalho = bytes.slice(0, 6);
    assinatura = bytes.slice(6);
  } else return null;
  try {
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, await chavePublica(), assinatura,
      mensagemParaAssinar(codigoAparelho, cabecalho),
    );
    if (!ok) return null;
  } catch (e) {
    console.warn('Falha ao verificar código', e);
    return null;
  }
  if (!cabecalho) return { tipo: 'vitalicio', expira: null };
  const minutos = new DataView(cabecalho.buffer, cabecalho.byteOffset).getUint32(2);
  return { tipo: TIPOS[cabecalho[1]] || 'personalizado', expira: minutos ? minutos * 60000 : null };
}

// ------------------------------------------------------------------ relógio
// Guarda o horário mais recente em que o app foi usado. Se o relógio do
// celular "voltar no tempo" (para esticar um teste), o app percebe.
const CHAVE_RELOGIO = 'rota.ultimaVez';
const TOLERANCIA = 15 * 60000;
const CHAVE_USADOS = 'rota.codigosUsados';

function relogioAlterado() {
  const ultima = Number(localStorage.getItem(CHAVE_RELOGIO) || 0);
  return Date.now() < ultima - TOLERANCIA;
}

export function registrarRelogio() {
  const ultima = Number(localStorage.getItem(CHAVE_RELOGIO) || 0);
  if (Date.now() > ultima) localStorage.setItem(CHAVE_RELOGIO, String(Date.now()));
}

// ------------------------------------------------------------------ licença

/**
 * Situação atual da licença:
 * { ativo, tipo, expira, vencido, relogioAlterado, temCodigo }
 */
export async function lerLicenca() {
  const salvo = localStorage.getItem(CHAVE_ARMAZENADA);
  const base = { ativo: false, tipo: null, expira: null, vencido: false, relogioAlterado: false, temCodigo: !!salvo };
  if (!salvo) return base;
  const dados = await lerCodigo(salvo, await codigoDoAparelho());
  if (!dados) return base;
  const lic = { ...base, ...dados };
  if (dados.expira) {
    lic.relogioAlterado = relogioAlterado();
    lic.vencido = Date.now() >= dados.expira;
    lic.ativo = !lic.vencido && !lic.relogioAlterado;
  } else {
    lic.ativo = true;
  }
  if (!lic.relogioAlterado) registrarRelogio();
  return lic;
}

/**
 * Tenta ativar com o código digitado.
 * Retorna { ok: true, licenca } ou { ok: false, motivo: 'invalido' | 'vencido' | 'relogio' }.
 */
export async function ativar(codigoAtivacao) {
  const codigo = normalizarCodigo(codigoAtivacao);
  const dados = await lerCodigo(codigo, await codigoDoAparelho());
  if (!dados) return { ok: false, motivo: 'invalido' };
  // Código nunca usado aqui: aceita a hora atual do celular (resolve o caso de
  // quem estava com o relógio adiantado e acertou). Código já usado com o
  // relógio atrasado é recusado, para ninguém "esticar" o próprio teste.
  const usados = JSON.parse(localStorage.getItem(CHAVE_USADOS) || '[]');
  const marca = codigo.slice(-16);
  const jaUsado = usados.includes(marca);
  if (dados.expira && jaUsado && relogioAlterado()) return { ok: false, motivo: 'relogio' };
  if (dados.expira && Date.now() >= dados.expira) return { ok: false, motivo: 'vencido' };
  if (!jaUsado) {
    localStorage.setItem(CHAVE_USADOS, JSON.stringify([...usados, marca].slice(-200)));
    localStorage.setItem(CHAVE_RELOGIO, String(Date.now()));
  }
  localStorage.setItem(CHAVE_ARMAZENADA, codigo);
  return { ok: true, licenca: await lerLicenca() };
}

/** "5 horas", "2 dias", "25 minutos" */
export function tempoRestante(expira) {
  const ms = expira - Date.now();
  if (ms <= 0) return 'vencido';
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.floor(h / 24);
  return `${d} dias`;
}

export function formatarData(ms) {
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
