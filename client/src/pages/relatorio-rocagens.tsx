import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Filter, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ServiceArea } from "@shared/schema";
import { formatDateBR } from "@/lib/utils";

export default function RelatorioRocagensPage() {
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedLote, setSelectedLote] = useState<string>("");
  const [appliedFilters, setAppliedFilters] = useState<{ dateFrom: string; dateTo: string; lote: string }>({
    dateFrom: "",
    dateTo: "",
    lote: "",
  });

  const { data: areas = [] } = useQuery<ServiceArea[]>({
    queryKey: ["/api/areas/light"],
  });

  // Filtrar áreas roçadas no período
  const rocagensFiltered = areas
    .filter(a => a.servico === "rocagem" || !a.servico) // Apenas roçagem
    .filter(a => a.ultimaRocagem) // Apenas áreas que já foram roçadas
    .filter(a => {
      if (!appliedFilters.dateFrom && !appliedFilters.dateTo) return true;
      
      // Extrair apenas a data (YYYY-MM-DD) para comparação sem timezone
      // Trata formatos: "2025-11-19T10:30:00" ou "2025-11-19" ou "2025-11-19 10:30:00"
      let dataRocagemStr = a.ultimaRocagem!;
      if (dataRocagemStr.includes("T")) {
        dataRocagemStr = dataRocagemStr.split("T")[0];
      } else if (dataRocagemStr.includes(" ")) {
        dataRocagemStr = dataRocagemStr.split(" ")[0];
      }
      
      if (appliedFilters.dateFrom) {
        if (dataRocagemStr.localeCompare(appliedFilters.dateFrom) < 0) return false;
      }
      if (appliedFilters.dateTo) {
        if (dataRocagemStr.localeCompare(appliedFilters.dateTo) > 0) return false;
      }
      return true;
    })
    .filter(a => {
      if (!appliedFilters.lote || appliedFilters.lote === "todos") return true;
      return a.lote === parseInt(appliedFilters.lote);
    })
    .sort((a, b) => {
      const dateA = new Date(a.ultimaRocagem || 0);
      const dateB = new Date(b.ultimaRocagem || 0);
      return dateB.getTime() - dateA.getTime();
    });

  // Manipulador para confirmar filtros
  const handleConfirmFilters = () => {
    setAppliedFilters({
      dateFrom,
      dateTo,
      lote: selectedLote,
    });
  };

  // Agrupar por data
  const rocagensPorData = rocagensFiltered.reduce((acc, area) => {
    const data = area.ultimaRocagem ? new Date(area.ultimaRocagem).toLocaleDateString("pt-BR") : "Sem data";
    if (!acc[data]) acc[data] = [];
    acc[data].push(area);
    return acc;
  }, {} as Record<string, ServiceArea[]>);

  const handleExportPDF = () => {
    if (rocagensFiltered.length === 0) return;

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Relatorio de Rocagens - Capina e Rocagem", margin, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const periodoFrom = appliedFilters.dateFrom
        ? new Date(appliedFilters.dateFrom + "T00:00:00").toLocaleDateString("pt-BR")
        : "Desde o inicio";
      const periodoTo = appliedFilters.dateTo
        ? new Date(appliedFilters.dateTo + "T00:00:00").toLocaleDateString("pt-BR")
        : "Ate hoje";
      doc.text(`Periodo: ${periodoFrom} ate ${periodoTo}`, margin, 28);
      if (appliedFilters.lote && appliedFilters.lote !== "todos") {
        doc.text(`Lote: ${appliedFilters.lote}`, margin, 34);
      }
      doc.text(
        `Data do relatorio: ${new Date().toLocaleDateString("pt-BR")} as ${new Date().toLocaleTimeString("pt-BR")}`,
        margin,
        appliedFilters.lote && appliedFilters.lote !== "todos" ? 40 : 34
      );

      let startY = appliedFilters.lote && appliedFilters.lote !== "todos" ? 48 : 42;

      Object.entries(rocagensPorData).forEach(([data, areasGroup]) => {
        if (startY > doc.internal.pageSize.getHeight() - 30) {
          doc.addPage();
          startY = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${data} (${areasGroup.length} areas)`, margin, startY);
        startY += 2;

        autoTable(doc, {
          startY,
          margin: { left: margin, right: margin },
          head: [["ID", "Endereco", "Bairro", "Metragem (m2)", "Lote", "Data Rocagem", "Registrado Por"]],
          body: areasGroup.map((a) => [
            String(a.id),
            a.endereco || "-",
            a.bairro || "-",
            a.metragem_m2 ? a.metragem_m2.toLocaleString("pt-BR") : "-",
            a.lote ? String(a.lote) : "-",
            a.ultimaRocagem ? formatDateBR(a.ultimaRocagem) : "-",
            a.registradoPor || "-",
          ]),
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [80, 80, 80], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          didDrawPage: () => {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
              `Zeladoria em Tempo Real - CMTU-LD`,
              margin,
              doc.internal.pageSize.getHeight() - 8
            );
            doc.text(
              `Pagina ${doc.getNumberOfPages()}`,
              pageWidth - margin - 20,
              doc.internal.pageSize.getHeight() - 8
            );
            doc.setTextColor(0);
          },
        });

        startY = (doc as any).lastAutoTable.finalY + 8;
      });

      if (startY > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        startY = 20;
      }
      doc.setDrawColor(180);
      doc.line(margin, startY, pageWidth - margin, startY);
      startY += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Total de areas rocadas: ${rocagensFiltered.length}`, margin, startY);
      startY += 6;
      doc.text(
        `Metragem total: ${rocagensFiltered.reduce((sum, a) => sum + (a.metragem_m2 || 0), 0).toLocaleString("pt-BR")} m2`,
        margin,
        startY
      );

      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Relatório de Roçagens</h1>
          <p className="text-muted-foreground">Consulte todas as áreas roçadas em um período específico</p>
        </div>

        {/* Filtros */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filtrar por Período e Lote</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground">Data Inicial</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-2"
                  data-testid="input-date-from"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground">Data Final</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-2"
                  data-testid="input-date-to"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground">Lote</label>
                <Select value={selectedLote} onValueChange={setSelectedLote}>
                  <SelectTrigger className="mt-2" data-testid="select-lote">
                    <SelectValue placeholder="Todos os lotes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os lotes</SelectItem>
                    <SelectItem value="1">Lote 1</SelectItem>
                    <SelectItem value="2">Lote 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  onClick={handleConfirmFilters}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-confirm-filters"
                >
                  <Filter className="h-4 w-4" />
                  Confirmar
                </Button>
                <Button
                  onClick={handleExportPDF}
                  disabled={rocagensFiltered.length === 0}
                  className="gap-2"
                  data-testid="button-export-pdf"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Roçagens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rocagensFiltered.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Áreas Únicas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{new Set(rocagensFiltered.map(a => a.id)).size}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Metragem Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rocagensFiltered.reduce((sum, a) => sum + (a.metragem_m2 || 0), 0).toLocaleString()} m²</div>
            </CardContent>
          </Card>
        </div>

        {/* Conteúdo do Relatório (para PDF) */}
        <div
          id="relatorio-content"
          className="bg-white text-black p-8 rounded-lg mb-8"
        >
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">Relatório de Roçagens - Capina e Roçagem</h2>
            <p className="text-sm text-gray-600">
              Período: {appliedFilters.dateFrom ? new Date(appliedFilters.dateFrom).toLocaleDateString("pt-BR") : "Desde o início"} até{" "}
              {appliedFilters.dateTo ? new Date(appliedFilters.dateTo).toLocaleDateString("pt-BR") : "Até hoje"}
            </p>
            {appliedFilters.lote && (
              <p className="text-sm text-gray-600">
                Lote: {appliedFilters.lote}
              </p>
            )}
            <p className="text-sm text-gray-600 mt-1">
              Data do relatório: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}
            </p>
          </div>

          {Object.entries(rocagensPorData).length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma roçagem encontrada no período selecionado</p>
            </div>
          ) : (
            Object.entries(rocagensPorData).map(([data, areas]) => (
              <div key={data} className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-gray-300">
                  📅 {data} ({areas.length} áreas)
                </h3>
                <table className="w-full text-sm border-collapse mb-6">
                  <thead>
                    <tr className="bg-gray-200 text-gray-800">
                      <th className="border border-gray-300 p-3 text-left font-semibold">ID</th>
                      <th className="border border-gray-300 p-3 text-left font-semibold">Endereço</th>
                      <th className="border border-gray-300 p-3 text-left font-semibold">Bairro</th>
                      <th className="border border-gray-300 p-3 text-right font-semibold">Metragem (m²)</th>
                      <th className="border border-gray-300 p-3 text-center font-semibold">Lote</th>
                      <th className="border border-gray-300 p-3 text-left font-semibold">Data Roçagem</th>
                      <th className="border border-gray-300 p-3 text-left font-semibold">Registrado Por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map((area, idx) => (
                      <tr key={area.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="border border-gray-300 p-3">{area.id}</td>
                        <td className="border border-gray-300 p-3">{area.endereco}</td>
                        <td className="border border-gray-300 p-3">{area.bairro || "-"}</td>
                        <td className="border border-gray-300 p-3 text-right">{area.metragem_m2?.toLocaleString() || "-"}</td>
                        <td className="border border-gray-300 p-3 text-center">{area.lote || "-"}</td>
                        <td className="border border-gray-300 p-3">{area.ultimaRocagem ? formatDateBR(area.ultimaRocagem) : "-"}</td>
                        <td className="border border-gray-300 p-3">{area.registradoPor || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}

          {rocagensFiltered.length > 0 && (
            <div className="mt-8 pt-4 border-t-2 border-gray-300 text-sm text-gray-600">
              <p>Total de áreas roçadas: <strong>{rocagensFiltered.length}</strong></p>
              <p>Metragem total: <strong>{rocagensFiltered.reduce((sum, a) => sum + (a.metragem_m2 || 0), 0).toLocaleString()} m²</strong></p>
            </div>
          )}
        </div>

        {/* Visualização de Lista */}
        {rocagensFiltered.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Listagem Detalhada</h2>
            <div className="space-y-2">
              {rocagensFiltered.map((area) => (
                <Card key={area.id}>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Endereço</p>
                        <p className="font-medium">{area.endereco}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Bairro</p>
                        <p className="font-medium">{area.bairro || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Data da Roçagem</p>
                        <p className="font-medium">{area.ultimaRocagem ? formatDateBR(area.ultimaRocagem) : "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Registrado Por</p>
                        <p className="font-medium">{area.registradoPor || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Metragem</p>
                        <p className="font-medium">{area.metragem_m2?.toLocaleString() || "-"} m²</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Lote</p>
                        <Badge variant="outline">{area.lote || "-"}</Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">ID</p>
                        <p className="font-mono text-sm">{area.id}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge variant={area.status === "Concluído" ? "default" : "secondary"}>{area.status}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
