import { useState, useEffect, useRef, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, TrendingUp, Target, Calendar, BarChart3, AlertCircle, Pencil, Check, X, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LoteStats {
  meta: number;
  totalM2: number;
  areasCount: number;
  mediaDiaria: number;
  faltaParaMeta: number;
  mediaNecessaria: number;
  percentualMeta: number;
  rocadoOntem: number;
  areasOntem: number;
}

interface MowingStats {
  periodo: { from: string; to: string };
  metaMensal: number;
  totalRocado: number;
  totalAreas: number;
  mediaDiaria: number;
  faltaParaMeta: number;
  diasDecorridos: number;
  diasRestantes: number;
  mediaNecessaria: number;
  percentualMeta: number;
  rocadoOntem: number;
  areasOntem: number;
  lote1: LoteStats;
  lote2: LoteStats;
}

function formatM2(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatM2Decimal(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ProgressBar({ percent, className = '', color }: { percent: number; className?: string; color?: string }) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const barColor = color || (clampedPercent >= 80 ? 'bg-emerald-500' : clampedPercent >= 50 ? 'bg-amber-500' : 'bg-red-500');
  
  return (
    <div className={`h-2 rounded-full bg-muted overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
}

function StatItem({ label, value, subtext, icon: Icon }: { label: string; value: string; subtext?: string; icon?: typeof TrendingUp }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="text-sm font-bold text-foreground">{value}</div>
      {subtext && <div className="text-[10px] text-muted-foreground">{subtext}</div>}
    </div>
  );
}

interface EditableMetaProps {
  label: string;
  value: number;
  configKey: string;
  color?: string;
}

function EditableMeta({ label, value, configKey, color }: EditableMetaProps) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');

  const mutation = useMutation({
    mutationFn: async (newMeta: number) => {
      await apiRequest('PATCH', '/api/config', { [configKey]: newMeta });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === '/api/stats/rocagem';
      }});
      setEditing(false);
    },
  });

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInput(value.toString());
    setEditing(true);
  };

  const handleSave = () => {
    const parsed = parseInt(input.replace(/\D/g, ''));
    if (parsed > 0) mutation.mutate(parsed);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold ${color ? color : 'text-muted-foreground'}`}>
        <Target className="h-3 w-3" />
        {label}
        {!editing && (
          <button onClick={handleStart} className="ml-1 text-muted-foreground/60" data-testid={`button-edit-${configKey}`}>
            <Pencil className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))}
            className="h-7 w-[100px] text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            data-testid={`input-edit-${configKey}`}
          />
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleSave(); }} disabled={mutation.isPending} data-testid={`button-save-${configKey}`}>
            <Check className="h-3 w-3 text-emerald-500" />
          </Button>
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(false); }} data-testid={`button-cancel-${configKey}`}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="text-sm font-bold text-foreground">{formatM2(value)} m²</div>
      )}
    </div>
  );
}

interface PdfAreaData {
  id: number;
  endereco: string;
  bairro: string;
  tipo: string;
  metragem: number;
  lote: number;
  ultimaRocagem: string;
}

interface PdfResponse {
  areas: PdfAreaData[];
  count: number;
  totalMetragem: number;
  periodo: { from: string; to: string };
  loteFilter: string;
}

