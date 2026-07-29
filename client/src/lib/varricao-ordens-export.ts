import { SECAO_LABELS } from "@/lib/varricao-utils";
import {
  formatMesReferencia, formatMetragem,
  type VarricaoOrdemPayload,
} from "@/lib/varricao-ordens-types";

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Ordem em que as seções aparecem, espelhando a planilha original da Mariane
const ORDEM_SECOES = [
  "varricao", "varricao_2turno", "sanitarios",
  "lavagem_vias_noturna", "lavagem_pracas_noturna",
  "lavagem_vias_diurna", "lavagem_pracas_diurna",
];

export async function exportarOrdemExcel(payload: VarricaoOrdemPayload): Promise<void> {
  const XLSX = await import("xlsx");

  const linhas: any[][] = [
    ["ENDEREÇO", "COMPLEMENTO", "REGIÃO", "TIPO", "METRAGEM ÚNICA", "DATAS", "DIAS", "METRAGEM TOTAL"],
  ];

  const secoesPresentes = ORDEM_SECOES.filter((s) => payload.locais.some((l) => l.secao === s));
  for (const secao of secoesPresentes) {
    linhas.push([SECAO_LABELS[secao]?.toUpperCase() ?? secao.toUpperCase(), "", "", "", "", "", "", ""]);
    const doSecao = payload.locais
      .filter((l) => l.secao === secao)
      .sort((a, b) => (a.regiao ?? "").localeCompare(b.regiao ?? "") || a.nome.localeCompare(b.nome));
    for (const l of doSecao) {
      linhas.push([
        l.nome,
        l.complemento ?? "",
        l.regiao ?? "",
        l.tipo ?? "",
        l.metragemUnica ?? "",
        l.diasTexto,
        l.dias.length,
        Number(l.metragemTotal.toFixed(2)),
      ]);
    }
  }

  linhas.push([]);
  linhas.push(["TOTAL GERAL", "", "", "", "", "", payload.totalLocais, Number(payload.totalMetragem.toFixed(2))]);
  linhas.push([]);
  linhas.push(["SUBTOTAL POR REGIÃO"]);
  linhas.push(["Região", "Locais", "Metragem Total"]);
  payload.subtotaisRegiao.forEach((s) =>
    linhas.push([s.chave, s.quantidade, Number(s.metragemTotal.toFixed(2))])
  );
  linhas.push([]);
  linhas.push(["SUBTOTAL POR SEÇÃO"]);
  linhas.push(["Seção", "Locais", "Metragem Total"]);
  payload.subtotaisSecao.forEach((s) =>
    linhas.push([SECAO_LABELS[s.chave] ?? s.chave, s.quantidade, Number(s.metragemTotal.toFixed(2))])
  );

  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = [
    { wch: 42 }, { wch: 32 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 34 }, { wch: 8 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  const nomeAba = payload.ordem ? `OS ${payload.ordem.numero}` : formatMesReferencia(payload.mesReferencia);
  XLSX.utils.book_append_sheet(wb, ws, nomeAba.slice(0, 31));

  const nomeArquivo = payload.ordem
    ? `OS_Varricao_${payload.ordem.numero.replace(/[^\w-]/g, "_")}.xlsx`
    : `Previa_Varricao_${payload.mesReferencia}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);
}

export async function exportarOrdemPdf(payload: VarricaoOrdemPayload): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { loadImg, addPdfHeader, addCompactPdfHeader, addPdfFooter, PDF_NAVY } = await import("@/lib/pdfUtils");

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const mx = 14;
  const PDF_FONT = "helvetica";

  const [londrina, cmtu, operacoes] = await Promise.all([
    loadImg("/logos/londrina.png"),
    loadImg("/logos/cmtu_vertical.png"),
    loadImg("/logos/operacoes.png"),
  ]);

  const titulo = payload.ordem
    ? `ORDEM DE SERVIÇO Nº ${payload.ordem.numero}`
    : `PRÉVIA — ORDEM DE SERVIÇO`;
  const subtitulo = `VARRIÇÃO E LAVAÇÃO — ${formatMesReferencia(payload.mesReferencia).toUpperCase()}`;

  // ── PÁGINA 1: CAPA / RESUMO ─────────────────────────────────────────
  const headerBottom = addPdfHeader(doc, londrina, cmtu, operacoes, titulo, subtitulo, mx);
  let y = headerBottom + 8;

  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(80, 80, 80);
  if (payload.ordem) {
    doc.text(`Emitida em ${formatDataBR(payload.ordem.data_emissao)}`, pageW - mx, y, { align: "right" });
    if (payload.ordem.emitido_por) {
      doc.text(`Por: ${payload.ordem.emitido_por}`, mx, y);
    }
  }
  y += 10;

  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...PDF_NAVY);
  doc.text(
    `${payload.totalLocais} locais programados  ·  ${formatMetragem(payload.totalMetragem)} m² no mês`,
    mx, y
  );
  y += 10;

  if (payload.ordem?.observacao) {
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(60, 60, 60);
    const obsLines = doc.splitTextToSize(`Observação: ${payload.ordem.observacao}`, pageW - mx * 2);
    doc.text(obsLines, mx, y);
    y += obsLines.length * 5 + 6;
  }

  // Subtotal por seção
  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...PDF_NAVY);
  doc.text("Resumo por seção", mx, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Seção", "Locais", "Metragem Total (m²)"]],
    body: payload.subtotaisSecao.map((s) => [
      SECAO_LABELS[s.chave] ?? s.chave, String(s.quantidade), formatMetragem(s.metragemTotal),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PDF_NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
    margin: { left: mx, right: mx },
    theme: "grid",
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...PDF_NAVY);
  doc.text("Resumo por região", mx, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Região", "Locais", "Metragem Total (m²)"]],
    body: payload.subtotaisRegiao.map((s) => [s.chave, String(s.quantidade), formatMetragem(s.metragemTotal)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PDF_NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
    margin: { left: mx, right: mx },
    theme: "grid",
  });

  addPdfFooter(doc, 1, 1, mx);

  // ── PÁGINAS: LISTA DE LOCAIS POR SEÇÃO ──────────────────────────────
  doc.addPage();
  const COMPACT_H = 22;
  const secoesPresentes = ORDEM_SECOES.filter((s) => payload.locais.some((l) => l.secao === s));
  const corpo: any[] = [];
  for (const secao of secoesPresentes) {
    corpo.push([{ content: (SECAO_LABELS[secao] ?? secao).toUpperCase(), colSpan: 6, styles: { fillColor: [220, 230, 225], fontStyle: "bold", textColor: PDF_NAVY } }]);
    const doSecao = payload.locais
      .filter((l) => l.secao === secao)
      .sort((a, b) => (a.regiao ?? "").localeCompare(b.regiao ?? "") || a.nome.localeCompare(b.nome));
    for (const l of doSecao) {
      corpo.push([
        l.complemento ? `${l.nome}\n${l.complemento}` : l.nome,
        l.regiao ?? "—",
        l.metragemUnica != null ? formatMetragem(l.metragemUnica) : "—",
        l.diasTexto,
        String(l.dias.length),
        formatMetragem(l.metragemTotal),
      ]);
    }
  }

  autoTable(doc, {
    startY: COMPACT_H + 4,
    head: [["Local", "Região", "Metragem", "Datas do Mês", "Dias", "Metragem Total"]],
    body: corpo,
    styles: { fontSize: 7.5, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
    headStyles: { fillColor: PDF_NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 24 },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 52 },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 22, halign: "right" },
    },
    alternateRowStyles: { fillColor: [245, 250, 247] },
    margin: { left: mx, right: mx, bottom: 20, top: COMPACT_H + 4 },
    theme: "grid",
    willDrawPage: () => {
      addCompactPdfHeader(doc, londrina, cmtu, titulo, mx);
    },
  });

  const totalPaginas = doc.getNumberOfPages();
  for (let p = 2; p <= totalPaginas; p++) {
    doc.setPage(p);
    addPdfFooter(doc, p, totalPaginas, mx);
  }

  const nomeArquivo = payload.ordem
    ? `OS_Varricao_${payload.ordem.numero.replace(/[^\w-]/g, "_")}.pdf`
    : `Previa_Varricao_${payload.mesReferencia}.pdf`;
  doc.save(nomeArquivo);
}
