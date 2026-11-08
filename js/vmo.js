/* App do VMO: registro de visitas operacionais */
const VMO = (() => {
  let rascunho = null;
  const urlsLocais = {}; // fotoId -> objectURL
  const chave = () => `vmo-rascunho-${Estado.usuario.id}`;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16);
  }));

  const salvar = () => { if (rascunho) localStorage.setItem(chave(), JSON.stringify(rascunho)); };
  const lerRascunho = () => { try { return JSON.parse(localStorage.getItem(chave())); } catch { return null; } };

  function novaOcorrencia() {
    return { oid: uuid(), categoria: "", gravidade: "Média", descricao: "", fotos: [] };
  }

  async function iniciar() {
    $("#vmo-nome").textContent = Estado.perfil.nome.split(" ")[0];
    mostrar("#btn-continuar", !!lerRascunho());
    mostrarInicio();
  }

  function mostrarInicio() {
    mostrar("#vmo-inicio", true);
    mostrar("#form-visita", false);
    mostrar("#btn-continuar", !!lerRascunho());
    contarEnviadasHoje();
    window.scrollTo(0, 0);
  }

  function abrirFormulario(continuar) {
    rascunho = continuar ? lerRascunho() : null;
    if (!rascunho) {
      rascunho = { id: uuid(), unidade: "", chegada: paraInputLocal(new Date()), saida: "", situacao: "normal", observacoes: "", ocorrencias: [], geo_chegada: null, geo_saida: null };
      salvar();
      capturarGeo("chegada");
    }
    const f = $("#form-visita");
    f.local_ronda.value = rascunho.unidade;
    f.chegada.value = rascunho.chegada;
    f.saida.value = rascunho.saida;
    f.observacoes.value = rascunho.observacoes;
    f.querySelector(`[name=situacao][value=${rascunho.situacao}]`).checked = true;
    $("#visita-erro").textContent = "";
    renderOcorrencias();
    atualizarPermanencia();
    renderGeo();
    mostrar("#vmo-inicio", false);
    mostrar(f, true);
    window.scrollTo(0, 0);
  }

  /* ----- Localização ----- */
  const capturando = new Set();
  async function capturarGeo(tipo) {
    if (!rascunho || capturando.has(tipo)) return;
    const id = rascunho.id;
    capturando.add(tipo);
    renderGeo();
    const g = await obterLocalizacao();
    capturando.delete(tipo);
    if (!rascunho || rascunho.id !== id) return;
    rascunho[`geo_${tipo}`] = g;
    salvar();
    renderGeo();
    if (g.erro) aviso("📍 " + g.erro + ". Ative a localização do celular.", true);
  }

  function renderGeo() {
    if (!rascunho) return;
    ["chegada", "saida"].forEach((tipo) => {
      const el = $(`#geo-${tipo}`);
      const g = rascunho[`geo_${tipo}`];
      const botao = (txt) => `<button type="button" class="btn peq" data-geo="${tipo}">${txt}</button>`;
      if (capturando.has(tipo)) { el.className = "geo"; el.innerHTML = `📡 Obtendo sua localização...`; return; }
      if (!g) { el.className = "geo"; el.innerHTML = `📍 Localização ainda não registrada ${botao("Registrar localização")}`; return; }
      if (g.erro) {
        el.className = "geo geo-sem";
        el.innerHTML = `❌ ${esc(g.erro)}.<br><small>Ative o GPS e permita a localização para este app.</small> ${botao("Tentar novamente")}`;
        return;
      }
      const v = verificarGeo(g, rascunho.unidade);
      el.className = `geo ${v.classe}`;
      el.innerHTML = `
        <div>📍 <b>Localização registrada</b> às ${fmtHora(g.em)} · precisão ±${g.precisao} m</div>
        ${mapaEmbed(g)}
        <div><a href="${linkMapa(g)}" target="_blank" rel="noopener">${fmtCoord(g)} — abrir no Google Maps</a></div>
        <div class="geo-status">${v.icone} ${esc(v.codigo === "ok" ? `Você está na unidade (${fmtDistancia(v.dist)})`
          : v.codigo === "longe" ? `Atenção: você está a ${fmtDistancia(v.dist)} da unidade "${rascunho.unidade}". Confira se a unidade está correta.`
          : "Sua localização foi registrada pelo celular e será enviada com a visita.")}</div>
        ${botao("↻ Atualizar localização")}`;
    });
  }

  function comDistancia(g, unidade) {
    if (!g) return null;
    const ref = Estado.coordUnidades?.[unidade];
    return g.lat != null && ref ? { ...g, distancia_m: Math.round(distanciaM(g, ref)) } : g;
  }

  function atualizarPermanencia() {
    const f = $("#form-visita");
    const p = $("#permanencia");
    if (f.chegada.value && f.saida.value) {
      const m = minutosEntre(f.chegada.value, f.saida.value);
      p.textContent = m >= 0 ? `⏱️ Tempo de permanência: ${fmtDuracao(m)}` : "⚠️ A saída está antes da chegada.";
    } else p.textContent = "";
  }

  function renderOcorrencias() {
    const anormal = rascunho.situacao === "anormal";
    if (anormal && !rascunho.ocorrencias.length) { rascunho.ocorrencias.push(novaOcorrencia()); salvar(); }
    mostrar("#ocorrencias", anormal);
    mostrar("#btn-add-ocorrencia", anormal && rascunho.ocorrencias.length < 20);
    const opcCat = (sel) => `<option value="">Selecione...</option>` + CFG.CATEGORIAS.map((c) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("");
    const opcGrav = (sel) => CFG.GRAVIDADES.map((g) => `<option ${g === sel ? "selected" : ""}>${g}</option>`).join("");
    $("#ocorrencias").innerHTML = rascunho.ocorrencias.map((o, i) => `
      <div class="ocorrencia" data-oid="${o.oid}">
        <div class="ocorrencia-topo"><strong>⚠️ Anormalidade ${i + 1}</strong>
          ${rascunho.ocorrencias.length > 1 ? `<button type="button" class="btn-link" data-remover-oc>Remover</button>` : ""}</div>
        <label>Tipo de anormalidade * <select data-campo="categoria">${opcCat(o.categoria)}</select></label>
        <label>Gravidade <select data-campo="gravidade">${opcGrav(o.gravidade)}</select></label>
        <label>Descrição do ocorrido * <textarea data-campo="descricao" rows="3" maxlength="2000" placeholder="O que foi encontrado, onde, providências tomadas...">${esc(o.descricao)}</textarea></label>
        <div class="botoes-foto">
          <label><input type="file" accept="image/*" capture="environment" data-foto /><span class="btn primario">📷 Tirar foto</span></label>
          <label><input type="file" accept="image/*" multiple data-foto /><span class="btn">🖼️ Inserir fotos</span></label>
        </div>
        <div class="miniaturas">${o.fotos.map((fid) => `
          <div class="miniatura" data-fid="${fid}"><img alt="Foto" data-src-local="${fid}" /><button type="button" data-remover-foto title="Remover foto">×</button></div>`).join("")}
        </div>
        <p class="dica">${o.fotos.length} foto(s) — máx. 10 por anormalidade</p>
      </div>`).join("");
    // carrega miniaturas do armazenamento local
    $$("img[data-src-local]").forEach(async (img) => {
      const fid = img.dataset.srcLocal;
      if (!urlsLocais[fid]) {
        const blob = await BancoLocal.ler(fid);
        if (blob) urlsLocais[fid] = URL.createObjectURL(blob);
      }
      if (urlsLocais[fid]) img.src = urlsLocais[fid];
    });
  }

  async function adicionarFotos(oid, arquivos) {
    const o = rascunho.ocorrencias.find((x) => x.oid === oid);
    if (!o) return;
    const lista = [...arquivos].slice(0, Math.max(0, 10 - o.fotos.length));
    if (lista.length < arquivos.length) aviso("Limite de 10 fotos por anormalidade.", true);
    carregando(true, "Processando fotos...");
    try {
      for (const arq of lista) {
        const blob = await comprimirImagem(arq);
        if (blob.size > 10 * 1024 * 1024) { aviso("Foto maior que 10 MB foi ignorada.", true); continue; }
        const fid = uuid();
        await BancoLocal.salvar(fid, blob);
        urlsLocais[fid] = URL.createObjectURL(blob);
        o.fotos.push(fid);
      }
      salvar();
    } catch (e) {
      aviso("Não foi possível salvar a foto: " + e.message, true);
    } finally {
      carregando(false);
      renderOcorrencias();
    }
  }

  async function descartar() {
    if (!confirm("Descartar esta visita? Os dados e fotos não enviados serão apagados.")) return;
    await limparRascunho();
    mostrarInicio();
  }

  async function limparRascunho() {
    if (rascunho) for (const o of rascunho.ocorrencias) for (const fid of o.fotos) {
      await BancoLocal.apagar(fid).catch(() => {});
      if (urlsLocais[fid]) { URL.revokeObjectURL(urlsLocais[fid]); delete urlsLocais[fid]; }
    }
    localStorage.removeItem(chave());
    rascunho = null;
  }

  function validar() {
    const r = rascunho;
    if (!r.unidade.trim()) return "Informe a unidade visitada.";
    if (!r.chegada) return "Registre a data e hora de chegada.";
    if (!r.saida) return "Registre a data e hora de saída.";
    if (new Date(r.saida) < new Date(r.chegada)) return "A saída não pode ser antes da chegada.";
    if (new Date(r.chegada) > new Date(Date.now() + 10 * 60000)) return "A chegada está no futuro.";
    if (r.situacao === "anormal") {
      for (const [i, o] of r.ocorrencias.entries()) {
        if (!o.categoria) return `Escolha o tipo da anormalidade ${i + 1}.`;
        if (!o.descricao.trim()) return `Descreva a anormalidade ${i + 1}.`;
      }
    }
    return null;
  }

  async function enviar(ev) {
    ev.preventDefault();
    const erro = validar();
    $("#visita-erro").textContent = erro || "";
    if (erro) return;
    const r = rascunho;
    const uid = Estado.usuario.id;
    if (!r.geo_saida || r.geo_saida.erro) {
      carregando(true, "Registrando localização de saída...");
      const g = await obterLocalizacao(15000);
      carregando(false);
      if (!g.erro || !r.geo_saida) r.geo_saida = g;
      salvar(); renderGeo();
    }
    if (!r.geo_chegada || r.geo_chegada.lat == null) {
      if (!confirm("⚠️ A localização da CHEGADA não foi registrada.\nO administrador verá esta visita como \"sem localização\".\n\nToque em Cancelar para tentar registrar a localização, ou OK para enviar assim mesmo.")) return;
    }
    const btn = $("#btn-enviar");
    btn.disabled = true;
    try {
      const anomalias = [];
      if (r.situacao === "anormal") {
        const total = r.ocorrencias.reduce((s, o) => s + o.fotos.length, 0);
        let n = 0;
        for (const o of r.ocorrencias) {
          const caminhos = [];
          for (const fid of o.fotos) {
            n++;
            carregando(true, `Enviando foto ${n} de ${total}...`);
            const blob = await BancoLocal.ler(fid);
            if (!blob) continue;
            const caminho = `${uid}/${r.id}/${fid}.jpg`;
            const { error } = await sb.storage.from(CFG.BUCKET).upload(caminho, blob, { contentType: blob.type || "image/jpeg", upsert: false });
            if (error && !/exists|duplicate/i.test(error.message)) throw new Error("Falha ao enviar foto: " + error.message);
            caminhos.push(caminho);
          }
          anomalias.push({ categoria: o.categoria, gravidade: o.gravidade, descricao: o.descricao.trim(), fotos: caminhos });
        }
      }
      carregando(true, "Salvando visita...");
      const { error } = await sb.from("visitas").insert({
        id: r.id,
        vigilante: Estado.perfil.nome,
        unidade: r.unidade.trim(),
        chegada: new Date(r.chegada).toISOString(),
        saida: new Date(r.saida).toISOString(),
        tem_anormalidade: r.situacao === "anormal",
        anomalias,
        observacoes: r.observacoes.trim(),
        autor: uid,
        geo_chegada: comDistancia(r.geo_chegada, r.unidade.trim()),
        geo_saida: comDistancia(r.geo_saida, r.unidade.trim()),
      });
      if (error && !/duplicate key/i.test(error.message)) throw error;
      await limparRascunho();
      carregando(false);
      aviso("✅ Visita enviada com sucesso!");
      mostrarInicio();
    } catch (e) {
      carregando(false);
      const msg = /fetch|network/i.test(e.message) ? "Sem conexão. A visita continua salva no aparelho — tente enviar novamente." : e.message;
      $("#visita-erro").textContent = msg;
      aviso(msg, true);
    } finally {
      btn.disabled = false;
    }
  }

  async function contarEnviadasHoje() {
    const el = $("#enviadas-hoje");
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    const { count, error } = await sb.from("visitas").select("id", { count: "exact", head: true })
      .eq("autor", Estado.usuario.id).gte("enviado_em", ini.toISOString());
    el.textContent = error ? "" : count ? `✅ Você enviou ${count} visita(s) hoje.` : "Nenhuma visita enviada hoje.";
  }

  function ligarEventos() {
    const f = $("#form-visita");
    $("#btn-nova-visita").onclick = async () => {
      if (lerRascunho() && !confirm("Existe uma visita em andamento. Deseja descartá-la e iniciar uma nova?")) return;
      rascunho = lerRascunho(); await limparRascunho();
      abrirFormulario(false);
    };
    $("#btn-continuar").onclick = () => abrirFormulario(true);
    $("#btn-voltar").onclick = () => { salvar(); mostrarInicio(); aviso("Visita salva no aparelho. Continue quando quiser."); };
    $("#btn-descartar").onclick = descartar;
    $("#btn-chegada").onclick = () => { f.chegada.value = paraInputLocal(new Date()); f.chegada.dispatchEvent(new Event("input", { bubbles: true })); capturarGeo("chegada"); };
    $("#btn-saida").onclick = () => { f.saida.value = paraInputLocal(new Date()); f.saida.dispatchEvent(new Event("input", { bubbles: true })); capturarGeo("saida"); };
    $("#btn-add-ocorrencia").onclick = () => { rascunho.ocorrencias.push(novaOcorrencia()); salvar(); renderOcorrencias(); };
    f.addEventListener("input", (e) => {
      if (!rascunho) return;
      const t = e.target;
      const CAMPOS = { local_ronda: "unidade", chegada: "chegada", saida: "saida", observacoes: "observacoes" };
      if (CAMPOS[t.name]) rascunho[CAMPOS[t.name]] = t.value;
      if (t.dataset.campo) {
        const o = rascunho.ocorrencias.find((x) => x.oid === t.closest("[data-oid]").dataset.oid);
        o[t.dataset.campo] = t.value;
      }
      if (t.name === "chegada" || t.name === "saida") atualizarPermanencia();
      if (t.name === "local_ronda") renderGeo();
      salvar();
    });
    f.addEventListener("change", (e) => {
      const t = e.target;
      if (t.name === "situacao") { rascunho.situacao = t.value; salvar(); renderOcorrencias(); }
      if (t.matches("[data-foto]") && t.files.length) {
        adicionarFotos(t.closest("[data-oid]").dataset.oid, t.files);
        t.value = "";
      }
    });
    f.addEventListener("click", async (e) => {
      const t = e.target;
      if (t.matches("[data-remover-oc]")) {
        const oid = t.closest("[data-oid]").dataset.oid;
        const o = rascunho.ocorrencias.find((x) => x.oid === oid);
        if (o.fotos.length && !confirm("Remover esta anormalidade e suas fotos?")) return;
        for (const fid of o.fotos) await BancoLocal.apagar(fid).catch(() => {});
        rascunho.ocorrencias = rascunho.ocorrencias.filter((x) => x.oid !== oid);
        salvar(); renderOcorrencias();
      }
      if (t.matches("[data-remover-foto]")) {
        const fid = t.closest("[data-fid]").dataset.fid;
        const o = rascunho.ocorrencias.find((x) => x.oid === t.closest("[data-oid]").dataset.oid);
        o.fotos = o.fotos.filter((x) => x !== fid);
        await BancoLocal.apagar(fid).catch(() => {});
        salvar(); renderOcorrencias();
      }
      if (t.matches(".miniatura img")) verImagem(t.src);
      if (t.matches("[data-geo]")) capturarGeo(t.dataset.geo);
    });
    f.addEventListener("submit", enviar);
  }

  return { iniciar, ligarEventos };
})();

