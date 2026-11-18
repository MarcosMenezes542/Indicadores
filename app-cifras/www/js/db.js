// Banco de dados local (IndexedDB). Tudo fica guardado só no celular.

const NOME = 'palco';
const VERSAO = 1;
let conexao = null;

function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('musicas')) db.createObjectStore('musicas', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return conexao;
}

async function operar(modo, acao) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('musicas', modo);
    const req = acao(tx.objectStore('musicas'));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function listarMusicas() {
  const todas = (await operar('readonly', (s) => s.getAll())) || [];
  return todas.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base' }));
}

export const obterMusica = (id) => operar('readonly', (s) => s.get(id));

export function salvarMusica(musica) {
  musica.atualizadoEm = Date.now();
  return operar('readwrite', (s) => s.put(musica)).then(() => musica);
}

export const excluirMusica = (id) => operar('readwrite', (s) => s.delete(id));

export async function importarMusicas(lista) {
  let n = 0;
  await operar('readwrite', (s) => {
    for (const m of lista) {
      if (m && m.id && typeof m.titulo === 'string' && typeof m.cifra === 'string') {
        s.put(m);
        n++;
      }
    }
  });
  return n;
}
