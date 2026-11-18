// Banco de dados local (IndexedDB). Tudo fica guardado só no celular.
//
// Parada (entrega):
// { id, nome, endereco, lat, lon, telefone, obs,
//   status: 'pendente' | 'entregue' | 'nao', motivo, ordem, criadoEm, concluidaEm }

const NOME = 'rota-de-entregas';
const VERSAO = 1;
const LOJA = 'paradas';
let conexao = null;

function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return conexao;
}

async function operar(modo, acao) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOJA, modo);
    const req = acao(tx.objectStore(LOJA));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Todas as paradas, na ordem da rota (as sem ordem vão para o fim, pela data de cadastro). */
export async function listarParadas() {
  const todas = (await operar('readonly', (s) => s.getAll())) || [];
  const chave = (p) => (Number.isFinite(p.ordem) ? p.ordem : 1e9 + (p.criadoEm || 0) / 1e13);
  return todas.sort((a, b) => chave(a) - chave(b) || (a.criadoEm || 0) - (b.criadoEm || 0));
}

export const obterParada = (id) => operar('readonly', (s) => s.get(id));

export function salvarParada(p) {
  p.atualizadoEm = Date.now();
  return operar('readwrite', (s) => s.put(p)).then(() => p);
}

/** Grava várias paradas de uma vez (usado ao reordenar a rota). */
export function salvarParadas(lista) {
  return operar('readwrite', (s) => {
    for (const p of lista) s.put(p);
  });
}

export const excluirParada = (id) => operar('readwrite', (s) => s.delete(id));

export const apagarTodas = () => operar('readwrite', (s) => s.clear());

export async function importarParadas(lista) {
  let n = 0;
  await operar('readwrite', (s) => {
    for (const p of lista) {
      if (p && p.id && typeof p.nome === 'string') {
        s.put(p);
        n++;
      }
    }
  });
  return n;
}
