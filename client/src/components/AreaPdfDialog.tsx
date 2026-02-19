import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Printer } from "lucide-react";
import type { ServiceArea } from "@shared/schema";
import { formatDateBR } from "@/lib/utils";
import jsPDF from "jspdf";

interface AreaPdfDialogProps {
  area: ServiceArea;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generateAreaPdf(area: ServiceArea): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const loteColor = area.lote === 2
    ? { r: 139, g: 92, b: 246 }
    : { r: 59, g: 130, b: 246 };

  doc.setFillColor(loteColor.r, loteColor.g, loteColor.b);
  doc.rect(0, 0, pageWidth, 35, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("CMTU-LD - Zeladoria Londrina", margin, y);

  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Ficha da Área de Serviço", margin, y);

  const today = new Date();
  const dateStr = today.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.setFontSize(8);
  doc.text(`Gerado em: ${dateStr}`, pageWidth - margin, y, { align: "right" });

  y = 45;
  doc.setTextColor(50, 50, 50);

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, contentWidth, 52, 2, 2, "F");
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, y, contentWidth, 52, 2, 2, "S");

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text(area.endereco, margin + 5, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);

  if (area.bairro) {
    doc.text(`Bairro: ${area.bairro}`, margin + 5, y);
    y += 5;
  }

  if (area.lote) {
    doc.text(`Lote: ${area.lote}`, margin + 5, y);
    y += 5;
  }

  if (area.metragem_m2 != null) {
    doc.text(`Metragem: ${Number(area.metragem_m2).toLocaleString("pt-BR")} m²`, margin + 5, y);
    y += 5;
  }

  if (area.tipo) {
    doc.text(`Tipo: ${area.tipo}`, margin + 5, y);
    y += 5;
  }

  if (area.lat != null && area.lng != null) {
    doc.text(`Coordenadas: ${Number(area.lat).toFixed(6)}, ${Number(area.lng).toFixed(6)}`, margin + 5, y);
    y += 5;
  }

  const servLabel = area.servico === "jardins" ? "Jardins" : "Capina e Roçagem";
  doc.text(`Serviço: ${servLabel}`, margin + 5, y);

  y += 15;

  doc.setFillColor(loteColor.r, loteColor.g, loteColor.b);
  doc.roundedRect(margin, y, contentWidth, 8, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("INFORMAÇÕES DE SERVIÇO", margin + 5, y + 5.5);

  y += 14;
  doc.setTextColor(50, 50, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const isRocagem = area.servico === "rocagem" || !area.servico;

  if (isRocagem) {
    const infoRows = [
      ["Próxima Previsão", area.proximaPrevisao ? formatDateBR(area.proximaPrevisao) : "Não definida"],
      ["Previsão Manual", area.manualSchedule ? "Sim" : "Não"],
      ["Status", area.executando ? "Em Execução" : area.status || "Pendente"],
    ];

    infoRows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, margin + 5, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, margin + 55, y);
      y += 6;
    });
  } else {
    const infoRows = [
      ["Última Manutenção", area.ultimaManutencao ? formatDateBR(area.ultimaManutencao) : "Sem registro"],
      ["Última Irrigação", area.ultimaIrrigacao ? formatDateBR(area.ultimaIrrigacao) : "Sem registro"],
      ["Último Plantio", area.ultimaPlantio ? formatDateBR(area.ultimaPlantio) : "Sem registro"],
    ];

    infoRows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, margin + 5, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, margin + 55, y);
      y += 6;
    });

    if (area.observacoes) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.text("Observações:", margin + 5, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const obsLines = doc.splitTextToSize(area.observacoes, contentWidth - 10);
      doc.text(obsLines, margin + 5, y);
      y += obsLines.length * 4.5;
    }
  }

  y += 8;

  const allHistory: Array<{ date: string; status: string; observation?: string }> = [];
  if (area.ultimaRocagem) {
    allHistory.push({
      date: area.ultimaRocagem,
      status: "Concluído",
      observation: area.registradoPor ? `Registrado por: ${area.registradoPor}` : undefined,
    });
  }
  if (area.history && area.history.length > 0) {
    for (const entry of area.history) {
      const isDuplicate = area.ultimaRocagem && entry.date === area.ultimaRocagem;
      if (!isDuplicate) {
        allHistory.push(entry);
      }
    }
  }

  if (allHistory.length > 0) {
    doc.setFillColor(loteColor.r, loteColor.g, loteColor.b);
    doc.roundedRect(margin, y, contentWidth, 8, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`HISTÓRICO DE ROÇAGENS (${allHistory.length} registros)`, margin + 5, y + 5.5);

    y += 14;

    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y - 4, contentWidth, 7, "F");
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("#", margin + 3, y);
    doc.text("Data", margin + 12, y);
    doc.text("Status", margin + 50, y);
    doc.text("Observação", margin + 90, y);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);

    allHistory.forEach((entry, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      if (idx % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y - 3.5, contentWidth, 6, "F");
      }

      doc.text(`${idx + 1}`, margin + 3, y);
      doc.text(formatDateBR(entry.date), margin + 12, y);
      doc.text(entry.status || "—", margin + 50, y);

      if (entry.observation) {
        const obsText = entry.observation.length > 40
          ? entry.observation.substring(0, 37) + "..."
          : entry.observation;
        doc.text(obsText, margin + 90, y);
      }

      y += 6;
    });
  } else {
    doc.setFillColor(loteColor.r, loteColor.g, loteColor.b);
    doc.roundedRect(margin, y, contentWidth, 8, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("HISTÓRICO DE ROÇAGENS", margin + 5, y + 5.5);

    y += 14;
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("Nenhum registro de roçagem encontrado para esta área.", margin + 5, y);
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Página ${i} de ${totalPages} — CMTU-LD Zeladoria Londrina`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  return doc;
}

export function AreaPdfDialog({ area, open, onOpenChange }: AreaPdfDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      setIsGenerating(true);
      setTimeout(() => {
        try {
          const doc = generateAreaPdf(area);
          const dataUri = doc.output("datauristring");
          setPdfUrl(dataUri);
        } catch (err) {
          console.error("Error generating PDF:", err);
        } finally {
          setIsGenerating(false);
        }
      }, 100);
    } else {
      setPdfUrl(null);
    }
  }, [open, area]);

  function handleDownload() {
    const doc = generateAreaPdf(area);
    const fileName = `area_${area.endereco.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40)}_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col" data-testid="dialog-pdf-preview">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Ficha da Área - {area.endereco}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 relative">
          {isGenerating ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Gerando PDF...</span>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full rounded border"
              title="PDF Preview"
              data-testid="iframe-pdf-preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Erro ao gerar PDF
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 flex-shrink-0 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handleDownload} disabled={isGenerating} data-testid="button-download-pdf">
            <Download className="h-4 w-4 mr-2" />
            Baixar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
