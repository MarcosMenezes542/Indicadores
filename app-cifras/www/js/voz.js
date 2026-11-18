// Modo "seguir a voz": escuta pelo microfone, reconhece as palavras cantadas
// (no próprio aparelho) e descobre em qual linha da letra a música está.

import { plugin, ehNativo } from './nativo.js';

export function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1);
}

/**
 * Procura a linha da letra que melhor combina com as últimas palavras ouvidas.
 * Olha só perto da linha atual (um pouco para trás, mais para frente), assim
 * refrões repetidos não fazem a cifra pular para longe.
 * Retorna o índice da linha ou -1 se não tiver confiança.
 */
export function encontrarLinha(palavrasOuvidas, letras, atual) {
  const ouvidas = palavrasOuvidas.slice(-7);
  if (ouvidas.length < 2) return -1;
  const inicio = Math.max(0, atual - 2);
  const fim = Math.min(letras.length - 1, atual + 8);
  let melhor = -1;
  let melhorPontos = 0;
  for (let i = inicio; i <= fim; i++) {
    const palavras = letras[i];
    if (!palavras.length) continue;
    const conjunto = new Set(palavras);
    let pontos = 0;
    // As palavras mais recentes pesam mais: mostram onde a música está AGORA.
    const peso = (k) => (k >= ouvidas.length - 4 ? 1 : 0.4);
    ouvidas.forEach((p, k) => {
      if (conjunto.has(p)) pontos += peso(k);
    });
    // Bônus para pares de palavras na mesma ordem da letra
    for (let k = 0; k < ouvidas.length - 1; k++) {
      const a = palavras.indexOf(ouvidas[k]);
      if (a >= 0 && palavras[a + 1] === ouvidas[k + 1]) pontos += 1.5 * peso(k + 1);
    }
    pontos = pontos / Math.sqrt(Math.max(3, palavras.length)) - Math.abs(i - atual) * 0.04;
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = i;
    }
  }
  return melhorPontos >= 0.9 ? melhor : -1;
}

export class SeguidorDeVoz {
  constructor(linhasDeLetra, aoEncontrar, aoMudarEstado) {
    this.letras = linhasDeLetra.map(normalizarTexto);
    this.aoEncontrar = aoEncontrar;
    this.aoMudarEstado = aoMudarEstado || (() => {});
    this.atual = 0;
    this.ativo = false;
    this.ouvintes = [];
    this.web = null;
  }

  static async disponivel() {
    if (ehNativo()) {
      try {
        return (await plugin('SpeechRecognition').available()).available;
      } catch {
        return false;
      }
    }
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  processar(texto) {
    const i = encontrarLinha(normalizarTexto(texto), this.letras, this.atual);
    if (i >= 0 && i !== this.atual) {
      this.atual = i;
      this.aoEncontrar(i);
    }
  }

  async iniciar() {
    this.ativo = true;
    if (ehNativo()) return this.iniciarNativo();
    return this.iniciarWeb();
  }

  async iniciarNativo() {
    const sr = plugin('SpeechRecognition');
    const perm = await sr.requestPermissions();
    if (perm.speechRecognition !== 'granted') {
      this.ativo = false;
      throw new Error('Permissão do microfone negada');
    }
    this.ouvintes.push(
      await sr.addListener('partialResults', (d) => d.matches && d.matches[0] && this.processar(d.matches[0])),
      await sr.addListener('listeningState', (d) => {
        this.aoMudarEstado(d.status === 'started');
        // O Android encerra a escuta depois de um silêncio: recomeça sozinho.
        if (d.status === 'stopped' && this.ativo) setTimeout(() => this.ouvirNativo(), 250);
      }),
    );
    this.ouvirNativo();
  }

  ouvirNativo() {
    if (!this.ativo) return;
    plugin('SpeechRecognition')
      .start({ language: 'pt-BR', partialResults: true, popup: false, maxResults: 1 })
      .catch(() => this.ativo && setTimeout(() => this.ouvirNativo(), 800));
  }

  iniciarWeb() {
    const Reconhecedor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Reconhecedor) throw new Error('Reconhecimento de voz indisponível');
    const r = new Reconhecedor();
    r.lang = 'pt-BR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => this.processar(e.results[e.results.length - 1][0].transcript);
    r.onstart = () => this.aoMudarEstado(true);
    r.onend = () => {
      this.aoMudarEstado(false);
      if (this.ativo) setTimeout(() => this.ativo && r.start(), 250);
    };
    this.web = r;
    r.start();
  }

  async parar() {
    this.ativo = false;
    if (this.web) {
      this.web.onend = null;
      this.web.stop();
      this.web = null;
    }
    if (ehNativo()) {
      for (const o of this.ouvintes) await o.remove();
      this.ouvintes = [];
      try {
        await plugin('SpeechRecognition').stop();
      } catch {}
    }
    this.aoMudarEstado(false);
  }
}
