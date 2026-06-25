import type jsPDF from "jspdf";

export async function loadImg(
  url: string,
): Promise<{ b64: string; nw: number; nh: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ nw: number; nh: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ nw: img.naturalWidth, nh: img.naturalHeight });
      img.onerror = () => resolve({ nw: 100, nh: 50 });
      img.src = b64;
    });
    return { b64, ...dims };
  } catch {
    return null;
  }
}

export const PDF_NAVY: [number, number, number] = [26, 46, 90];
export const PDF_GREEN: [number, number, number] = [45, 122, 79];

type ImgData = { b64: string; nw: number; nh: number } | null;

/**
 * Desenha o cabeçalho padrão CMTU em duas faixas:
 *  Faixa 1 — logos institucionais (Londrina esquerda, CMTU direita)
 *  Faixa 2 — título do documento + logo Operações
 * Retorna a coordenada Y logo após a linha separadora.
 */
export function addPdfHeader(
  doc: jsPDF,
  londrina: ImgData,
  cmtu: ImgData,
  operacoes: ImgData,
  title: string,
  subtitle: string,
  mx = 14,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const cx = pageW / 2;
  let y = mx;

  // ── Faixa 1: logos institucionais ────────────────────────────────
  const logoH = 14; // altura em mm para ambos os logos
  if (londrina) {
    const w = (londrina.nw / londrina.nh) * logoH;
    doc.addImage(londrina.b64, "PNG", mx, y, w, logoH);
  }
  if (cmtu) {
    const w = (cmtu.nw / cmtu.nh) * logoH;
    doc.addImage(cmtu.b64, "PNG", pageW - mx - w, y, w, logoH);
  }
  y += logoH + 2;

  // linha fina separando as duas faixas
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.line(mx, y, pageW - mx, y);
  y += 4;

  // ── Faixa 2: título ──────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text("COMPANHIA MUNICIPAL DE TRÂNSITO E URBANIZAÇÃO", cx, y, { align: "center" });
  y += 5;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_NAVY);
  doc.text(title, cx, y, { align: "center" });
  y += 5;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_GREEN);
  doc.text(subtitle, cx, y, { align: "center" });
  y += 3;

  if (operacoes) {
    const h = 9;
    const w = (operacoes.nw / operacoes.nh) * h;
    doc.addImage(operacoes.b64, "PNG", cx - w / 2, y, w, h);
    y += h + 3;
  } else {
    y += 4;
  }

  // ── Linha separadora principal ────────────────────────────────────
  doc.setDrawColor(...PDF_NAVY);
  doc.setLineWidth(0.7);
  doc.line(mx, y, pageW - mx, y);

  return y;
}

/**
 * Cabeçalho compacto para páginas internas (tabelas).
 * Logos menores, só o título da OS centralizado.
 * Retorna Y logo após a linha separadora.
 */
export function addCompactPdfHeader(
  doc: jsPDF,
  londrina: ImgData,
  cmtu: ImgData,
  title: string,
  mx = 14,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const cx = pageW / 2;
  let y = 8;

  const logoH = 8;
  if (londrina) {
    const w = (londrina.nw / londrina.nh) * logoH;
    doc.addImage(londrina.b64, "PNG", mx, y, w, logoH);
  }
  if (cmtu) {
    const w = (cmtu.nw / cmtu.nh) * logoH;
    doc.addImage(cmtu.b64, "PNG", pageW - mx - w, y, w, logoH);
  }
  y += logoH + 2;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.line(mx, y, pageW - mx, y);
  y += 4;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_NAVY);
  doc.text(title, cx, y, { align: "center" });
  y += 4;

  return y;
}

export function addPdfFooter(doc: jsPDF, pageNum: number, totalPages: number, mx = 14) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const footerY = pageH - 12;
  const cx = pageW / 2;

  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.25);
  doc.line(mx, footerY - 5, pageW - mx, footerY - 5);

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);

  doc.text(
    "Rua Prof. João Cândido, 1.213  —  CEP 86.010-001  —  CNPJ 86.731.320/0001-37  —  Fone (43) 3379-7900  —  Londrina – PR",
    cx,
    footerY - 1,
    { align: "center" },
  );
  doc.text("www.cmtuld.com.br  |  opera@cmtuld.com.br", cx, footerY + 3, {
    align: "center",
  });
  doc.text(`página ${pageNum} de ${totalPages}`, pageW - mx, footerY + 3, {
    align: "right",
  });
}
