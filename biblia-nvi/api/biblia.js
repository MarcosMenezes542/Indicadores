// Intermediário (proxy) para o serviço que fornece o texto bíblico (bolls.life).
// O navegador chama /api/biblia?path=/get-text/NVI/43/3/ e o servidor busca no serviço,
// evitando bloqueios de CORS e guardando as respostas no CDN da Vercel.
const UPSTREAM = "https://bolls.life";
const ALLOWED = [
  /^\/get-text\/[A-Za-z0-9_-]+\/\d{1,2}\/\d{1,3}\/$/, // capítulo
  /^\/v2\/find\/[A-Za-z0-9_-]+$/, // busca
  /^\/static\/bolls\/app\/views\/languages\.json$/, // lista de traduções
];

module.exports = async (req, res) => {
  const path = String(req.query.path || "");
  if (!ALLOWED.some((re) => re.test(path))) {
    res.status(400).json({ msg: "Caminho inválido." });
    return;
  }
  // Repassa somente os parâmetros de busca conhecidos.
  const qs = new URLSearchParams();
  for (const k of ["search", "match_case", "match_whole", "limit", "page"]) {
    if (req.query[k] !== undefined) qs.set(k, String(req.query[k]));
  }
  const url = UPSTREAM + path + (qs.toString() ? "?" + qs : "");
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    if (r.ok) {
      // O texto bíblico não muda: guarda no CDN por 30 dias.
      res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");
    }
    res.send(body);
  } catch (err) {
    res.status(502).json({ msg: "Não foi possível acessar o serviço do texto bíblico.", detail: String(err && err.message) });
  }
};
