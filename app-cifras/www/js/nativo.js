// Acesso aos recursos nativos do celular (via Capacitor).
// No navegador comum essas funções retornam valores seguros para o app
// continuar funcionando (útil para testar no computador).

const cap = window.capacitorExports;
const cache = {};

export function ehNativo() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

export function plugin(nome) {
  if (!cache[nome]) cache[nome] = cap.registerPlugin(nome);
  return cache[nome];
}

let travaTela = null;

export async function manterTelaLigada(ligar) {
  try {
    if (ehNativo()) {
      if (ligar) await plugin('KeepAwake').keepAwake();
      else await plugin('KeepAwake').allowSleep();
      return;
    }
    if (!('wakeLock' in navigator)) return;
    if (ligar && !travaTela) {
      travaTela = await navigator.wakeLock.request('screen');
      travaTela.addEventListener('release', () => (travaTela = null));
    } else if (!ligar && travaTela) {
      await travaTela.release();
      travaTela = null;
    }
  } catch (e) {
    console.warn('Não foi possível manter a tela ligada', e);
  }
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export async function lerAreaDeTransferencia() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Salva um arquivo e abre o menu "compartilhar" (WhatsApp, Drive, e-mail...). */
export async function compartilharArquivo(nome, conteudo) {
  if (ehNativo()) {
    const { uri } = await plugin('Filesystem').writeFile({
      path: nome,
      data: conteudo,
      directory: 'CACHE',
      encoding: 'utf8',
    });
    await plugin('Share').share({ title: nome, url: uri, dialogTitle: 'Salvar backup' });
    return;
  }
  const blob = new Blob([conteudo], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

export function abrirLinkExterno(url) {
  if (ehNativo()) window.location.href = url;
  else window.open(url, '_blank', 'noopener');
}
