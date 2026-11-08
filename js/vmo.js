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
    carregarMinhasVisitas();
    window.scrollTo(0, 0);
  }

  function abrirFormulario(continuar) {
    rascunho = continuar ? lerRascunho() : null;
    if (!rascunho) {
      rascunho = { id: uuid(), unidade: "", chegada: paraInputLocal(new Date()), saida: "", situacao: "normal", observacoes: "", ocorrencias: [] };
      salvar();
    }
    const f = $("#form-visita");
    f.unidade.value = rascunho.unidade;
    f.chegada.value = rascunho.chegada;
    f.saida.value = rascunho.saida;
    f.observacoes.value = rascunho.observacoes;
    f.querySelector(`[name=situacao][value=${rascunho.situacao}]`).checked = true;
    $("#visita-erro").textContent = "";
    renderOcorrencias();
    atualizarPermanencia();
    mostrar("#vmo-inicio", false);
    mostrar(f, true);
    window.scrollTo(0, 0);
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

  async function carregarMinhasVisitas() {
    const el = $("#minhas-visitas");
    el.innerHTML = `<p class="dica">Carregando...</p>`;
    const { data, error } = await sb.from("visitas").select("*").eq("autor", Estado.usuario.id).order("chegada", { ascending: false }).limit(30);
    if (error) { el.innerHTML = `<p class="erro">${esc(error.message)}</p>`; return; }
    if (!data.length) { el.innerHTML = `<p class="dica">Nenhuma visita registrada ainda.</p>`; return; }
    el.innerHTML = data.map((v, i) => `
      <div class="item-visita" data-i="${i}">
        <div><strong>${esc(v.unidade)}</strong><small>${fmtDataHora(v.chegada)} → ${fmtHora(v.saida)} · ${fmtDuracao(minutosEntre(v.chegada, v.saida))}</small></div>
        <div>${v.tem_anormalidade ? `<span class="selo anormal">⚠️ ${v.anomalias.length}</span>` : `<span class="selo normal">Normal</span>`}</div>
      </div>`).join("");
    $$(".item-visita", el).forEach((it) => it.onclick = () => abrirDetalheVisita(data[it.dataset.i]));
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
    $("#btn-chegada").onclick = () => { f.chegada.value = paraInputLocal(new Date()); f.chegada.dispatchEvent(new Event("input", { bubbles: true })); };
    $("#btn-saida").onclick = () => { f.saida.value = paraInputLocal(new Date()); f.saida.dispatchEvent(new Event("input", { bubbles: true })); };
    $("#btn-add-ocorrencia").onclick = () => { rascunho.ocorrencias.push(novaOcorrencia()); salvar(); renderOcorrencias(); };
    f.addEventListener("input", (e) => {
      if (!rascunho) return;
      const t = e.target;
      if (["unidade", "chegada", "saida", "observacoes"].includes(t.name)) rascunho[t.name] = t.value;
      if (t.dataset.campo) {
        const o = rascunho.ocorrencias.find((x) => x.oid === t.closest("[data-oid]").dataset.oid);
        o[t.dataset.campo] = t.value;
      }
      if (t.name === "chegada" || t.name === "saida") atualizarPermanencia();
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
    });
    f.addEventListener("submit", enviar);
  }

  return { iniciar, ligarEventos };
})();

