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

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

export async function registerRoboto(doc: jsPDF): Promise<string> {
  try {
    const [rRes, bRes] = await Promise.all([
      fetch("/fonts/Roboto-Regular.ttf"),
      fetch("/fonts/Roboto-Bold.ttf"),
    ]);
    if (!rRes.ok || !bRes.ok) return "helvetica";
    const [regular, bold] = await Promise.all([rRes.arrayBuffer(), bRes.arrayBuffer()]);
    doc.addFileToVFS("Roboto-Regular.ttf", arrayBufferToBase64(regular));
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.addFileToVFS("Roboto-Bold.ttf", arrayBufferToBase64(bold));
    doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
    return "Roboto";
  } catch {
    return "helvetica";
  }
}
export const PDF_NAVY: [number, number, number] = [26, 46, 90];
export const PDF_GREEN: [number, number, number] = [45, 122, 79];

export function addPdfFooter(doc: jsPDF, pageNum: number, totalPages: number, mx = 14, font = "helvetica") {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const footerY = pageH - 12;
  const cx = pageW / 2;

  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.25);
  doc.line(mx, footerY - 5, pageW - mx, footerY - 5);

  doc.setFontSize(6.5);
  doc.setFont(font, "normal");
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
