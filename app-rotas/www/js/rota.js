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

/** Posição atual do celular, ou null se não for possível (sem permissão, GPS desligado...). */
export function minhaPosicao({ tempo = 10000, recente = 60000 } = {}) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        ultimaPosicao = { lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy };
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
      ultimaPosicao = { lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy };
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
 * Ordena as paradas para percorrer a menor distância, saindo da origem.
 * Vizinho mais próximo + melhoria 2-opt (rota aberta, sem voltar ao início).
 * Paradas sem localização ficam no fim, na ordem em que foram cadastradas.
 */
export function otimizar(paradas, origem) {
  const com = paradas.filter(temCoord);
  const sem = paradas.filter((p) => !temCoord(p));
  if (com.length < 2 && !origem) return [...com, ...sem];

  const inicio = origem && temCoord(origem) ? origem : null;
  const restantes = [...com];
  const ordem = [];
  let atual = inicio || restantes.shift();
  if (!inicio) ordem.push(atual);
  while (restantes.length) {
    let melhor = 0;
    let melhorD = Infinity;
    restantes.forEach((p, i) => {
      const d = distanciaKm(atual, p);
      if (d < melhorD) {
        melhorD = d;
        melhor = i;
      }
    });
    atual = restantes.splice(melhor, 1)[0];
    ordem.push(atual);
  }

  // 2-opt: desfaz cruzamentos do caminho.
  const pontos = inicio ? [inicio, ...ordem] : ordem;
  const fixo = inicio ? 1 : 0;
  const d = (a, b) => distanciaKm(pontos[a], pontos[b]);
  let melhorou = true;
  let voltas = 0;
  while (melhorou && voltas++ < 60) {
    melhorou = false;
    for (let i = fixo; i < pontos.length - 1; i++) {
      for (let k = i + 1; k < pontos.length; k++) {
        const temDepois = k + 1 < pontos.length;
        const antes = (i > 0 ? d(i - 1, i) : 0) + (temDepois ? d(k, k + 1) : 0);
        const depois = (i > 0 ? d(i - 1, k) : 0) + (temDepois ? d(i, k + 1) : 0);
        if (depois + 1e-9 < antes) {
          const trecho = pontos.slice(i, k + 1).reverse();
          pontos.splice(i, trecho.length, ...trecho);
          melhorou = true;
        }
      }
    }
  }
  return [...(inicio ? pontos.slice(1) : pontos), ...sem];
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
