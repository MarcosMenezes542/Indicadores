// Intermediário (proxy) para a API ABíbliaDigital.
// O navegador chama /api/biblia?path=/verses/nvi/jo/3 e o servidor busca na API,
// evitando bloqueios de CORS e permitindo cache no CDN da Vercel.
const UPSTREAM = "https://www.abibliadigital.com.br/api";
const ALLOWED = /^\/(verses\/[a-z]+\/[^/]+\/\d+|verses\/search|books)$/;

module.exports = async (req, res) => {
  const path = String(req.query.path || "");
  if (!ALLOWED.test(decodeURIComponent(path))) {
    res.status(400).json({ msg: "Caminho inválido." });
    return;
  }
  const headers = { Accept: "application/json" };
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  const init = { method: req.method === "POST" ? "POST" : "GET", headers };
  if (init.method === "POST") {
    headers["Content-Type"] = "application/json";
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  }
  try {
    const r = await fetch(UPSTREAM + path, init);
    const body = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    if (r.ok && init.method === "GET") {
      // O texto bíblico não muda: guarda no CDN por 30 dias.
      res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");
    }
    res.send(body);
  } catch (err) {
    res.status(502).json({ msg: "Não foi possível acessar a API ABíbliaDigital.", detail: String(err && err.message) });
  }
};