/* Detalhe de uma visita (usado pelo VMO e pelo administrador) */
async function abrirDetalheVisita(v, { admin = false } = {}) {
  const fotos = (v.anomalias || []).flatMap((a) => a.fotos || []);
  abrirModal(`<p class="dica">Carregando...</p>`);
  const urls = await urlsAssinadas(fotos);
  const min = minutosEntre(v.chegada, v.saida);
  abrirModal(`
    <h2>${esc(v.unidade)}</h2>
    <div class="detalhe-grid">
      <div><b>VMO</b>${esc(v.vigilante)}</div>
      <div><b>Chegada</b>${fmtDataHora(v.chegada)}</div>
      <div><b>Saída</b>${fmtDataHora(v.saida)}</div>
      <div><b>Permanência</b>${fmtDuracao(min)}</div>
      <div><b>Situação</b>${v.tem_anormalidade ? `<span class="selo anormal">Com anormalidade</span>` : `<span class="selo normal">Normal</span>`}</div>
      <div><b>Enviado em</b>${fmtDataHora(v.enviado_em || v.criado_em)}</div>
    </div>
    ${(v.anomalias || []).map((a, i) => `
      <div class="ocorrencia">
        <div class="ocorrencia-topo"><strong>Anormalidade ${i + 1}: ${esc(a.categoria)}</strong><span class="selo g-${esc(a.gravidade)}">${esc(a.gravidade)}</span></div>
        <p>${esc(a.descricao)}</p>
        <div class="fotos-grid">${(a.fotos || []).map((p) => urls[p] ? `<img src="${esc(urls[p])}" alt="Foto da anormalidade" data-ampliar />` : `<span class="dica">Foto indisponível</span>`).join("")}</div>
      </div>`).join("")}
    <h3>Resumo / observações</h3>
    <p>${esc(v.observacoes || "—").replace(/\n/g, "<br>")}</p>
    <div class="filtros-acoes" style="margin-top:1rem">
      <button class="btn primario" id="btn-imprimir-visita">🖨️ Imprimir esta visita</button>
      ${admin ? `<button class="btn perigo" id="btn-excluir-visita">🗑️ Excluir visita</button>` : ""}
    </div>`);
  $$("#modal-conteudo [data-ampliar]").forEach((img) => img.onclick = () => window.open(img.src, "_blank"));
  $("#btn-imprimir-visita").onclick = () => imprimirVisitas([v], urls, `Visita — ${v.unidade}`);
  if (admin) $("#btn-excluir-visita").onclick = () => Admin.excluirVisita(v);
}

/* Relatório detalhado de visitas (com fotos) para impressão */
function imprimirVisitas(lista, urls, titulo) {
  $("#relatorio").innerHTML = `
    <div class="rel-cab"><div><h1>${esc(titulo)}</h1><div>Relatório de visitas operacionais — VMO</div></div>
    <div>Emitido em ${fmtDataHora(new Date())}<br>por ${esc(Estado.perfil?.nome || "")}</div></div>
    ${lista.map((v) => `
      <div class="rel-visita">
        <strong>${esc(v.unidade)}</strong> — VMO: ${esc(v.vigilante)}<br>
        Chegada: ${fmtDataHora(v.chegada)} · Saída: ${fmtDataHora(v.saida)} · Permanência: ${fmtDuracao(minutosEntre(v.chegada, v.saida))}
        · Situação: <b>${v.tem_anormalidade ? "COM ANORMALIDADE" : "Normal"}</b>
        ${(v.anomalias || []).map((a, i) => `
          <div style="margin-top:4px"><b>${i + 1}. ${esc(a.categoria)}</b> (${esc(a.gravidade)}): ${esc(a.descricao)}
          <div class="rel-fotos">${(a.fotos || []).filter((p) => urls[p]).map((p) => `<img src="${esc(urls[p])}">`).join("")}</div></div>`).join("")}
        <div style="margin-top:4px"><b>Resumo:</b> ${esc(v.observacoes || "—")}</div>
      </div>`).join("")}
    <div class="rel-assinaturas"><div>Vigilante (VMO)</div><div>Supervisão / Gestor</div></div>`;
  esperarImagensEImprimir();
}

function esperarImagensEImprimir() {
  const imgs = $$("#relatorio img");
  Promise.all(imgs.map((i) => i.complete ? 1 : new Promise((ok) => { i.onload = i.onerror = ok; })))
    .then(() => setTimeout(() => window.print(), 100));
}
