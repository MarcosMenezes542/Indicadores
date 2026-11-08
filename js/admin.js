/* Painel do administrador: indicadores, gráficos, visitas, usuários e unidades */
const Admin = (() => {
  let visitas = [];     // visitas do período carregado
  let perfis = [];
  let graficos = {};
  let ordem = { campo: "chegada", desc: true };
  const extra = { vmo: "", unidade: "", categoria: "", gravidade: "", dia: "", hora: "", geo: "" }; // filtros vindos de cliques nos gráficos

  const CORES = ["#0b4f8a", "#2a9d8f", "#e76f51", "#f4a261", "#8e5ea2", "#3a86ff", "#e9c46a", "#6a994e", "#bc4749", "#577590", "#ff7aa2", "#7f8c8d", "#219ebc", "#9c6644"];
  const COR_GRAV = { "Baixa": "#3a86ff", "Média": "#e0b000", "Alta": "#e76f51", "Crítica": "#b3261e" };

  /* ---------- Inicialização ---------- */
  async function iniciar() {
    const hoje = new Date();
    const de = new Date(hoje); de.setDate(de.getDate() - 29);
    $("#f-de").value = chaveDia(de);
    $("#f-ate").value = chaveDia(hoje);
    $("#f-gravidade").innerHTML = `<option value="">Todas</option>` + CFG.GRAVIDADES.map((g) => `<option>${g}</option>`).join("");
    $("#f-categoria").innerHTML = `<option value="">Todas</option>` + CFG.CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join("");
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    $("#link-publico").value = base;
    $("#link-admin").textContent = base + "admin.html";
    $("#btn-whats").href = `https://wa.me/?text=${encodeURIComponent('Aplicativo VMO para registro das visitas operacionais. Abra o link, toque em "Instalar aplicativo" e entre com o seu usuário e senha: ' + base)}`;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = "#5f6b7a";
    const leitura = somenteLeitura();
    $$("[data-so-admin]").forEach((el) => mostrar(el, !leitura));
    mostrar("#aviso-leitura", leitura);
    trocarAba("painel");
    await Promise.all([leitura ? null : carregarPerfis(), carregarVisitas()]);
    if (!leitura) renderUnidades();
  }

  const somenteLeitura = () => Estado.perfil?.papel !== "admin";

  function trocarAba(aba) {
    if (somenteLeitura() && (aba === "usuarios" || aba === "unidades")) aba = "painel";
    $$("#nav-admin button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === aba));
    ["painel", "visitas", "usuarios", "unidades"].forEach((a) => mostrar(`#aba-${a}`, a === aba));
    mostrar("#filtros", aba === "painel" || aba === "visitas");
    mostrar("#filtro-ativo", aba === "painel" || aba === "visitas");
    if (aba === "painel") renderPainel();
  }

  /* ---------- Dados ---------- */
  async function carregarVisitas() {
    carregando(true, "Carregando visitas...");
    try {
      const de = $("#f-de").value, ate = $("#f-ate").value;
      let q = sb.from("visitas").select("*").order("chegada", { ascending: false });
      if (de) q = q.gte("chegada", new Date(de + "T00:00:00").toISOString());
      if (ate) q = q.lt("chegada", new Date(new Date(ate + "T00:00:00").getTime() + 86400000).toISOString());
      // paginação de 1000 em 1000
      const todos = [];
      for (let i = 0; ; i += 1000) {
        const { data, error } = await q.range(i, i + 999);
        if (error) throw error;
        todos.push(...data);
        if (data.length < 1000) break;
      }
      visitas = todos;
      calcularReferenciasAuto(visitas);
      preencherFiltros();
      atualizarTudo();
    } catch (e) {
      aviso("Erro ao carregar visitas: " + e.message, true);
    } finally {
      carregando(false);
    }
  }

  function preencherFiltros() {
    const manter = (sel, valores, rotulo) => {
      const el = $(sel), atual = el.value;
      el.innerHTML = `<option value="">${rotulo}</option>` + valores.map((v) => `<option ${v === atual ? "selected" : ""}>${esc(v)}</option>`).join("");
    };
    const vmos = [...new Set([...visitas.map((v) => v.vigilante), ...perfis.filter((p) => p.papel === "vigilante").map((p) => p.nome)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const unids = [...new Set([...visitas.map((v) => v.unidade), ...Estado.unidades])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    manter("#f-vmo", vmos, "Todos");
    manter("#f-unidade", unids, "Todas");
  }

  function filtrar() {
    const f = {
      vmo: $("#f-vmo").value || extra.vmo,
      unidade: $("#f-unidade").value || extra.unidade,
      situacao: $("#f-situacao").value,
      gravidade: $("#f-gravidade").value || extra.gravidade,
      categoria: $("#f-categoria").value || extra.categoria,
      geo: $("#f-geo").value || extra.geo,
    };
    const busca = ($("#busca").value || "").trim().toLowerCase();
    return visitas.filter((v) => {
      if (f.vmo && v.vigilante !== f.vmo) return false;
      if (f.unidade && v.unidade !== f.unidade) return false;
      if (f.situacao === "anormal" && !v.tem_anormalidade) return false;
      if (f.situacao === "normal" && v.tem_anormalidade) return false;
      if (f.gravidade && !(v.anomalias || []).some((a) => a.gravidade === f.gravidade)) return false;
      if (f.categoria && !(v.anomalias || []).some((a) => a.categoria === f.categoria)) return false;
      if (extra.dia && chaveDia(v.chegada) !== extra.dia) return false;
      if (extra.hora !== "" && faixaHora(v.chegada) !== extra.hora) return false;
      if (f.geo && verificarGeo(v.geo_chegada, v.unidade).codigo !== f.geo) return false;
      if (busca) {
        const txt = [v.vigilante, v.unidade, v.observacoes, ...(v.anomalias || []).flatMap((a) => [a.categoria, a.descricao])].join(" ").toLowerCase();
        if (!txt.includes(busca)) return false;
      }
      return true;
    });
  }

  function descreverFiltroExtra() {
    const partes = [];
    if (extra.vmo) partes.push(`VMO: ${extra.vmo}`);
    if (extra.unidade) partes.push(`Unidade: ${extra.unidade}`);
    if (extra.categoria) partes.push(`Categoria: ${extra.categoria}`);
    if (extra.gravidade) partes.push(`Gravidade: ${extra.gravidade}`);
    if (extra.dia) partes.push(`Dia: ${fmtData(extra.dia + "T12:00")}`);
    if (extra.hora !== "") partes.push(`Horário: ${extra.hora}`);
    if (extra.geo) partes.push(`GPS: ${ROTULO_GEO[extra.geo]}`);
    $("#filtro-ativo").innerHTML = partes.length
      ? `🔎 Filtro do gráfico: <b>${esc(partes.join(" · "))}</b> <button class="btn-link" id="limpar-extra">remover</button>` : "";
    const b = $("#limpar-extra");
    if (b) b.onclick = () => { Object.keys(extra).forEach((k) => extra[k] = ""); atualizarTudo(); };
  }

  function atualizarTudo() {
    descreverFiltroExtra();
    if (!$("#aba-painel").classList.contains("oculto")) renderPainel();
    renderTabela();
    if (!somenteLeitura()) renderUsuarios();
  }

  /* ---------- Painel / gráficos ---------- */
  const faixaHora = (d) => { const h = new Date(d).getHours(); const ini = Math.floor(h / 3) * 3; return `${String(ini).padStart(2, "0")}h–${String(ini + 3).padStart(2, "0")}h`; };
  const contar = (arr, fn) => arr.reduce((m, x) => { [].concat(fn(x)).forEach((k) => { if (k != null) m[k] = (m[k] || 0) + 1; }); return m; }, {});
  const ordenarObj = (o, lim) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, lim);

  function renderPainel() {
    const lista = filtrar();
    const ocorr = lista.flatMap((v) => v.anomalias || []);
    const comAnorm = lista.filter((v) => v.tem_anormalidade).length;
    const durs = lista.map((v) => minutosEntre(v.chegada, v.saida)).filter((m) => m >= 0);
    const media = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    const criticas = ocorr.filter((a) => a.gravidade === "Crítica").length;
    const geoCont = contar(lista, (v) => verificarGeo(v.geo_chegada, v.unidade).codigo);
    const geoOk = geoCont.ok || 0;
    const kpis = [
      ["Visitas no período", lista.length, ""],
      ["Com anormalidade", `${comAnorm} <small>(${lista.length ? Math.round(comAnorm * 100 / lista.length) : 0}%)</small>`, "alerta"],
      ["Visitas normais", lista.length - comAnorm, "ok"],
      ["Anormalidades registradas", ocorr.length, "alerta"],
      ["Críticas", criticas, "alerta"],
      ["Tempo médio na unidade", fmtDuracao(media), ""],
      ["VMOs em atividade", new Set(lista.map((v) => v.vigilante)).size, ""],
      ["Unidades visitadas", new Set(lista.map((v) => v.unidade)).size, ""],
      ["📍 Confirmadas por GPS", `${geoOk} <small>(${lista.length ? Math.round(geoOk * 100 / lista.length) : 0}%)</small>`, "ok"],
      ["⚠️ Fora da unidade", geoCont.longe || 0, "alerta"],
    ];
    $("#kpis").innerHTML = kpis.map(([n, v, c]) => `<div class="kpi ${c}"><div class="valor">${v}</div><div class="nome">${n}</div></div>`).join("");

    // Visitas por dia (empilhado: normal x com anormalidade)
    const dias = [];
    const de = new Date(($("#f-de").value || chaveDia(lista.at(-1)?.chegada || new Date())) + "T12:00");
    const ate = new Date(($("#f-ate").value || chaveDia(new Date())) + "T12:00");
    for (let d = new Date(de); d <= ate && dias.length < 400; d.setDate(d.getDate() + 1)) dias.push(chaveDia(d));
    const porDiaN = contar(lista.filter((v) => !v.tem_anormalidade), (v) => chaveDia(v.chegada));
    const porDiaA = contar(lista.filter((v) => v.tem_anormalidade), (v) => chaveDia(v.chegada));
    grafico("g-dia", {
      type: "bar",
      data: {
        labels: dias.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)),
        datasets: [
          { label: "Normal", data: dias.map((d) => porDiaN[d] || 0), backgroundColor: "#2a9d8f", stack: "s" },
          { label: "Com anormalidade", data: dias.map((d) => porDiaA[d] || 0), backgroundColor: "#e76f51", stack: "s" },
        ],
      },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
      clique: (i) => { extra.dia = extra.dia === dias[i] ? "" : dias[i]; atualizarTudo(); },
    });

    const barraH = (id, pares, cor, chave, rotulo = "Visitas") => grafico(id, {
      type: "bar",
      data: { labels: pares.map((p) => p[0]), datasets: [{ label: rotulo, data: pares.map((p) => p[1]), backgroundColor: cor, borderRadius: 4 }] },
      options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } },
      clique: chave && ((i) => { extra[chave] = extra[chave] === pares[i][0] ? "" : pares[i][0]; atualizarTudo(); }),
    });

    barraH("g-vmo", ordenarObj(contar(lista, (v) => v.vigilante), 15), "#0b4f8a", "vmo");
    barraH("g-unidade", ordenarObj(contar(lista, (v) => v.unidade), 15), "#3a86ff", "unidade");

    const cats = ordenarObj(contar(ocorr, (a) => a.categoria), 12);
    grafico("g-categoria", {
      type: "doughnut",
      data: { labels: cats.map((c) => c[0]), datasets: [{ data: cats.map((c) => c[1]), backgroundColor: CORES }] },
      options: { cutout: "55%", plugins: { legend: { position: "right", labels: { boxWidth: 12 } } } },
      clique: (i) => { extra.categoria = extra.categoria === cats[i][0] ? "" : cats[i][0]; atualizarTudo(); },
      vazio: !cats.length,
    });

    const grav = contar(ocorr, (a) => a.gravidade);
    const gl = CFG.GRAVIDADES.filter((g) => grav[g]);
    grafico("g-gravidade", {
      type: "pie",
      data: { labels: gl, datasets: [{ data: gl.map((g) => grav[g]), backgroundColor: gl.map((g) => COR_GRAV[g]) }] },
      options: { plugins: { legend: { position: "right" } } },
      clique: (i) => { extra.gravidade = extra.gravidade === gl[i] ? "" : gl[i]; atualizarTudo(); },
      vazio: !gl.length,
    });

    const somas = {};
    lista.forEach((v) => { const m = minutosEntre(v.chegada, v.saida); if (m >= 0) { (somas[v.unidade] ||= []).push(m); } });
    const tempos = Object.entries(somas).map(([u, a]) => [u, Math.round(a.reduce((x, y) => x + y, 0) / a.length)]).sort((a, b) => b[1] - a[1]).slice(0, 15);
    barraH("g-tempo", tempos, "#8e5ea2", "unidade", "Minutos");

    const faixas = ["00h–03h", "03h–06h", "06h–09h", "09h–12h", "12h–15h", "15h–18h", "18h–21h", "21h–24h"];
    const porHora = contar(lista, (v) => faixaHora(v.chegada));
    grafico("g-hora", {
      type: "line",
      data: { labels: faixas, datasets: [{ label: "Visitas", data: faixas.map((f) => porHora[f] || 0), borderColor: "#0b4f8a", backgroundColor: "#0b4f8a33", fill: true, tension: .35, pointRadius: 5 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      clique: (i) => { extra.hora = extra.hora === faixas[i] ? "" : faixas[i]; atualizarTudo(); },
    });

    const cods = ["ok", "longe", "sem_ref", "sem_gps"].filter((c) => geoCont[c]);
    grafico("g-geo", {
      type: "doughnut",
      data: { labels: cods.map((c) => ROTULO_GEO[c]), datasets: [{ data: cods.map((c) => geoCont[c]), backgroundColor: cods.map((c) => ({ ok: "#2a9d8f", longe: "#e76f51", sem_ref: "#e0b000", sem_gps: "#9aa5b1" })[c]) }] },
      options: { cutout: "55%", plugins: { legend: { position: "right" } } },
      clique: (i) => { extra.geo = extra.geo === cods[i] ? "" : cods[i]; atualizarTudo(); },
      vazio: !cods.length,
    });
  }

  function grafico(id, { type, data, options = {}, clique, vazio }) {
    graficos[id]?.destroy();
    const canvas = $("#" + id);
    if (vazio) {
      data = { labels: ["Sem anormalidades no período"], datasets: [{ data: [1], backgroundColor: ["#e3e8ef"] }] };
      clique = null;
    }
    graficos[id] = new Chart(canvas, {
      type, data,
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        interaction: { mode: "nearest", intersect: true },
        onClick: (_, els) => { if (clique && els.length) { const i = els[0].index; setTimeout(() => clique(i), 0); } },
        onHover: (e, els) => { e.native.target.style.cursor = clique && els.length ? "pointer" : "default"; },
        ...options,
        plugins: { tooltip: { enabled: !vazio }, ...(options.plugins || {}) },
      },
    });
  }

  /* ---------- Tabela de visitas ---------- */
  function renderTabela() {
    const lista = filtrar();
    const c = ordem.campo;
    const val = (v) => c === "permanencia" ? minutosEntre(v.chegada, v.saida) : c === "ocorrencias" ? (v.anomalias || []).length : c === "geo" ? (verificarGeo(v.geo_chegada, v.unidade).dist ?? 1e12) : (v[c] ?? "");
    lista.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * (ordem.desc ? -1 : 1); });
    const col = (campo, nome) => `<th data-ordem="${campo}">${nome}${ordem.campo === campo ? (ordem.desc ? " ▼" : " ▲") : ""}</th>`;
    $("#tabela-visitas").innerHTML = `
      <thead><tr>${col("chegada", "Chegada")}${col("saida", "Saída")}${col("permanencia", "Permanência")}${col("vigilante", "VMO")}${col("unidade", "Unidade")}${col("tem_anormalidade", "Situação")}${col("ocorrencias", "Anormalidades")}${col("geo", "📍 GPS")}<th>Ações</th></tr></thead>
      <tbody>${lista.map((v) => `
        <tr>
          <td>${fmtDataHora(v.chegada)}</td><td>${fmtDataHora(v.saida)}</td><td>${fmtDuracao(minutosEntre(v.chegada, v.saida))}</td>
          <td>${esc(v.vigilante)}</td><td>${esc(v.unidade)}</td>
          <td>${v.tem_anormalidade ? `<span class="selo anormal">Anormal</span>` : `<span class="selo normal">Normal</span>`}</td>
          <td>${(v.anomalias || []).map((a) => `<span class="selo g-${esc(a.gravidade)}" title="${esc(a.descricao)}">${esc(a.categoria)}</span>`).join(" ")}</td>
          <td>${(() => { const g = verificarGeo(v.geo_chegada, v.unidade); return `<span class="selo ${g.classe}" title="${esc(g.detalhe || "")}">${g.icone} ${esc(g.rotulo)}</span>`; })()}</td>
          <td class="acoes"><button class="btn peq" data-ver="${v.id}">Ver</button></td>
        </tr>`).join("") || `<tr><td colspan="9" class="dica">Nenhuma visita encontrada com os filtros atuais.</td></tr>`}
      </tbody>`;
    $$("#tabela-visitas [data-ordem]").forEach((th) => th.onclick = () => {
      ordem = { campo: th.dataset.ordem, desc: ordem.campo === th.dataset.ordem ? !ordem.desc : true };
      renderTabela();
    });
    $$("#tabela-visitas [data-ver]").forEach((b) => b.onclick = () => abrirDetalheVisita(visitas.find((v) => v.id === b.dataset.ver), { admin: !somenteLeitura() }));
  }

  async function excluirVisita(v) {
    if (!confirm(`Excluir definitivamente a visita de ${v.vigilante} em ${v.unidade} (${fmtDataHora(v.chegada)})?`)) return;
    carregando(true, "Excluindo...");
    const fotos = (v.anomalias || []).flatMap((a) => a.fotos || []);
    if (fotos.length) await sb.storage.from(CFG.BUCKET).remove(fotos);
    const { error } = await sb.from("visitas").delete().eq("id", v.id);
    carregando(false);
    if (error) return aviso(error.message, true);
    visitas = visitas.filter((x) => x.id !== v.id);
    calcularReferenciasAuto(visitas);
    fecharModal();
    atualizarTudo();
    aviso("Visita excluída.");
  }

  /* ---------- Exportação ---------- */
  function linhasVisitas(lista) {
    return lista.map((v) => ({
      "Data": fmtData(v.chegada),
      "Chegada": fmtDataHora(v.chegada),
      "Saída": fmtDataHora(v.saida),
      "Permanência (min)": minutosEntre(v.chegada, v.saida),
      "VMO": v.vigilante,
      "Unidade": v.unidade,
      "Situação": v.tem_anormalidade ? "Com anormalidade" : "Normal",
      "Qtd. anormalidades": (v.anomalias || []).length,
      "Anormalidades": (v.anomalias || []).map((a) => `${a.categoria} (${a.gravidade}): ${a.descricao}`).join(" | "),
      "Qtd. fotos": (v.anomalias || []).reduce((s, a) => s + (a.fotos || []).length, 0),
      "Verificação GPS": ROTULO_GEO[verificarGeo(v.geo_chegada, v.unidade).codigo].replace(/^\S+\s/, ""),
      "Distância da unidade (m)": (() => { const d = verificarGeo(v.geo_chegada, v.unidade).dist; return d == null ? "" : Math.round(d); })(),
      "Latitude chegada": v.geo_chegada?.lat ?? "", "Longitude chegada": v.geo_chegada?.lng ?? "", "Precisão chegada (m)": v.geo_chegada?.precisao ?? "",
      "Latitude saída": v.geo_saida?.lat ?? "", "Longitude saída": v.geo_saida?.lng ?? "",
      "Obs. GPS": v.geo_chegada?.erro || "",
      "Resumo / observações": v.observacoes || "",
      "Enviado em": fmtDataHora(v.enviado_em || v.criado_em),
      "ID": v.id,
    }));
  }
  function linhasOcorrencias(lista) {
    return lista.flatMap((v) => (v.anomalias || []).map((a, i) => ({
      "Data": fmtData(v.chegada), "Chegada": fmtDataHora(v.chegada), "VMO": v.vigilante, "Unidade": v.unidade,
      "Nº": i + 1, "Categoria": a.categoria, "Gravidade": a.gravidade, "Descrição": a.descricao, "Qtd. fotos": (a.fotos || []).length, "ID visita": v.id,
    })));
  }
  const nomeArquivo = (ext) => `visitas-vmo_${$("#f-de").value || "inicio"}_a_${$("#f-ate").value || "hoje"}.${ext}`;

  function exportarCSV() {
    const linhas = linhasVisitas(filtrar());
    if (!linhas.length) return aviso("Nada para exportar.", true);
    const cab = Object.keys(linhas[0]);
    const cel = (x) => `"${String(x ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    const csv = "﻿" + [cab.map(cel).join(";"), ...linhas.map((l) => cab.map((k) => cel(l[k])).join(";"))].join("\r\n");
    baixarArquivo(nomeArquivo("csv"), csv, "text/csv;charset=utf-8");
  }

  function exportarExcel() {
    if (!window.XLSX) return aviso("Biblioteca do Excel ainda carregando, tente novamente.", true);
    const lista = filtrar();
    if (!lista.length) return aviso("Nada para exportar.", true);
    const wb = XLSX.utils.book_new();
    const add = (nome, linhas) => {
      const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ "Sem dados": "" }]);
      ws["!cols"] = Object.keys(linhas[0] || {}).map((k) => ({ wch: Math.min(60, Math.max(k.length + 2, ...linhas.slice(0, 200).map((l) => String(l[k] ?? "").length))) }));
      XLSX.utils.book_append_sheet(wb, ws, nome);
    };
    add("Visitas", linhasVisitas(lista));
    add("Anormalidades", linhasOcorrencias(lista));
    const resumo = Object.entries(contar(lista, (v) => v.vigilante)).map(([vmo, n]) => ({
      "VMO": vmo, "Visitas": n,
      "Com anormalidade": lista.filter((v) => v.vigilante === vmo && v.tem_anormalidade).length,
      "Tempo médio (min)": Math.round(lista.filter((v) => v.vigilante === vmo).reduce((s, v) => s + minutosEntre(v.chegada, v.saida), 0) / n),
    }));
    add("Resumo por VMO", resumo);
    XLSX.writeFile(wb, nomeArquivo("xlsx"));
  }

  async function imprimirRelatorio() {
    const lista = filtrar();
    if (!lista.length) return aviso("Nada para imprimir com os filtros atuais.", true);
    const incluirFotos = lista.some((v) => v.tem_anormalidade) && confirm("Incluir as fotos das anormalidades no relatório?\n(OK = sim, Cancelar = somente dados)");
    // garante que os gráficos estão desenhados
    const abaAtual = $("#nav-admin button.ativo")?.dataset.aba;
    if (abaAtual !== "painel") { mostrar("#aba-painel", true); renderPainel(); }
    await new Promise((r) => setTimeout(r, 450));
    const imgs = Object.fromEntries(Object.entries(graficos).map(([id, g]) => [id, g.toBase64Image("image/png", 1)]));
    if (abaAtual !== "painel") mostrar("#aba-painel", false);
    const titulos = { "g-dia": "Visitas por dia", "g-vmo": "Visitas por VMO", "g-unidade": "Visitas por unidade", "g-categoria": "Anormalidades por categoria", "g-gravidade": "Anormalidades por gravidade", "g-tempo": "Tempo médio por unidade (min)", "g-hora": "Visitas por faixa de horário", "g-geo": "Verificação por GPS (chegada)" };
    let urls = {};
    if (incluirFotos) { carregando(true, "Preparando fotos..."); urls = await urlsAssinadas(lista.flatMap((v) => (v.anomalias || []).flatMap((a) => a.fotos || []))); carregando(false); }
    const filtrosTxt = [
      `Período: ${fmtData($("#f-de").value + "T12:00")} a ${fmtData($("#f-ate").value + "T12:00")}`,
      $("#f-vmo").value && `VMO: ${$("#f-vmo").value}`, $("#f-unidade").value && `Unidade: ${$("#f-unidade").value}`,
      $("#f-situacao").value && `Situação: ${$("#f-situacao").selectedOptions[0].text}`,
      $("#f-gravidade").value && `Gravidade: ${$("#f-gravidade").value}`, $("#f-categoria").value && `Categoria: ${$("#f-categoria").value}`,
    ].filter(Boolean).join(" · ");
    const anormais = lista.filter((v) => v.tem_anormalidade);
    $("#relatorio").innerHTML = `
      <div class="rel-cab"><div><h1>Relatório de Visitas Operacionais — VMO</h1><div>${esc(filtrosTxt)}</div><div>${esc($("#filtro-ativo").textContent.replace("remover", ""))}</div></div>
      <div style="text-align:right">Emitido em ${fmtDataHora(new Date())}<br>por ${esc(Estado.perfil.nome)}</div></div>
      <h2>Indicadores</h2>
      <div class="rel-kpis">${$$("#kpis .kpi").map((k) => `<div><b>${k.querySelector(".valor").innerHTML}</b>${k.querySelector(".nome").textContent}</div>`).join("")}</div>
      <h2>Gráficos</h2>
      <div class="rel-graficos">${Object.entries(imgs).map(([id, src]) => `<figure><figcaption>${titulos[id]}</figcaption><img src="${src}"></figure>`).join("")}</div>
      <h2>Visitas (${lista.length})</h2>
      <table><thead><tr><th>Chegada</th><th>Saída</th><th>Perm.</th><th>VMO</th><th>Unidade</th><th>Situação</th><th>Anormalidades</th><th>GPS</th><th>Resumo</th></tr></thead>
      <tbody>${lista.slice().sort((a, b) => new Date(a.chegada) - new Date(b.chegada)).map((v) => `<tr>
        <td>${fmtDataHora(v.chegada)}</td><td>${fmtDataHora(v.saida)}</td><td>${fmtDuracao(minutosEntre(v.chegada, v.saida))}</td>
        <td>${esc(v.vigilante)}</td><td>${esc(v.unidade)}</td><td>${v.tem_anormalidade ? "<b>Anormal</b>" : "Normal"}</td>
        <td>${(v.anomalias || []).map((a) => `${esc(a.categoria)} (${esc(a.gravidade)})`).join("; ")}</td><td>${(() => { const g = verificarGeo(v.geo_chegada, v.unidade); return `${g.icone} ${esc(g.rotulo)}`; })()}</td><td>${esc(v.observacoes || "")}</td></tr>`).join("")}</tbody></table>
      ${anormais.length ? `<h2>Detalhamento das anormalidades (${anormais.length} visitas)</h2>
        ${anormais.map((v) => `<div class="rel-visita"><strong>${esc(v.unidade)}</strong> — ${esc(v.vigilante)} — ${fmtDataHora(v.chegada)} a ${fmtHora(v.saida)}
          ${(v.anomalias || []).map((a, i) => `<div style="margin-top:3px"><b>${i + 1}. ${esc(a.categoria)}</b> (${esc(a.gravidade)}): ${esc(a.descricao)}
          ${incluirFotos ? `<div class="rel-fotos">${(a.fotos || []).filter((p) => urls[p]).map((p) => `<img src="${esc(urls[p])}">`).join("")}</div>` : ""}</div>`).join("")}
          ${v.observacoes ? `<div style="margin-top:3px"><b>Resumo:</b> ${esc(v.observacoes)}</div>` : ""}</div>`).join("")}` : ""}
      <div class="rel-assinaturas"><div>Responsável pela emissão</div><div>Gestor do contrato</div></div>`;
    esperarImagensEImprimir();
  }

  /* ---------- Usuários ---------- */
  async function carregarPerfis() {
    try {
      perfis = (await chamarFuncao({ acao: "listar" })).usuarios;
    } catch (e) {
      // reserva: lê direto da tabela (sem a data do último acesso)
      const { data, error } = await sb.from("perfis").select("*").order("nome");
      if (error) return aviso("Erro ao carregar usuários: " + error.message, true);
      perfis = data;
    }
    renderUsuarios();
  }

  function renderUsuarios() {
    const n = contar(visitas, (v) => v.vigilante);
    const busca = ($("#u-busca").value || "").trim().toLowerCase();
    const papel = $("#u-papel").value, status = $("#u-status").value;
    const lista = perfis.filter((p) =>
      (!busca || `${p.nome} ${p.login}`.toLowerCase().includes(busca)) &&
      (!papel || p.papel === papel) &&
      (!status || (status === "ativo") === !!p.ativo));
    const vmos = perfis.filter((p) => p.papel === "vigilante");
    $("#resumo-usuarios").innerHTML = [
      ["Usuários", perfis.length, ""], ["VMOs ativos", vmos.filter((p) => p.ativo).length, "ok"],
      ["Gestores", perfis.filter((p) => p.papel === "gestor").length, ""], ["Administradores", perfis.filter((p) => p.papel === "admin").length, ""], ["Inativos", perfis.filter((p) => !p.ativo).length, "alerta"],
    ].map(([t, v, c]) => `<div class="kpi ${c}"><div class="valor">${v}</div><div class="nome">${t}</div></div>`).join("");
    const eu = Estado.usuario?.id;
    $("#tabela-usuarios").innerHTML = `
      <thead><tr><th>Nome</th><th>Usuário (login)</th><th>Perfil</th><th>Status</th><th>Último acesso</th><th>Visitas no período</th><th>Criado em</th><th>Ações</th></tr></thead>
      <tbody>${lista.map((p) => `<tr>
        <td>${esc(p.nome)}${p.id === eu ? " <small>(você)</small>" : ""}</td><td><code>${esc(p.login)}</code></td>
        <td>${nomePapel(p.papel)}</td>
        <td><span class="selo ${p.ativo ? "ativo" : "inativo"}">${p.ativo ? "Ativo" : "Inativo"}</span></td>
        <td>${"ultimo_acesso" in p ? (p.ultimo_acesso ? fmtDataHora(p.ultimo_acesso) : "Nunca entrou") : "—"}</td>
        <td>${n[p.nome] || 0}</td><td>${fmtData(p.criado_em)}</td>
        <td class="acoes">
          <button class="btn peq" data-editar="${p.id}">✏️ Editar</button>
          <button class="btn peq" data-senha="${p.id}">🔑 Senha</button>
          ${p.id === eu ? "" : `<button class="btn peq" data-alternar="${p.id}">${p.ativo ? "⛔ Desativar" : "✅ Ativar"}</button>
          <button class="btn peq perigo" data-excluir="${p.id}" title="Excluir">🗑️</button>`}
        </td>
      </tr>`).join("") || `<tr><td colspan="8" class="dica">Nenhum usuário encontrado.</td></tr>`}</tbody>`;
    const achar = (id) => perfis.find((p) => p.id === id);
    $$("#tabela-usuarios [data-editar]").forEach((b) => b.onclick = () => editarUsuario(achar(b.dataset.editar)));
    $$("#tabela-usuarios [data-senha]").forEach((b) => b.onclick = () => b.dataset.senha === eu ? abrirMinhaConta() : trocarSenha(achar(b.dataset.senha)));
    $$("#tabela-usuarios [data-alternar]").forEach((b) => b.onclick = () => alternarAtivo(achar(b.dataset.alternar)));
    $$("#tabela-usuarios [data-excluir]").forEach((b) => b.onclick = () => excluirUsuario(achar(b.dataset.excluir)));
  }

  async function alternarAtivo(p) {
    const verbo = p.ativo ? "desativar" : "ativar";
    if (!confirm(`Deseja ${verbo} o usuário ${p.nome}?${p.ativo ? "\nEle não conseguirá mais entrar no aplicativo." : ""}`)) return;
    carregando(true, "Salvando...");
    try {
      await chamarFuncao({ acao: "atualizar", id: p.id, nome: p.nome, papel: p.papel, ativo: !p.ativo });
      aviso(`Usuário ${p.ativo ? "desativado" : "ativado"}.`);
      await carregarPerfis();
    } catch (e) { aviso(e.message, true); } finally { carregando(false); }
  }

  async function excluirUsuario(p) {
    if (!confirm(`Excluir definitivamente o usuário ${p.nome} (${p.login})?\n\nAs visitas registradas por ele serão mantidas.\nSe quiser apenas bloquear o acesso, use "Desativar".`)) return;
    carregando(true, "Excluindo...");
    try {
      await chamarFuncao({ acao: "excluir", id: p.id });
      aviso("Usuário excluído.");
      await carregarPerfis();
    } catch (e) { aviso(e.message, true); } finally { carregando(false); }
  }

  async function chamarFuncao(corpo) {
    const { data, error } = await sb.functions.invoke("gerenciar-usuarios", { body: corpo });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).erro || msg; } catch {}
      throw new Error(msg);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  async function criarUsuario(ev) {
    ev.preventDefault();
    const f = ev.target, msg = $("#usuario-msg");
    const corpo = { acao: "criar", nome: f.nome.value.trim(), login: f.login.value.trim(), senha: f.senha.value, papel: f.papel.value };
    msg.className = "dica"; msg.textContent = "Criando...";
    try {
      await chamarFuncao(corpo);
      msg.innerHTML = `✅ Usuário criado! Login: <b>${esc(corpo.login.toLowerCase())}</b> · Senha: <b>${esc(corpo.senha)}</b>`;
      f.reset();
      await carregarPerfis();
      preencherFiltros();
    } catch (e) {
      msg.className = "erro"; msg.textContent = e.message;
    }
  }

  function editarUsuario(p) {
    abrirModal(`
      <h2>Editar usuário</h2>
      <form id="form-editar">
        <label>Nome <input name="nome" value="${esc(p.nome)}" required minlength="2" /></label>
        <label>Usuário (login) <input value="${esc(p.login)}" disabled /></label>
        <label>Perfil <select name="papel">${Object.entries({ vigilante: "VMO (vigilante) — registra visitas", gestor: "Gestor — somente visualização", admin: "Administrador — acesso total" }).map(([k, t]) => `<option value="${k}" ${p.papel === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label><input type="checkbox" name="ativo" ${p.ativo ? "checked" : ""} style="display:inline;width:auto" /> Usuário ativo (desmarque para bloquear o acesso)</label>
        <p class="erro" id="editar-erro"></p>
        <button class="btn primario">Salvar</button>
      </form>`);
    $("#form-editar").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await chamarFuncao({ acao: "atualizar", id: p.id, nome: f.nome.value.trim(), papel: f.papel.value, ativo: f.ativo.checked });
        fecharModal(); aviso("Usuário atualizado.");
        await carregarPerfis();
      } catch (er) { $("#editar-erro").textContent = er.message; }
    };
  }

  function trocarSenha(p) {
    abrirModal(`
      <h2>Definir nova senha</h2><p>Usuário: <b>${esc(p.nome)}</b> (<code>${esc(p.login)}</code>)</p>
      <form id="form-senha"><label>Nova senha <input name="senha" required minlength="8" /></label>
      <p class="erro" id="senha-erro"></p><button class="btn primario">Salvar senha</button></form>`);
    $("#form-senha").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await chamarFuncao({ acao: "senha", id: p.id, senha: e.target.senha.value });
        const nova = e.target.senha.value;
        abrirModal(`<h2>✅ Senha alterada</h2><p>Repasse ao usuário:</p><div class="detalhe-grid"><div><b>Usuário</b>${esc(p.login)}</div><div><b>Nova senha</b>${esc(nova)}</div></div>`);
      } catch (er) { $("#senha-erro").textContent = er.message; }
    };
  }

  /* ---------- Unidades ---------- */
  function renderUnidades() {
    $("#raio-geo").textContent = CFG.RAIO_VERIFICACAO_M;
    $("#qtd-unidades").textContent = Estado.unidades.length;
    const busca = ($("#busca-unidade").value || "").trim().toLowerCase();
    const n = contar(visitas, (v) => v.unidade);
    const lista = Estado.unidades.filter((u) => !busca || u.toLowerCase().includes(busca));
    $("#tabela-unidades").innerHTML = `
      <thead><tr><th>Unidade</th><th>Localização</th><th>Visitas no período</th><th>Ações</th></tr></thead>
      <tbody>${lista.map((u) => {
        const c = Estado.coordUnidades[u];
        return `<tr>
          <td>${esc(u)}</td>
          <td>${c ? `<a href="${linkMapa(c)}" target="_blank" rel="noopener">📍 ${fmtCoord(c)}</a> <small>(cadastrada)</small>`
            : Estado.refAuto?.[u] ? `<a href="${linkMapa(Estado.refAuto[u])}" target="_blank" rel="noopener">🛰️ ${fmtCoord(Estado.refAuto[u])}</a> <small>(automática, ${Estado.refAuto[u].n} visitas)</small>`
            : `<span class="selo geo-ref">Aguardando visitas com GPS</span>`}</td>
          <td>${n[u] || 0}</td>
          <td class="acoes"><button class="btn peq" data-coord="${esc(u)}">📍 ${c ? "Alterar" : "Cadastrar"} localização</button>
            <button class="btn peq perigo" data-u="${esc(u)}" title="Remover">🗑️</button></td>
        </tr>`; }).join("") || `<tr><td colspan="4" class="dica">Nenhuma unidade cadastrada.</td></tr>`}</tbody>`;
    $$("#tabela-unidades [data-coord]").forEach((b) => b.onclick = () => editarCoordenadas(b.dataset.coord));
    $$("#tabela-unidades [data-u]").forEach((b) => b.onclick = async () => {
      if (!confirm(`Remover a unidade "${b.dataset.u}" da lista? (As visitas já registradas não são afetadas.)`)) return;
      const { error } = await sb.from("unidades").delete().eq("nome", b.dataset.u);
      if (error) return aviso(error.message, true);
      await recarregarUnidades();
    });
  }

  async function fixarReferenciasAuto() {
    const alvo = Estado.unidades.filter((u) => !Estado.coordUnidades[u] && Estado.refAuto?.[u]);
    if (!alvo.length) return aviso("Nenhuma unidade nova com localização automática (são necessárias 3 visitas com GPS no período).", true);
    if (!confirm(`Gravar a localização automática de ${alvo.length} unidade(s) como coordenada oficial?\n(Calculada pelo GPS dos celulares dos VMOs nas visitas do período.)`)) return;
    carregando(true, "Salvando...");
    try {
      for (const u of alvo) {
        const r = Estado.refAuto[u];
        const { error } = await sb.from("unidades").update({ latitude: r.lat, longitude: r.lng }).eq("nome", u);
        if (error) throw error;
      }
      aviso(`📍 Localização gravada para ${alvo.length} unidade(s).`);
    } catch (e) { aviso(e.message, true); } finally { carregando(false); await recarregarUnidades(); }
  }

  async function recarregarUnidades() {
    await carregarUnidades(); renderUnidades(); preencherFiltros(); atualizarTudo();
  }

  // Aceita "-22.82, -47.26", "-22,82 -47,26", "-22.82;-47.26" ou link do Google Maps
  function lerCoordenadas(txt) {
    const t = String(txt || "").trim();
    if (!t) return null;
    const m = t.match(/(-?\d{1,3}(?:[.,]\d+)?)\s*[,; \t]\s*(-?\d{1,3}(?:[.,]\d+)?)/) || t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!m) return undefined;
    const num = (x) => parseFloat(String(x).replace(",", "."));
    const lat = num(m[1]), lng = num(m[2]);
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return undefined;
    return { lat, lng };
  }

  // Interpreta o texto colado: uma unidade por linha, com coordenadas opcionais
  function lerLote(texto) {
    const itens = new Map(), erros = [];
    String(texto || "").split(/\r?\n/).forEach((linha, i) => {
      const l = linha.trim();
      if (!l) return;
      const partes = l.split(/\t|;/).map((p) => p.trim()).filter((p, k) => k === 0 || p !== "");
      let nome = partes[0], coord = null;
      if (partes.length >= 3) coord = lerCoordenadas(`${partes[1]} ${partes[2]}`);
      else if (partes.length === 2) coord = lerCoordenadas(partes[1]);
      else {
        const m = l.match(/^(.*?)[,\s]+(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
        if (m) { nome = m[1].trim(); coord = lerCoordenadas(`${m[2]}, ${m[3]}`); }
      }
      if (/^(nome|unidades?)$/i.test(nome)) return; // linha de cabeçalho
      nome = nome.replace(/\s+/g, " ").slice(0, 160);
      if (!nome) return;
      if (coord === undefined) { erros.push(`Linha ${i + 1}: coordenadas inválidas (unidade será adicionada sem localização)`); coord = null; }
      itens.set(nome.toLowerCase(), { nome, coord });
    });
    const existentes = new Map(Estado.unidades.map((u) => [u.toLowerCase(), u]));
    const novos = [], atualizar = [], repetidos = [];
    itens.forEach((it, k) => {
      if (existentes.has(k)) { if (it.coord) atualizar.push({ ...it, nome: existentes.get(k) }); else repetidos.push(it.nome); }
      else novos.push(it);
    });
    return { novos, atualizar, repetidos, erros };
  }

  function previaLote() {
    const r = lerLote($("#lote-unidades").value);
    const partes = [];
    if (r.novos.length) partes.push(`<b>${r.novos.length}</b> nova(s)`);
    if (r.atualizar.length) partes.push(`<b>${r.atualizar.length}</b> já cadastrada(s) terão a localização atualizada`);
    if (r.repetidos.length) partes.push(`${r.repetidos.length} já cadastrada(s) serão ignoradas`);
    const comCoord = r.novos.filter((x) => x.coord).length + r.atualizar.length;
    if (comCoord) partes.push(`📍 ${comCoord} com coordenadas`);
    $("#lote-previa").innerHTML = (partes.join(" · ") || "") + (r.erros.length ? `<br><span class="erro">${r.erros.map(esc).join("<br>")}</span>` : "");
  }

  async function adicionarLote() {
    const r = lerLote($("#lote-unidades").value);
    if (!r.novos.length && !r.atualizar.length) return aviso(r.repetidos.length ? "Todas essas unidades já estão cadastradas." : "Digite ou cole as unidades, uma por linha.", true);
    if (!confirm(`Adicionar ${r.novos.length} unidade(s)${r.atualizar.length ? ` e atualizar a localização de ${r.atualizar.length}` : ""}?`)) return;
    carregando(true, "Salvando unidades...");
    try {
      const linha = (x) => x.coord ? { nome: x.nome, latitude: x.coord.lat, longitude: x.coord.lng } : { nome: x.nome };
      const semCoord = r.novos.filter((x) => !x.coord).map(linha), comCoord = r.novos.filter((x) => x.coord).map(linha);
      for (const grupo of [semCoord, comCoord]) {
        for (let i = 0; i < grupo.length; i += 500) {
          const { error } = await sb.from("unidades").insert(grupo.slice(i, i + 500));
          if (error) throw error;
        }
      }
      for (const x of r.atualizar) {
        const { error } = await sb.from("unidades").update({ latitude: x.coord.lat, longitude: x.coord.lng }).eq("nome", x.nome);
        if (error) throw error;
      }
      $("#lote-unidades").value = "";
      $("#lote-previa").textContent = "";
      aviso(`✅ ${r.novos.length} unidade(s) adicionada(s)${r.atualizar.length ? `, ${r.atualizar.length} atualizada(s)` : ""}.`);
    } catch (e) {
      aviso("Erro ao salvar unidades: " + (/duplicate/i.test(e.message) ? "unidade repetida." : e.message), true);
    } finally {
      carregando(false);
      await recarregarUnidades();
    }
  }

  async function importarArquivo(ev) {
    const arq = ev.target.files[0];
    ev.target.value = "";
    if (!arq) return;
    try {
      let linhas;
      if (/\.(csv|txt)$/i.test(arq.name)) {
        linhas = (await arq.text()).split(/\r?\n/).map((l) => l.replace(/"/g, ""));
      } else {
        if (!window.XLSX) return aviso("Leitor de Excel ainda carregando, tente novamente.", true);
        const wb = XLSX.read(await arq.arrayBuffer(), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, blankrows: false });
        linhas = rows.map((r) => r.slice(0, 3).map((c) => String(c ?? "").trim()).filter((c, k) => k === 0 || c).join(" ; "));
      }
      const atual = $("#lote-unidades").value.trim();
      $("#lote-unidades").value = (atual ? atual + "\n" : "") + linhas.filter((l) => l.trim()).join("\n");
      previaLote();
      aviso("Planilha carregada. Confira a lista e clique em Adicionar unidades.");
    } catch (e) {
      aviso("Não foi possível ler o arquivo: " + e.message, true);
    }
  }

  function baixarModelo() {
    const csv = "\uFEFFNome;Latitude;Longitude\r\nSE Exemplo 1;-22.8219;-47.2669\r\nSE Exemplo 2;;\r\n";
    baixarArquivo("modelo-unidades.csv", csv, "text/csv;charset=utf-8");
  }

  function editarCoordenadas(nome, sugestao) {
    const c = sugestao || Estado.coordUnidades[nome];
    const leituras = visitas.filter((v) => v.unidade === nome && v.geo_chegada?.lat != null).slice(0, 5);
    abrirModal(`
      <h2>📍 Localização da unidade</h2>
      <p><b>${esc(nome)}</b></p>
      <form id="form-coord">
        <label>Coordenadas (latitude, longitude)
          <input name="coord" value="${c ? fmtCoord(c) : ""}" placeholder="ex.: -22.8219, -47.2669 (cole do Google Maps)" />
        </label>
        <p class="erro" id="coord-erro"></p>
        <div class="filtros-acoes">
          <button class="btn primario">Salvar</button>
          ${Estado.coordUnidades[nome] ? `<button type="button" class="btn" id="btn-limpar-coord">Remover localização</button>` : ""}
          <a class="btn" id="btn-ver-mapa" target="_blank" rel="noopener">🗺️ Ver no mapa</a>
        </div>
      </form>
      ${leituras.length ? `<h3 style="margin-top:1rem">Localizações registradas pelos VMOs nesta unidade</h3>
        <table class="tabela"><tbody>${leituras.map((v, i) => `<tr><td>${fmtDataHora(v.chegada)}</td><td>${esc(v.vigilante)}</td>
          <td><a href="${linkMapa(v.geo_chegada)}" target="_blank" rel="noopener">${fmtCoord(v.geo_chegada)}</a> ±${v.geo_chegada.precisao || "?"} m</td>
          <td><button type="button" class="btn peq" data-usar="${i}">Usar esta</button></td></tr>`).join("")}</tbody></table>` : ""}`);
    const f = $("#form-coord");
    const atualizarMapa = () => { const p = lerCoordenadas(f.coord.value); $("#btn-ver-mapa").href = p ? linkMapa(p) : `https://www.google.com/maps/search/${encodeURIComponent(nome)}`; };
    f.coord.oninput = atualizarMapa; atualizarMapa();
    $$("#modal-conteudo [data-usar]").forEach((b) => b.onclick = () => { f.coord.value = fmtCoord(leituras[b.dataset.usar].geo_chegada); atualizarMapa(); });
    const salvarCoord = async (lat, lng) => {
      const { error } = await sb.from("unidades").update({ latitude: lat, longitude: lng }).eq("nome", nome);
      if (error) return $("#coord-erro").textContent = error.message;
      fecharModal(); aviso(lat == null ? "Localização removida." : "📍 Localização da unidade salva.");
      await recarregarUnidades();
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const p = lerCoordenadas(f.coord.value);
      if (!p) return $("#coord-erro").textContent = "Coordenadas inválidas. Use o formato: -22.8219, -47.2669";
      salvarCoord(p.lat, p.lng);
    };
    const limpar = $("#btn-limpar-coord");
    if (limpar) limpar.onclick = () => confirm("Remover a localização desta unidade?") && salvarCoord(null, null);
  }

  function ligarEventos() {
    $$("#nav-admin button").forEach((b) => b.onclick = () => trocarAba(b.dataset.aba));
    ["#f-vmo", "#f-unidade", "#f-situacao", "#f-gravidade", "#f-categoria", "#f-geo"].forEach((s) => $(s).onchange = atualizarTudo);
    ["#f-de", "#f-ate"].forEach((s) => $(s).onchange = carregarVisitas);
    $("#busca").oninput = renderTabela;
    $("#btn-atualizar").onclick = carregarVisitas;
    $("#btn-limpar-filtros").onclick = () => {
      ["#f-vmo", "#f-unidade", "#f-situacao", "#f-gravidade", "#f-categoria", "#f-geo"].forEach((s) => $(s).value = "");
      Object.keys(extra).forEach((k) => extra[k] = "");
      $("#busca").value = "";
      atualizarTudo();
    };
    $("#btn-csv").onclick = exportarCSV;
    $("#btn-excel").onclick = exportarExcel;
    $("#btn-imprimir").onclick = imprimirRelatorio;
    $("#form-usuario").onsubmit = criarUsuario;
    ["#u-busca", "#u-papel", "#u-status"].forEach((sel) => $(sel).oninput = renderUsuarios);
    $("#lote-unidades").oninput = previaLote;
    $("#btn-lote").onclick = adicionarLote;
    $("#arquivo-unidades").onchange = importarArquivo;
    $("#btn-modelo-unidades").onclick = baixarModelo;
    $("#busca-unidade").oninput = renderUnidades;
    $("#btn-fixar-auto").onclick = fixarReferenciasAuto;
    $("#btn-copiar").onclick = async () => {
      try { await navigator.clipboard.writeText($("#link-publico").value); } catch { $("#link-publico").select(); document.execCommand("copy"); }
      aviso("Link copiado!");
    };
  }

  return { iniciar, ligarEventos, excluirVisita, trocarAba, editarCoordenadas };
})();

/* Detalhe de uma visita */
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
    <h3>📍 Localização (dupla verificação)</h3>
    ${blocoGeo(v, admin)}
    <h3>Resumo / observações</h3>
    <p>${esc(v.observacoes || "—").replace(/\n/g, "<br>")}</p>
    <div class="filtros-acoes" style="margin-top:1rem">
      <button class="btn primario" id="btn-imprimir-visita">🖨️ Imprimir esta visita</button>
      ${admin ? `<button class="btn perigo" id="btn-excluir-visita">🗑️ Excluir visita</button>` : ""}
    </div>`);
  $$("#modal-conteudo [data-ampliar]").forEach((img) => img.onclick = () => window.open(img.src, "_blank"));
  $("#btn-imprimir-visita").onclick = () => imprimirVisitas([v], urls, `Visita — ${v.unidade}`);
  if (admin) $("#btn-excluir-visita").onclick = () => Admin.excluirVisita(v);
  const usar = $("#btn-usar-geo");
  if (usar) usar.onclick = () => Admin.editarCoordenadas(v.unidade, v.geo_chegada);
}

function blocoGeo(v, admin) {
  const ver = verificarGeo(v.geo_chegada, v.unidade);
  const ref = referenciaUnidade(v.unidade);
  const linha = (rot, g) => !g ? `<div><b>${rot}</b>Não registrada</div>`
    : g.erro ? `<div><b>${rot}</b>❌ ${esc(g.erro)}</div>`
    : `<div><b>${rot}</b><a href="${linkMapa(g)}" target="_blank" rel="noopener">${fmtCoord(g)}</a><br><small>±${g.precisao ?? "?"} m · ${fmtHora(g.em)}${ref ? ` · ${fmtDistancia(distanciaM(g, ref))} da unidade` : ""}</small></div>`;
  return `<div class="geo ${ver.classe}"><b>${ver.icone} ${esc(ver.rotulo)}</b>${ver.detalhe ? ` — ${esc(ver.detalhe)}` : ""}</div>
    <div class="detalhe-grid">
      ${linha("GPS na chegada", v.geo_chegada)}
      ${linha("GPS na saída", v.geo_saida)}
      <div><b>Referência da unidade</b>${ref ? `<a href="${linkMapa(ref)}" target="_blank" rel="noopener">${fmtCoord(ref)}</a><br><small>${ref.origem === "auto" ? `automática (${ref.n} visitas)` : "cadastrada"}</small>` : "Ainda sem referência"}</div>
    </div>
    ${v.geo_chegada?.lat != null ? mapaEmbed(v.geo_chegada, 220) : ""}
    ${admin && v.geo_chegada?.lat != null ? `<button class="btn peq" id="btn-usar-geo">📌 Usar como localização da unidade</button>` : ""}`;
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
        <br>GPS: ${(() => { const g = verificarGeo(v.geo_chegada, v.unidade); return `${g.icone} ${esc(g.rotulo)}${v.geo_chegada?.lat != null ? ` — ${fmtCoord(v.geo_chegada)} (±${v.geo_chegada.precisao} m)` : ""}`; })()}
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
