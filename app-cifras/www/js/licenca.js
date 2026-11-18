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
const CHAVE_ARMAZENADA = 'palco.ativacao';
const CHAVE_ID_LOCAL = 'palco.idAparelho';

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
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode('PALCO|' + id)),
  );
  codigoAparelhoCache = agrupar(base32(hash).slice(0, 12));
  return codigoAparelhoCache;
}

/** Mensagem que é assinada: tem que ser idêntica no app e no gerador. */
export function mensagemParaAssinar(codigoAparelho) {
  return new TextEncoder().encode('PALCO-ATIVACAO|' + normalizarCodigo(codigoAparelho));
}

export async function verificarCodigo(codigoAtivacao, codigoAparelho) {
  const assinatura = base32Decodificar(normalizarCodigo(codigoAtivacao));
  if (assinatura.length !== 64) return false;
  try {
    const chave = await crypto.subtle.importKey(
      'raw',
      base64urlParaBytes(CONFIG.chavePublica),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      chave,
      assinatura,
      mensagemParaAssinar(codigoAparelho),
    );
  } catch (e) {
    console.warn('Falha ao verificar código', e);
    return false;
  }
}

/** Confere a ativação salva (a cada abertura do app). */
export async function estaAtivado() {
  const salvo = localStorage.getItem(CHAVE_ARMAZENADA);
  if (!salvo) return false;
  return verificarCodigo(salvo, await codigoDoAparelho());
}

/** Tenta ativar com o código digitado. Retorna true se deu certo. */
export async function ativar(codigoAtivacao) {
  const ok = await verificarCodigo(codigoAtivacao, await codigoDoAparelho());
  if (ok) localStorage.setItem(CHAVE_ARMAZENADA, normalizarCodigo(codigoAtivacao));
  return ok;
}
