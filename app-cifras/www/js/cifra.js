// Leitura, transposição e desenho das cifras (acordes acima da letra).

const SUSTENIDOS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BEMOIS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const INDICE_NOTA = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

const NOTA = '[A-G](?:#|b)?';
const ACORDE_RE = new RegExp(
  `^\\(?(${NOTA})((?:maj|min|dim|aug|sus|add|m|M|[0-9]|[+\\-º°#b()]|\\/[0-9]+)*)(?:\\/(${NOTA}))?\\)?$`,
);
const ENFEITE_RE = /^(\||\|\||x\d+|\d+x|\(x?\d+x?\)|-+|\.{2,}|%|\/|~)$/i;
const SECAO_RE = /^\[([^\]]+)\]\s*/;
const TAB_RE = /^\s*[A-Ga-g]?[#b]?\s*\|[-0-9|hpbrx\/\\~ .]{3,}/;

export function ehAcorde(token) {
  return ACORDE_RE.test(token);
}

/** Uma linha é de acordes se todos os "pedaços" forem acordes ou enfeites (|, x2...). */
export function ehLinhaDeAcordes(linha) {
  const tokens = linha.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let acordes = 0;
  for (const t of tokens) {
    if (ehAcorde(t)) acordes++;
    else if (!ENFEITE_RE.test(t)) return false;
  }
  return acordes > 0;
}

/**
 * Transforma o texto da cifra em linhas classificadas:
 * secao, acordes, letra, tab ou vazia.
 */
export function analisar(texto) {
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return linhas.map((original) => {
    const linha = original.replace(/\s+$/, '');
    if (!linha.trim()) return { tipo: 'vazia', texto: '' };
    if (TAB_RE.test(linha)) return { tipo: 'tab', texto: linha };

    const secao = linha.trim().match(SECAO_RE);
    if (secao) {
      const resto = linha.trim().slice(secao[0].length);
      if (!resto) return { tipo: 'secao', nome: secao[1].trim(), texto: '' };
      if (ehLinhaDeAcordes(resto)) return { tipo: 'acordes', nome: secao[1].trim(), texto: resto };
      return { tipo: 'letra', nome: secao[1].trim(), texto: resto };
    }
    if (ehLinhaDeAcordes(linha)) return { tipo: 'acordes', texto: linha };
    return { tipo: 'letra', texto: linha };
  });
}

function transporNota(nota, semitons, usarBemol) {
  const i = INDICE_NOTA[nota];
  if (i === undefined) return nota;
  const n = (((i + semitons) % 12) + 12) % 12;
  return (usarBemol ? BEMOIS : SUSTENIDOS)[n];
}

export function transporAcorde(acorde, semitons, usarBemol = false) {
  if (!semitons) return acorde;
  const m = acorde.match(ACORDE_RE);
  if (!m) return acorde;
  const abre = acorde.startsWith('(') ? '(' : '';
  const fecha = acorde.endsWith(')') && abre ? ')' : '';
  let sufixo = m[2];
  if (fecha && sufixo.endsWith(')') && !m[3]) sufixo = sufixo.slice(0, -1);
  const baixo = m[3] ? '/' + transporNota(m[3], semitons, usarBemol) : '';
  return abre + transporNota(m[1], semitons, usarBemol) + sufixo + baixo + fecha;
}

/** Decide entre sustenidos e bemóis olhando o tom de destino. */
export function preferirBemol(tom, semitons) {
  if (!tom) return false;
  const destino = transporAcorde(tom.trim(), semitons, true);
  const raiz = (destino.match(/^[A-G]b?/) || [''])[0];
  const menor = /^[A-G][#b]?m(?!aj)/.test(destino);
  const bemolMaior = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
  const bemolMenor = ['D', 'G', 'C', 'F', 'Bb', 'Eb'];
  return menor ? bemolMenor.includes(raiz) : bemolMaior.includes(raiz);
}

const escapar = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Transpõe uma linha de acordes mantendo o alinhamento com a letra. */
export function desenharLinhaDeAcordes(linha, semitons, usarBemol) {
  let html = '';
  let fim = 0;
  let divida = 0; // caracteres a mais (ou a menos) que os acordes novos ocupam
  for (const m of linha.matchAll(/\S+/g)) {
    let espaco = m.index - fim;
    if (fim > 0) {
      const ajustado = Math.max(1, espaco - divida);
      divida -= espaco - ajustado;
      espaco = ajustado;
    } else {
      espaco = Math.max(0, espaco - Math.max(0, divida));
    }
    html += ' '.repeat(espaco);
    const token = m[0];
    if (ehAcorde(token)) {
      const novo = transporAcorde(token, semitons, usarBemol);
      divida += novo.length - token.length;
      html += `<b class="ac">${escapar(novo)}</b>`;
    } else {
      html += `<span class="enf">${escapar(token)}</span>`;
    }
    fim = m.index + token.length;
  }
  return html;
}

/**
 * Gera o HTML da cifra. Cada linha de letra recebe data-l com o número
 * dela, usado pelo modo "seguir a voz".
 */
export function desenhar(linhas, semitons = 0, usarBemol = false) {
  let indiceLetra = 0;
  return linhas
    .map((l) => {
      const secao = l.nome ? `<span class="secao">${escapar(l.nome)}</span>` : '';
      switch (l.tipo) {
        case 'vazia':
          return '<div class="ln vazia"></div>';
        case 'secao':
          return `<div class="ln">${secao}</div>`;
        case 'tab':
          return `<div class="ln tab">${escapar(l.texto)}</div>`;
        case 'acordes':
          return `<div class="ln acordes">${secao}${desenharLinhaDeAcordes(l.texto, semitons, usarBemol)}</div>`;
        default:
          return `<div class="ln letra" data-l="${indiceLetra++}">${secao}${escapar(l.texto)}</div>`;
      }
    })
    .join('');
}

/** Só o texto das linhas de letra, na mesma ordem dos data-l. */
export function linhasDeLetra(linhas) {
  return linhas.filter((l) => l.tipo === 'letra').map((l) => l.texto);
}