function formatMetragem(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDateBR(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
}

function buildDailyDataForLote(areas: PdfAreaData[], lote: number) {
  const loteAreas = areas.filter(a => a.lote === lote);
  const dateMap: Record<string, number> = {};
  loteAreas.forEach(a => {
    if (a.ultimaRocagem) {
      dateMap[a.ultimaRocagem] = (dateMap[a.ultimaRocagem] || 0) + (a.metragem || 0);
    }
  });
  const dates = Object.keys(dateMap).sort();
  const values = dates.map(d => dateMap[d]);
  return { dates, values };
}

function buildMonthlyDataForLote(areas: PdfAreaData[], lote: number) {
  const loteAreas = areas.filter(a => a.lote === lote);
  const monthMap: Record<string, number> = {};
  loteAreas.forEach(a => {
    if (a.ultimaRocagem) {
      const key = a.ultimaRocagem.substring(0, 7);
      monthMap[key] = (monthMap[key] || 0) + (a.metragem || 0);
    }
  });
  const months = Object.keys(monthMap).sort();
  const values = months.map(m => monthMap[m]);
  return { months, values };
}

const LOTE_COLORS: Record<number, { r: number; g: number; b: number }> = {
  1: { r: 59, g: 130, b: 246 },
  2: { r: 139, g: 92, b: 246 },
};

const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function drawVectorBarChart(
  doc: jsPDF,
  title: string,
  labels: string[],
  values: number[],
  formatLabel: (key: string) => string,
  barColor: { r: number; g: number; b: number },
  chartArea: { x: number; y: number; w: number; h: number },
) {
  if (labels.length === 0) return;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(title, chartArea.x + chartArea.w / 2, chartArea.y - 4, { align: 'center' });

  const margin = { left: 28, right: 5, top: 4, bottom: 18 };
  const areaX = chartArea.x + margin.left;
  const areaY = chartArea.y + margin.top;
  const areaW = chartArea.w - margin.left - margin.right;
  const areaH = chartArea.h - margin.top - margin.bottom;

  let maxVal = Math.max(...values, 1);
  maxVal = Math.ceil(maxVal / 1000) * 1000;
  if (maxVal === 0) maxVal = 1000;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = areaY + areaH - (i / gridLines) * areaH;
    const val = (i / gridLines) * maxVal;
    doc.line(areaX, y, areaX + areaW, y);
    doc.text(formatMetragem(val), areaX - 2, y + 1, { align: 'right' });
  }

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.line(areaX, areaY, areaX, areaY + areaH);
  doc.line(areaX, areaY + areaH, areaX + areaW, areaY + areaH);

  const barCount = labels.length;
  const groupW = areaW / barCount;
  const barW = Math.min(groupW * 0.65, 12);
  const barGap = (groupW - barW) / 2;

  for (let i = 0; i < barCount; i++) {
    const val = values[i];
    const barH = (val / maxVal) * areaH;
    const barX = areaX + i * groupW + barGap;
    const barY = areaY + areaH - barH;

    doc.setFillColor(barColor.r, barColor.g, barColor.b);
    doc.rect(barX, barY, barW, barH, 'F');

    if (val > 0 && barH > 5) {
      doc.setFontSize(4.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(formatMetragem(val), barX + barW / 2, barY + 3, { align: 'center' });
    }

    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const labelText = formatLabel(labels[i]);
    const labelX = barX + barW / 2;
    const labelY = areaY + areaH + 3;
    if (barCount <= 15) {
      doc.text(labelText, labelX, labelY, { align: 'center' });
    } else {
      doc.text(labelText, labelX + 2, labelY, { align: 'right', angle: 35 });
    }
  }

  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const yAxisX = chartArea.x + 3;
  const yAxisY = areaY + areaH / 2;
  doc.text('Metragem (m\u00B2)', yAxisX, yAxisY, { angle: 90 });
}

function addPdfHeader(
  doc: jsPDF,
  pageWidth: number,
  fromFormatted: string,
  toFormatted: string,
  loteLabel: string,
  count: number,
  totalFormatted: string,
  extraFilters?: { bairro?: string; tipo?: string },
) {
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('CMTU-LD - Relatorio de Rocagem', pageWidth / 2, 14, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Periodo: ${fromFormatted} a ${toFormatted}`, pageWidth / 2, 20, { align: 'center' });

  const filterParts: string[] = [`Lote: ${loteLabel}`];
  if (extraFilters?.bairro) filterParts.push(`Bairro: ${extraFilters.bairro}`);
  if (extraFilters?.tipo) filterParts.push(`Tipo: ${extraFilters.tipo}`);
  filterParts.push(`Total: ${count} areas  |  ${totalFormatted} m2`);
  doc.text(filterParts.join('  |  '), pageWidth / 2, 26, { align: 'center' });
}

function addLoteTable(
  doc: jsPDF,
  loteAreas: PdfAreaData[],
  lote: number,
  startY: number,
  color: { r: number; g: number; b: number },
) {
  loteAreas.sort((a, b) => {
    const hasA = !!a.ultimaRocagem;
    const hasB = !!b.ultimaRocagem;
    if (hasA !== hasB) return hasA ? -1 : 1;
    if (hasA && hasB) {
      const dateA = new Date(a.ultimaRocagem).getTime();
      const dateB = new Date(b.ultimaRocagem).getTime();
      if (dateA !== dateB) return dateA - dateB;
    }
    return a.endereco.localeCompare(b.endereco, 'pt-BR');
  });

  const byDate: Record<string, PdfAreaData[]> = {};
  for (const area of loteAreas) {
    const dateKey = area.ultimaRocagem || 'sem-data';
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(area);
  }

  const dates = Object.keys(byDate).sort((a, b) => {
    if (a === 'sem-data') return 1;
    if (b === 'sem-data') return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  });

  const loteMetragem = loteAreas.reduce((s, a) => s + (a.metragem || 0), 0);
  const COLS = 6;
  const headColumns = ['#', 'Local (Endereco)', 'Bairro', 'Tipo', 'Metragem', 'Data da Rocagem'];
  const tableBody: any[][] = [];
  const subtotalRowIndices: number[] = [];
  const loteHeaderIndices: number[] = [];

  loteHeaderIndices.push(0);
  tableBody.push([
    { content: `LOTE ${lote}  -  ${loteAreas.length} areas  -  ${formatMetragem(loteMetragem)} m2`, colSpan: COLS, styles: { fontStyle: 'bold', fillColor: [color.r, color.g, color.b], textColor: 255, fontSize: 9, halign: 'left' } },
  ]);

  let idx = 0;
  for (const dateKey of dates) {
    const areasForDate = byDate[dateKey];
    for (const area of areasForDate) {
      idx++;
      tableBody.push([
        idx.toString(),
        area.endereco || '-',
        area.bairro || '-',
        area.tipo || '-',
        area.metragem ? formatMetragem(area.metragem) + ' m2' : '-',
        dateKey !== 'sem-data' ? formatDateBR(dateKey) : '-',
      ]);
    }
    const dayMetragem = areasForDate.reduce((s, a) => s + (a.metragem || 0), 0);
    subtotalRowIndices.push(tableBody.length);
    tableBody.push([
      { content: `Subtotal ${dateKey !== 'sem-data' ? formatDateBR(dateKey) : 'Sem data'}: ${areasForDate.length} areas  -  ${formatMetragem(dayMetragem)} m2`, colSpan: COLS, styles: { fontStyle: 'bold', fillColor: [Math.round(color.r * 0.15 + 255 * 0.85), Math.round(color.g * 0.15 + 255 * 0.85), Math.round(color.b * 0.15 + 255 * 0.85)], textColor: [30, 30, 30], fontSize: 8, halign: 'right' } },
    ]);
  }

  subtotalRowIndices.push(tableBody.length);
  tableBody.push([
    { content: `Total Lote ${lote}: ${loteAreas.length} areas  -  ${formatMetragem(loteMetragem)} m2`, colSpan: COLS, styles: { fontStyle: 'bold', fillColor: [Math.round(color.r * 0.3 + 255 * 0.7), Math.round(color.g * 0.3 + 255 * 0.7), Math.round(color.b * 0.3 + 255 * 0.7)], textColor: [0, 0, 0], fontSize: 9, halign: 'right' } },
  ]);

  autoTable(doc, {
    startY,
    head: [headColumns],
    body: tableBody,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [color.r, color.g, color.b], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 45 },
      3: { cellWidth: 35 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'center', cellWidth: 30 },
    },
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body') {
        const rowIndex = hookData.row.index;
        if (loteHeaderIndices.includes(rowIndex) || subtotalRowIndices.includes(rowIndex)) {
          hookData.cell.styles.fillColor = hookData.cell.styles.fillColor;
        }
      }
    },
  });
}

function generatePdf(data: PdfResponse, loteLabel: string, extraFilters?: { bairro?: string; tipo?: string }): { pdfData: ArrayBuffer; fileName: string } {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const fromFormatted = formatDateBR(data.periodo.from);
  const toFormatted = formatDateBR(data.periodo.to);
  const totalFormatted = formatMetragem(data.totalMetragem);
  const generatedAt = new Date().toLocaleString('pt-BR');

  const lotes = Array.from(new Set(data.areas.map(a => a.lote))).sort((a, b) => a - b);

  const fromMonth = data.periodo.from.substring(0, 7);
  const toMonth = data.periodo.to.substring(0, 7);
  const isMultiMonth = fromMonth !== toMonth;

  let needsNewPage = false;

  for (const lote of lotes) {
    const loteAreas = data.areas.filter(a => a.lote === lote);
    if (loteAreas.length === 0) continue;
    const color = LOTE_COLORS[lote] || LOTE_COLORS[1];

    const { dates: dailyDates, values: dailyValues } = buildDailyDataForLote(data.areas, lote);

    if (dailyDates.length > 0) {
      if (needsNewPage) doc.addPage();
      needsNewPage = true;
      addPdfHeader(doc, pageWidth, fromFormatted, toFormatted, loteLabel, data.count, totalFormatted, extraFilters);
      const chartArea = { x: 14, y: 36, w: pageWidth - 28, h: pageHeight - 52 };
      drawVectorBarChart(
        doc,
        `Evolucao Diaria - Lote ${lote}`,
        dailyDates,
        dailyValues,
        (key) => formatDateBR(key),
        color,
        chartArea,
      );
    }

    if (needsNewPage) doc.addPage(); else needsNewPage = true;
    addPdfHeader(doc, pageWidth, fromFormatted, toFormatted, loteLabel, data.count, totalFormatted, extraFilters);
    addLoteTable(doc, loteAreas, lote, 33, color);

    if (isMultiMonth) {
      const { months, values: monthlyValues } = buildMonthlyDataForLote(data.areas, lote);
      if (months.length > 1) {
        doc.addPage();
        addPdfHeader(doc, pageWidth, fromFormatted, toFormatted, loteLabel, data.count, totalFormatted, extraFilters);
        const chartArea = { x: 14, y: 36, w: pageWidth - 28, h: pageHeight - 52 };
        drawVectorBarChart(
          doc,
          `Evolucao Mensal - Lote ${lote}`,
          months,
          monthlyValues,
          (key) => {
            const [y, m] = key.split('-');
            return `${MONTH_NAMES[m] || m}/${y}`;
          },
          color,
          chartArea,
        );
      }
    }
  }

  if (lotes.length > 1) {
    const lastPageNum = doc.getNumberOfPages();
    doc.setPage(lastPageNum);
    const finalY = (doc as any).lastAutoTable?.finalY || 33;
    const y = Math.min(finalY + 6, pageHeight - 20);
    doc.setFillColor(50, 50, 60);
    doc.rect(14, y, pageWidth - 28, 8, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`TOTAL GERAL: ${data.count} areas  -  ${totalFormatted} m2`, pageWidth / 2, y + 5.5, { align: 'center' });
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - 15, pageHeight - 8, { align: 'right' });
    doc.text(`Gerado em: ${generatedAt}`, 15, pageHeight - 8);
  }

  const loteSlug = loteLabel.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '');
  const dateSlug = `${data.periodo.from}_a_${data.periodo.to}`;
  const fileName = `rocagem_${loteSlug}_${dateSlug}.pdf`;

  const pdfData = doc.output('arraybuffer') as ArrayBuffer;
  return { pdfData, fileName };
}

interface MowingStatsBarProps {
  visible?: boolean;
  onPeriodChange?: (from: string, to: string) => void;
  onPeriodClear?: () => void;
}

export function MowingStatsBar({ visible = true, onPeriodChange, onPeriodClear }: MowingStatsBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [showLoteSelector, setShowLoteSelector] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ pdfData: ArrayBuffer; fileName: string } | null>(null);
  const [filterBairro, setFilterBairro] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: lightAreas = [] } = useQuery<any[]>({
    queryKey: ['/api/areas/light'],
  });

  const bairroOptions = useMemo(() =>
    [...new Set(lightAreas.map((a: any) => a.bairro).filter(Boolean))].sort() as string[],
    [lightAreas]
  );

  const tipoOptions = useMemo(() =>
    [...new Set(lightAreas.map((a: any) => a.tipo).filter(Boolean))].sort() as string[],
    [lightAreas]
  );

  const queryParams = activeFrom && activeTo ? `?from=${activeFrom}&to=${activeTo}` : '';

  const { data: stats, isLoading, isError } = useQuery<MowingStats>({
    queryKey: ['/api/stats/rocagem', activeFrom, activeTo],
    queryFn: async () => {
      const res = await fetch(`/api/stats/rocagem${queryParams}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (!visible) return null;

  const handleApplyPeriod = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      setActiveFrom(customFrom);
      setActiveTo(customTo);
      onPeriodChange?.(customFrom, customTo);
    }
  };

  const handleClearPeriod = () => {
    setCustomFrom('');
    setCustomTo('');
    setActiveFrom('');
    setActiveTo('');
    setShowLoteSelector(false);
    onPeriodClear?.();
  };

  const handlePdfClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowLoteSelector(!showLoteSelector);
  };

  const handleGeneratePdf = async (loteFilter: 'all' | '1' | '2') => {
    const from = activeFrom || customFrom;
    const to = activeTo || customTo;
    if (!from || !to) return;

    setGeneratingPdf(true);
    setShowLoteSelector(false);
    try {
      const params = new URLSearchParams({ from, to, details: 'true', lote: loteFilter });
      if (filterBairro && filterBairro !== 'all') params.set('bairro', filterBairro);
      if (filterTipo && filterTipo !== 'all') params.set('tipo', filterTipo);
      const url = `/api/areas/by-period?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao buscar dados');
      const data: PdfResponse = await res.json();

      if (data.count === 0) {
        toast({ title: 'Nenhuma area encontrada', description: 'Nao ha areas rocadas neste periodo/filtro.', variant: 'destructive' });
        return;
      }

      const loteLabel = loteFilter === 'all' ? 'Ambos (1 e 2)' : `Lote ${loteFilter}`;
      const extraFilters = {
        bairro: filterBairro !== 'all' ? filterBairro : undefined,
        tipo: filterTipo !== 'all' ? filterTipo : undefined,
      };
      const result = generatePdf(data, loteLabel, extraFilters);
      setPdfPreview(result);
    } catch (err) {
      console.error('PDF generation error:', err);
      toast({ title: 'Erro ao gerar PDF', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!pdfPreview) return;
    const blob = new Blob([pdfPreview.pdfData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = pdfPreview.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClosePdfPreview = () => {
    setPdfPreview(null);
  };

  useEffect(() => {
    if (!pdfPreview || !pdfContainerRef.current) return;
    const container = pdfContainerRef.current;
    container.innerHTML = '';

    const renderPages = async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: pdfPreview.pdfData.slice(0) }).promise;
        const containerWidth = container.clientWidth || 800;
        const dpr = window.devicePixelRatio || 1;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const unscaledViewport = page.getViewport({ scale: 1 });
          const cssScale = (containerWidth - 32) / unscaledViewport.width;
          const renderScale = Math.max(cssScale, 1) * dpr;
          const viewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.style.maxWidth = '100%';
          canvas.style.marginBottom = '8px';
          canvas.style.borderRadius = '4px';
          canvas.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          container.appendChild(canvas);
        }
      } catch (err) {
        console.error('PDF render error:', err);
        container.innerHTML = '<p style="text-align:center;padding:2rem;color:#999;">Erro ao renderizar preview</p>';
      }
    };

    renderPages();
  }, [pdfPreview]);

  if (isError) {
    return (
      <div className="bg-background border-b border-border px-3 py-2 flex items-center gap-2" data-testid="mowing-stats-error">
        <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-xs text-muted-foreground">Erro ao carregar estatisticas</span>
      </div>
    );
  }

  if (isLoading || !stats) {
    return (
      <div className="bg-background border-b border-border px-3 py-2" data-testid="mowing-stats-loading">
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-2 flex-1 rounded-full bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const isCustomPeriod = activeFrom && activeTo;

  return (
    <div className="bg-background border-b border-border" data-testid="mowing-stats-bar">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex flex-col gap-1.5 transition-colors"
        data-testid="button-toggle-stats"
      >
        <div className="flex items-center gap-3 w-full">
          <BarChart3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-blue-500 font-semibold whitespace-nowrap">L1</span>
            <ProgressBar percent={stats.lote1.percentualMeta} className="flex-1 min-w-[40px]" color="bg-blue-500" />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap" data-testid="text-lote1-progress">
              {formatM2(stats.lote1.totalM2)} / {formatM2(stats.lote1.meta)} m²
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:inline">
              ({stats.lote1.percentualMeta.toFixed(1)}%)
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-3 w-full pl-7">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-violet-500 font-semibold whitespace-nowrap">L2</span>
            <ProgressBar percent={stats.lote2.percentualMeta} className="flex-1 min-w-[40px]" color="bg-violet-500" />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap" data-testid="text-lote2-progress">
              {formatM2(stats.lote2.totalM2)} / {formatM2(stats.lote2.meta)} m²
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:inline">
              ({stats.lote2.percentualMeta.toFixed(1)}%)
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-4 border-t border-border pt-3" data-testid="stats-expanded-panel">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatItem
              icon={TrendingUp}
              label={isCustomPeriod ? "Total no periodo" : "Total no mes"}
              value={`${formatM2(stats.totalRocado)} m²`}
              subtext={`${stats.totalAreas} areas`}
            />
            <StatItem
              label="Media diaria geral"
              value={`${formatM2Decimal(stats.mediaDiaria)} m²`}
              subtext={`${stats.diasDecorridos} dias uteis`}
            />
            <StatItem
              icon={Calendar}
              label="Rocado ontem"
              value={`${formatM2(stats.rocadoOntem)} m²`}
              subtext={`${stats.areasOntem} areas`}
            />
          </div>

          <div className="border-t border-border pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-500">Lote 1</span>
                <ProgressBar percent={stats.lote1.percentualMeta} className="flex-1" color="bg-blue-500" />
                <span className="text-[10px] text-muted-foreground font-semibold">{stats.lote1.percentualMeta.toFixed(1)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditableMeta label="Meta L1" value={stats.lote1.meta} configKey="metaLote1" color="text-blue-500" />
                <StatItem label="Rocado" value={`${formatM2(stats.lote1.totalM2)} m²`} subtext={`${stats.lote1.areasCount} areas`} />
                <StatItem label="Media diaria" value={`${formatM2Decimal(stats.lote1.mediaDiaria)} m²`} />
                {!isCustomPeriod && (
                  <StatItem label="Falta p/ meta" value={`${formatM2(stats.lote1.faltaParaMeta)} m²`} subtext={`${stats.diasRestantes} dias uteis`} />
                )}
                {!isCustomPeriod && (
                  <StatItem label="Media necessaria" value={`${formatM2Decimal(stats.lote1.mediaNecessaria)} m²/dia`} />
                )}
                <StatItem label="Ontem" value={`${formatM2(stats.lote1.rocadoOntem)} m²`} subtext={`${stats.lote1.areasOntem} areas`} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-violet-500">Lote 2</span>
                <ProgressBar percent={stats.lote2.percentualMeta} className="flex-1" color="bg-violet-500" />
                <span className="text-[10px] text-muted-foreground font-semibold">{stats.lote2.percentualMeta.toFixed(1)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditableMeta label="Meta L2" value={stats.lote2.meta} configKey="metaLote2" color="text-violet-500" />
                <StatItem label="Rocado" value={`${formatM2(stats.lote2.totalM2)} m²`} subtext={`${stats.lote2.areasCount} areas`} />
                <StatItem label="Media diaria" value={`${formatM2Decimal(stats.lote2.mediaDiaria)} m²`} />
                {!isCustomPeriod && (
                  <StatItem label="Falta p/ meta" value={`${formatM2(stats.lote2.faltaParaMeta)} m²`} subtext={`${stats.diasRestantes} dias uteis`} />
                )}
                {!isCustomPeriod && (
                  <StatItem label="Media necessaria" value={`${formatM2Decimal(stats.lote2.mediaNecessaria)} m²/dia`} />
                )}
                <StatItem label="Ontem" value={`${formatM2(stats.lote2.rocadoOntem)} m²`} subtext={`${stats.lote2.areasOntem} areas`} />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Busca por periodo</div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Select value={filterBairro} onValueChange={setFilterBairro}>
                <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="select-filter-bairro">
                  <SelectValue placeholder="Todos os bairros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os bairros</SelectItem>
                  {bairroOptions.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-filter-tipo">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {tipoOptions.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">De:</label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-[140px] text-xs"
                  data-testid="input-stats-from"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Ate:</label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-[140px] text-xs"
                  data-testid="input-stats-to"
                />
              </div>
              <Button
                size="sm"
                onClick={handleApplyPeriod}
                disabled={!customFrom || !customTo || customFrom > customTo}
                data-testid="button-apply-period"
              >
                Aplicar
              </Button>
              {(isCustomPeriod || (customFrom && customTo && customFrom <= customTo)) && (
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePdfClick}
                    disabled={generatingPdf}
                    data-testid="button-pdf-period"
                  >
                    {generatingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                    <span className="ml-1">PDF</span>
                  </Button>
                  {showLoteSelector && (
                    <div className="absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-md shadow-lg p-2 z-50 min-w-[160px]" data-testid="pdf-lote-selector">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">Selecione o lote</div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="ghost" className="justify-start text-xs" onClick={() => handleGeneratePdf('1')} data-testid="button-pdf-lote1">
                          Lote 1
                        </Button>
                        <Button size="sm" variant="ghost" className="justify-start text-xs" onClick={() => handleGeneratePdf('2')} data-testid="button-pdf-lote2">
                          Lote 2
                        </Button>
                        <Button size="sm" variant="ghost" className="justify-start text-xs" onClick={() => handleGeneratePdf('all')} data-testid="button-pdf-ambos">
                          Ambos (Lote 1 e 2)
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isCustomPeriod && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearPeriod}
                  data-testid="button-clear-period"
                >
                  Limpar
                </Button>
              )}
            </div>
            {customFrom && customTo && customFrom > customTo && (
              <div className="mt-1 text-xs text-destructive">
                A data inicial deve ser anterior a data final
              </div>
            )}
            {isCustomPeriod && (
              <div className="mt-2 text-xs text-muted-foreground">
                Periodo: {new Date(stats.periodo.from + 'T12:00:00').toLocaleDateString('pt-BR')} a{' '}
                {new Date(stats.periodo.to + 'T12:00:00').toLocaleDateString('pt-BR')}
              </div>
            )}
          </div>
        </div>
      )}

      {pdfPreview && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" data-testid="pdf-preview-overlay" onClick={handleClosePdfPreview}>
          <div className="bg-background rounded-md shadow-xl flex flex-col" style={{ width: '92vw', height: '92vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border flex-wrap">
              <span className="text-sm font-semibold text-foreground truncate">{pdfPreview.fileName}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleDownloadPdf} data-testid="button-download-pdf">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />
                  Baixar PDF
                </Button>
                <Button size="sm" variant="outline" onClick={handleClosePdfPreview} data-testid="button-close-pdf-preview">
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Fechar
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4 bg-muted/50" ref={pdfContainerRef} data-testid="pdf-pages-container">
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Renderizando preview...
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
