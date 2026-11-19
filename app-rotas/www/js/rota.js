// Localização, busca de endereços e cálculo da melhor sequência de entregas.
// Não há servidor próprio: a busca de endereços usa o OpenStreetMap (Photon e
// Nominatim) e o desenho do trajeto usa o OSRM. Sem internet, o app continua
// funcionando e ordena as entregas pela distância em linha reta.

const temCoord = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
export { temCoord };

// ---------------------------------------------------------------- distância
export function distanciaKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatarDistancia(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

// ---------------------------------------------------------------- localização
let ultimaPosicao = null;
export const posicaoConhecida = () => ultimaPosicao;

/**
 * Posição atual para montar a rota: usa a do GPS em andamento se for recente
 * (até 20 s); senão pede uma nova. Se o GPS demorar, aceita a última conhecida
 * de até 2 minutos atrás.
 */
export async function posicaoAgora() {
  const u = ultimaPosicao;
  if (u && Date.now() - u.em < 20000) return u;
  const nova = await minhaPosicao({ tempo: 12000, recente: 0 });
  if (nova) return nova;
  return u && Date.now() - u.em < 120000 ? u : null;
}

/** Posição atual do celular, ou null se não for possível (sem permissão, GPS desligado...). */
export function minhaPosicao({ tempo = 10000, recente = 60000 } = {}) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        ultimaPosicao = { lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy, em: Date.now() };
        resolve(ultimaPosicao);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: tempo, maximumAge: recente },
    );
  });
}

