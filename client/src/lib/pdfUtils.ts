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

export function addPdfFooter(
  doc: jsPDF,
  pageNum: number,
  totalPages: number,
  mx = 14,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const footerY = pageH - 12;

  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.25);
  doc.line(mx, footerY - 5, pageW - mx, footerY - 5);

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  doc.text(
    "Rua Prof. João Cândido, 1.213  CEP 86.010-001  CNPJ 86731320/0001-37  Fone (43) 3379-7900 – Londrina – PR",
    mx,
    footerY - 1,
  );
  doc.text("www.cmtuld.com.br  |  e-mail: cmtu@londrina.pr.gov.br", mx, footerY + 3);
  doc.text(`página ${pageNum} de ${totalPages}`, pageW - mx, footerY + 3, {
    align: "right",
  });
}

type ImgData = { b64: string; nw: number; nh: number } | null;

export function addPdfLogosHeader(
  doc: jsPDF,
  londrina: ImgData,
  cmtu: ImgData,
  operacoes: ImgData,
  mx = 14,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const hY = mx;

  // Londrina (left)
  if (londrina) {
    const h = 13;
    const w = (londrina.nw / londrina.nh) * h;
    doc.addImage(londrina.b64, "PNG", mx, hY, w, h);
  }

  // CMTU vertical (right)
  if (cmtu) {
    const h = 22;
    const w = (cmtu.nw / cmtu.nh) * h;
    doc.addImage(cmtu.b64, "PNG", pageW - mx - w, hY, w, h);
  }

  // Centro: CMTU text
  const cx = pageW / 2;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(
    "COMPANHIA MUNICIPAL DE TRÂNSITO E URBANIZAÇÃO",
    cx,
    hY + 4,
    { align: "center" },
  );

  // Operações logo (center, below CMTU text)
  let headerBottom = hY + 4;
  if (operacoes) {
    const h = 11;
    const w = (operacoes.nw / operacoes.nh) * h;
    doc.addImage(operacoes.b64, "PNG", cx - w / 2, hY + 6, w, h);
    headerBottom = hY + 6 + h + 2;
  } else {
    headerBottom = hY + 20;
  }

  // Separator line
  doc.setDrawColor(...PDF_NAVY);
  doc.setLineWidth(0.7);
  doc.line(mx, headerBottom, pageW - mx, headerBottom);

  return headerBottom; // Y where header ends
}
