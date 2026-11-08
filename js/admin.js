/* Painel do administrador: indicadores, gráficos, visitas, usuários e unidades */
const Admin = (() => {
  let visitas = [];     // visitas do período carregado
  let perfis = [];
  let graficos = {};
  let ordem = { campo: "chegada", desc: true };
  const extra = { vmo: "", unidade: "", categoria: "", gravidade: "", dia: "", hora: "" }; // filtros vindos de cliques nos gráficos

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
    const link = location.origin + location.pathname.replace(/index\.html$/, "");
    $("#link-publico").value = link;
    $("#btn-whats").href = `https://wa.me/?text=${encodeURIComponent("Acesse o app de Visitas Operacionais VMO: " + link)}`;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = "#5f6b7a";
    trocarAba("painel");
    await Promise.all([carregarPerfis(), carregarVisitas()]);
    renderUnidades();
  }

  function trocarAba(aba) {
    if (aba === "nova") { Main.abrirVmo(); return; }
    mostrar("#tela-vmo", false);
    mostrar("#tela-admin", true);
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
    $("#filtro-ativo").innerHTML = partes.length
      ? `🔎 Filtro do gráfico: <b>${esc(partes.join(" · "))}</b> <button class="btn-link" id="limpar-extra">remover</button>` : "";
    const b = $("#limpar-extra");
    if (b) b.onclick = () => { Object.keys(extra).forEach((k) => extra[k] = ""); atualizarTudo(); };
  }

  function atualizarTudo() {
    descreverFiltroExtra();
    if (!$("#aba-painel").classList.contains("oculto")) renderPainel();
    renderTabela();
    renderUsuarios();
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
    const kpis = [
      ["Visitas no período", lista.length, ""],
      ["Com anormalidade", `${comAnorm} <small>(${lista.length ? Math.round(comAnorm * 100 / lista.length) : 0}%)</small>`, "alerta"],
      ["Visitas normais", lista.length - comAnorm, "ok"],
      ["Anormalidades registradas", ocorr.length, "alerta"],
      ["Críticas", criticas, "alerta"],
      ["Tempo médio na unidade", fmtDuracao(media), ""],
      ["VMOs em atividade", new Set(lista.map((v) => v.vigilante)).size, ""],
      ["Unidades visitadas", new Set(lista.map((v) => v.unidade)).size, ""],
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
    const val = (v) => c === "permanencia" ? minutosEntre(v.chegada, v.saida) : c === "ocorrencias" ? (v.anomalias || []).length : (v[c] ?? "");
    lista.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * (ordem.desc ? -1 : 1); });
    const col = (campo, nome) => `<th data-ordem="${campo}">${nome}${ordem.campo === campo ? (ordem.desc ? " ▼" : " ▲") : ""}</th>`;
    $("#tabela-visitas").innerHTML = `
      <thead><tr>${col("chegada", "Chegada")}${col("saida", "Saída")}${col("permanencia", "Permanência")}${col("vigilante", "VMO")}${col("unidade", "Unidade")}${col("tem_anormalidade", "Situação")}${col("ocorrencias", "Anormalidades")}<th>Ações</th></tr></thead>
      <tbody>${lista.map((v) => `
        <tr>
          <td>${fmtDataHora(v.chegada)}</td><td>${fmtDataHora(v.saida)}</td><td>${fmtDuracao(minutosEntre(v.chegada, v.saida))}</td>
          <td>${esc(v.vigilante)}</td><td>${esc(v.unidade)}</td>
          <td>${v.tem_anormalidade ? `<span class="selo anormal">Anormal</span>` : `<span class="selo normal">Normal</span>`}</td>
          <td>${(v.anomalias || []).map((a) => `<span class="selo g-${esc(a.gravidade)}" title="${esc(a.descricao)}">${esc(a.categoria)}</span>`).join(" ")}</td>
          <td class="acoes"><button class="btn peq" data-ver="${v.id}">Ver</button></td>
        </tr>`).join("") || `<tr><td colspan="8" class="dica">Nenhuma visita encontrada com os filtros atuais.</td></tr>`}
      </tbody>`;
    $$("#tabela-visitas [data-ordem]").forEach((th) => th.onclick = () => {
      ordem = { campo: th.dataset.ordem, desc: ordem.campo === th.dataset.ordem ? !ordem.desc : true };
      renderTabela();
    });
    $$("#tabela-visitas [data-ver]").forEach((b) => b.onclick = () => abrirDetalheVisita(visitas.find((v) => v.id === b.dataset.ver), { admin: true }));
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
    const titulos = { "g-dia": "Visitas por dia", "g-vmo": "Visitas por VMO", "g-unidade": "Visitas por unidade", "g-categoria": "Anormalidades por categoria", "g-gravidade": "Anormalidades por gravidade", "g-tempo": "Tempo médio por unidade (min)", "g-hora": "Visitas por faixa de horário" };
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
      <table><thead><tr><th>Chegada</th><th>Saída</th><th>Perm.</th><th>VMO</th><th>Unidade</th><th>Situação</th><th>Anormalidades</th><th>Resumo</th></tr></thead>
      <tbody>${lista.slice().sort((a, b) => new Date(a.chegada) - new Date(b.chegada)).map((v) => `<tr>
        <td>${fmtDataHora(v.chegada)}</td><td>${fmtDataHora(v.saida)}</td><td>${fmtDuracao(minutosEntre(v.chegada, v.saida))}</td>
        <td>${esc(v.vigilante)}</td><td>${esc(v.unidade)}</td><td>${v.tem_anormalidade ? "<b>Anormal</b>" : "Normal"}</td>
        <td>${(v.anomalias || []).map((a) => `${esc(a.categoria)} (${esc(a.gravidade)})`).join("; ")}</td><td>${esc(v.observacoes || "")}</td></tr>`).join("")}</tbody></table>
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
    const { data, error } = await sb.from("perfis").select("*").order("nome");
    if (error) return aviso("Erro ao carregar usuários: " + error.message, true);
    perfis = data;
    renderUsuarios();
  }

  function renderUsuarios() {
    const n = contar(visitas, (v) => v.vigilante);
    $("#tabela-usuarios").innerHTML = `
      <thead><tr><th>Nome</th><th>Usuário (login)</th><th>Perfil</th><th>Status</th><th>Visitas no período</th><th>Criado em</th><th>Ações</th></tr></thead>
      <tbody>${perfis.map((p) => `<tr>
        <td>${esc(p.nome)}</td><td><code>${esc(p.login)}</code></td>
        <td>${p.papel === "admin" ? "Administrador" : "VMO"}</td>
        <td><span class="selo ${p.ativo ? "ativo" : "inativo"}">${p.ativo ? "Ativo" : "Inativo"}</span></td>
        <td>${n[p.nome] || 0}</td><td>${fmtData(p.criado_em)}</td>
        <td class="acoes"><button class="btn peq" data-editar="${p.id}">Editar</button> <button class="btn peq" data-senha="${p.id}">Nova senha</button></td>
      </tr>`).join("")}</tbody>`;
    $$("#tabela-usuarios [data-editar]").forEach((b) => b.onclick = () => editarUsuario(perfis.find((p) => p.id === b.dataset.editar)));
    $$("#tabela-usuarios [data-senha]").forEach((b) => b.onclick = () => trocarSenha(perfis.find((p) => p.id === b.dataset.senha)));
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
        <label>Perfil <select name="papel"><option value="vigilante" ${p.papel === "vigilante" ? "selected" : ""}>VMO (vigilante)</option><option value="admin" ${p.papel === "admin" ? "selected" : ""}>Administrador</option></select></label>
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
        fecharModal(); aviso("Senha alterada. Informe a nova senha ao usuário.");
      } catch (er) { $("#senha-erro").textContent = er.message; }
    };
  }

  /* ---------- Unidades ---------- */
  function renderUnidades() {
    $("#lista-unidades-admin").innerHTML = Estado.unidades.map((u) => `<span class="chip">${esc(u)} <button title="Remover" data-u="${esc(u)}">×</button></span>`).join("") || `<p class="dica">Nenhuma unidade cadastrada.</p>`;
    $$("#lista-unidades-admin [data-u]").forEach((b) => b.onclick = async () => {
      if (!confirm(`Remover a unidade "${b.dataset.u}" da lista? (As visitas já registradas não são afetadas.)`)) return;
      const { error } = await sb.from("unidades").delete().eq("nome", b.dataset.u);
      if (error) return aviso(error.message, true);
      await carregarUnidades(); renderUnidades(); preencherFiltros();
    });
  }

  async function adicionarUnidade(ev) {
    ev.preventDefault();
    const nome = ev.target.nome.value.trim();
    if (!nome) return;
    const { error } = await sb.from("unidades").insert({ nome });
    if (error) return aviso(/duplicate/i.test(error.message) ? "Essa unidade já existe." : error.message, true);
    ev.target.reset();
    await carregarUnidades(); renderUnidades(); preencherFiltros();
    aviso("Unidade adicionada.");
  }

  function ligarEventos() {
    $$("#nav-admin button").forEach((b) => b.onclick = () => trocarAba(b.dataset.aba));
    ["#f-vmo", "#f-unidade", "#f-situacao", "#f-gravidade", "#f-categoria"].forEach((s) => $(s).onchange = atualizarTudo);
    ["#f-de", "#f-ate"].forEach((s) => $(s).onchange = carregarVisitas);
    $("#busca").oninput = renderTabela;
    $("#btn-atualizar").onclick = carregarVisitas;
    $("#btn-limpar-filtros").onclick = () => {
      ["#f-vmo", "#f-unidade", "#f-situacao", "#f-gravidade", "#f-categoria"].forEach((s) => $(s).value = "");
      Object.keys(extra).forEach((k) => extra[k] = "");
      $("#busca").value = "";
      atualizarTudo();
    };
    $("#btn-csv").onclick = exportarCSV;
    $("#btn-excel").onclick = exportarExcel;
    $("#btn-imprimir").onclick = imprimirRelatorio;
    $("#form-usuario").onsubmit = criarUsuario;
    $("#form-unidade").onsubmit = adicionarUnidade;
    $("#btn-copiar").onclick = async () => {
      try { await navigator.clipboard.writeText($("#link-publico").value); } catch { $("#link-publico").select(); document.execCommand("copy"); }
      aviso("Link copiado!");
    };
  }

  return { iniciar, ligarEventos, excluirVisita, trocarAba };
})();