/** Acompanha a posição enquanto a tela da rota está aberta. Retorna a função que para. */
export function acompanharPosicao(aoMudar) {
  if (!('geolocation' in navigator)) return () => {};
  const id = navigator.geolocation.watchPosition(
    (p) => {
      ultimaPosicao = { lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy, em: Date.now() };
      aoMudar(ultimaPosicao);
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

// ---------------------------------------------------------------- busca de endereço

/** Reconhece coordenadas coladas: "-22.85, -47.13" ou "-22.85 -47.13". */
export function lerCoordenadas(texto) {
  const m = String(texto).trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lon = Number(m[2].replace(',', '.'));
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

async function buscarJson(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function rotuloPhoton(p) {
  const rua = [p.street, p.housenumber].filter(Boolean).join(', ');
  const titulo = p.name && p.name !== p.street ? p.name : rua || p.name || p.city || '';
  const resto = [p.name && p.name !== p.street ? rua : '', p.district || p.locality, p.city, p.state]
    .filter((x) => x && x !== titulo);
  return { titulo, detalhe: [...new Set(resto)].join(' · ') };
}

/** Sugestões de endereço enquanto a pessoa digita. Lista de { titulo, detalhe, lat, lon }. */
export async function buscarEndereco(texto, perto = null) {
  const q = String(texto).trim();
  if (q.length < 3) return [];
  const coord = lerCoordenadas(q);
  if (coord) return [{ titulo: 'Ponto no mapa (coordenadas)', detalhe: `${coord.lat}, ${coord.lon}`, ...coord }];

  let lista = [];
  try {
    const u = new URL('https://photon.komoot.io/api/');
    u.searchParams.set('q', q);
    u.searchParams.set('limit', '6');
    if (perto) {
      u.searchParams.set('lat', perto.lat.toFixed(4));
      u.searchParams.set('lon', perto.lon.toFixed(4));
    }
    const dados = await buscarJson(u);
    lista = (dados.features || [])
      .filter((f) => !f.properties.countrycode || f.properties.countrycode === 'BR')
      .map((f) => ({ ...rotuloPhoton(f.properties), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  } catch (e) {
    console.warn('Photon falhou', e);
  }
  if (lista.length) return lista;

  // Segunda tentativa: Nominatim (melhor com número da casa em alguns casos).
  try {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.searchParams.set('q', q);
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('limit', '5');
    u.searchParams.set('countrycodes', 'br');
    u.searchParams.set('accept-language', 'pt-BR');
    const dados = await buscarJson(u);
    return dados.map((d) => {
      const partes = d.display_name.split(', ');
      return { titulo: partes.slice(0, 2).join(', '), detalhe: partes.slice(2, 5).join(' · '), lat: Number(d.lat), lon: Number(d.lon) };
    });
  } catch (e) {
    console.warn('Nominatim falhou', e);
    throw new Error('sem-conexao');
  }
}

/** Endereço aproximado de uma posição (usado em "Usar minha localização"). */
export async function enderecoDaPosicao(pos) {
  try {
    const u = new URL('https://photon.komoot.io/reverse');
    u.searchParams.set('lat', pos.lat);
    u.searchParams.set('lon', pos.lon);
    const dados = await buscarJson(u, 7000);
    const f = (dados.features || [])[0];
    if (!f) return '';
    const p = f.properties;
    return [[p.street || p.name, p.housenumber].filter(Boolean).join(', '), p.district, p.city].filter(Boolean).join(' - ');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------- melhor sequência

/**
 * Melhor ordem para visitar os pontos 1..n-1 saindo do ponto 0 (rota aberta,
 * sem voltar ao início). custo(i, j) = custo de ir de i até j.
 * Vizinho mais próximo seguido de melhoria 2-opt (desfaz cruzamentos).
 * Retorna os índices na ordem de visita (sem o 0).
 */
function melhorOrdem(n, custo) {
  const faltam = new Set(Array.from({ length: n - 1 }, (_, i) => i + 1));
  const caminho = [0];
  let atual = 0;
  while (faltam.size) {
    let melhor = -1;
    let melhorC = Infinity;
    for (const j of faltam) {
      const c = custo(atual, j);
      if (c < melhorC) {
        melhorC = c;
        melhor = j;
      }
    }
    faltam.delete(melhor);
    caminho.push(melhor);
    atual = melhor;
  }
  const total = (c) => {
    let t = 0;
    for (let i = 1; i < c.length; i++) t += custo(c[i - 1], c[i]);
    return t;
  };
  let melhorTotal = total(caminho);
  let melhorou = true;
  let voltas = 0;
  while (melhorou && voltas++ < 60) {
    melhorou = false;
    for (let i = 1; i < caminho.length - 1; i++) {
      for (let k = i + 1; k < caminho.length; k++) {
        const teste = [...caminho.slice(0, i), ...caminho.slice(i, k + 1).reverse(), ...caminho.slice(k + 1)];
        const t = total(teste);
        if (t + 1e-9 < melhorTotal) {
          caminho.splice(0, caminho.length, ...teste);
          melhorTotal = t;
          melhorou = true;
        }
      }
    }
  }
  return caminho.slice(1);
}

/**
 * Ordena as paradas pela distância em linha reta, saindo da origem (funciona sem internet).
 * Paradas sem localização ficam no fim, na ordem em que foram cadastradas.
 */
export function otimizar(paradas, origem) {
  const com = paradas.filter(temCoord);
  const sem = paradas.filter((p) => !temCoord(p));
  if (!com.length) return sem;
  // Sem origem: começa pela entrega mais "da ponta" (a mais longe do centro do grupo).
  let inicio = origem && temCoord(origem) ? origem : null;
  if (!inicio) {
    const centro = { lat: com.reduce((s, p) => s + p.lat, 0) / com.length, lon: com.reduce((s, p) => s + p.lon, 0) / com.length };
    inicio = com.reduce((a, p) => (distanciaKm(centro, p) > distanciaKm(centro, a) ? p : a), com[0]);
  }
  const pontos = [inicio, ...com];
  const ordem = melhorOrdem(pontos.length, (i, j) => distanciaKm(pontos[i], pontos[j]));
  return [...ordem.map((i) => pontos[i]), ...sem];
}

/**
 * Melhor sequência PELAS RUAS, saindo da posição atual: usa o tempo real de
 * viagem entre cada par de pontos (OSRM). Sem internet, usa a linha reta.
 * Retorna { ordem, pelasRuas: true|false }.
 */
export async function otimizarPelasRuas(paradas, origem) {
  const com = paradas.filter(temCoord);
  const sem = paradas.filter((p) => !temCoord(p));
  if (!origem || !temCoord(origem) || com.length < 2 || com.length > 90) {
    return { ordem: otimizar(paradas, origem), pelasRuas: false };
  }
  const pontos = [origem, ...com];
  try {
    const coords = pontos.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const dados = await buscarJson(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`, 15000);
    const m = dados.durations;
    if (!m || m.length !== pontos.length) throw new Error('matriz incompleta');
    // Trecho sem caminho pelas ruas (ilha, ponto no meio do mato): usa a linha reta como estimativa.
    const custo = (i, j) => (Number.isFinite(m[i][j]) ? m[i][j] : distanciaKm(pontos[i], pontos[j]) * 120);
    const ordem = melhorOrdem(pontos.length, custo);
    return { ordem: [...ordem.map((i) => pontos[i]), ...sem], pelasRuas: true };
  } catch (e) {
    console.warn('Tempo pelas ruas indisponível, usando linha reta', e);
    return { ordem: otimizar(paradas, origem), pelasRuas: false };
  }
}

/** Distância total (linha reta) de um caminho. */
export function distanciaTotal(pontos) {
  let total = 0;
  for (let i = 1; i < pontos.length; i++) total += distanciaKm(pontos[i - 1], pontos[i]);
  return total;
}

// ---------------------------------------------------------------- trajeto pelas ruas
const cacheTrajeto = new Map();

/**
 * Trajeto pelas ruas entre os pontos (OSRM). Retorna { linha: [[lat,lon]...], km, minutos }
 * ou null se não houver internet. O app então desenha linhas retas.
 */
export async function trajetoPelasRuas(pontos) {
  const validos = pontos.filter(temCoord).slice(0, 25);
  if (validos.length < 2) return null;
  const chave = validos.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  if (cacheTrajeto.has(chave)) return cacheTrajeto.get(chave);
  try {
    const dados = await buscarJson(
      `https://router.project-osrm.org/route/v1/driving/${chave}?overview=full&geometries=geojson`, 12000);
    const r = dados.routes && dados.routes[0];
    if (!r) return null;
    const res = {
      linha: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      km: r.distance / 1000,
      minutos: r.duration / 60,
      trechos: (r.legs || []).map((l) => ({ km: l.distance / 1000, minutos: l.duration / 60 })),
    };
    cacheTrajeto.set(chave, res);
    return res;
  } catch (e) {
    console.warn('Trajeto indisponível', e);
    return null;
  }
}

// ---------------------------------------------------------------- navegação externa
export function linkWaze(p) {
  if (temCoord(p)) return `https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(p.endereco || p.nome)}&navigate=yes`;
}

export function linkGoogleMaps(p) {
  const destino = temCoord(p) ? `${p.lat},${p.lon}` : p.endereco || p.nome;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}
