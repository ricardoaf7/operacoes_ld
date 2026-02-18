import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, TrendingUp, Target, Calendar, BarChart3, AlertCircle, Pencil, Check, X, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

function buildDailyData(areas: PdfAreaData[], lotes: number[]) {
  const allDates = new Set<string>();
  areas.forEach(a => { if (a.ultimaRocagem) allDates.add(a.ultimaRocagem); });
  const sortedDates = Array.from(allDates).sort();

  const dataByLote: Record<number, Record<string, number>> = {};
  for (const lote of lotes) {
    dataByLote[lote] = {};
    for (const d of sortedDates) dataByLote[lote][d] = 0;
  }
  areas.forEach(a => {
    if (a.ultimaRocagem && dataByLote[a.lote]) {
      dataByLote[a.lote][a.ultimaRocagem] += (a.metragem || 0);
    }
  });

  return { dates: sortedDates, dataByLote };
}

function buildMonthlyData(areas: PdfAreaData[], lotes: number[]) {
  const allMonths = new Set<string>();
  areas.forEach(a => {
    if (a.ultimaRocagem) allMonths.add(a.ultimaRocagem.substring(0, 7));
  });
  const sortedMonths = Array.from(allMonths).sort();

  const dataByLote: Record<number, Record<string, number>> = {};
  for (const lote of lotes) {
    dataByLote[lote] = {};
    for (const m of sortedMonths) dataByLote[lote][m] = 0;
  }
  areas.forEach(a => {
    if (a.ultimaRocagem && dataByLote[a.lote]) {
      const monthKey = a.ultimaRocagem.substring(0, 7);
      dataByLote[a.lote][monthKey] += (a.metragem || 0);
    }
  });

  return { months: sortedMonths, dataByLote };
}

const LOTE_COLORS: Record<number, { bar: string; barLight: string; label: string }> = {
  1: { bar: '#2980b9', barLight: '#5dade2', label: 'Lote 1' },
  2: { bar: '#e67e22', barLight: '#f0b27a', label: 'Lote 2' },
};

function drawBarChart(
  title: string,
  labels: string[],
  dataByLote: Record<number, Record<string, number>>,
  lotes: number[],
  formatLabel: (key: string) => string,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const margin = { top: 70, right: 30, bottom: 80, left: 90 };
  const chartW = canvasWidth - margin.left - margin.right;
  const chartH = canvasHeight - margin.top - margin.bottom;

  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvasWidth / 2, 35);

  if (lotes.length > 1) {
    let legendX = canvasWidth / 2 - 100;
    for (const lote of lotes) {
      const color = LOTE_COLORS[lote] || LOTE_COLORS[1];
      ctx.fillStyle = color.bar;
      ctx.fillRect(legendX, 48, 16, 12);
      ctx.fillStyle = '#333';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(color.label, legendX + 22, 59);
      legendX += 110;
    }
  }

  let maxVal = 0;
  for (const lote of lotes) {
    for (const key of labels) {
      const val = dataByLote[lote]?.[key] || 0;
      if (val > maxVal) maxVal = val;
    }
  }
  if (maxVal === 0) maxVal = 1000;
  maxVal = Math.ceil(maxVal / 1000) * 1000;

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#666';
  ctx.font = '12px Arial';
  ctx.textAlign = 'right';
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = margin.top + chartH - (i / gridLines) * chartH;
    const val = (i / gridLines) * maxVal;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartW, y);
    ctx.stroke();
    ctx.fillText(formatMetragem(val), margin.left - 8, y + 4);
  }

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + chartH);
  ctx.lineTo(margin.left + chartW, margin.top + chartH);
  ctx.stroke();

  const groupCount = labels.length;
  const groupWidth = chartW / groupCount;
  const barsPerGroup = lotes.length;
  const barPadding = groupWidth * 0.15;
  const totalBarSpace = groupWidth - barPadding * 2;
  const barWidth = Math.min(totalBarSpace / barsPerGroup - 2, 50);
  const barGap = barsPerGroup > 1 ? (totalBarSpace - barWidth * barsPerGroup) / (barsPerGroup - 1) : 0;

  for (let gi = 0; gi < groupCount; gi++) {
    const key = labels[gi];
    const groupX = margin.left + gi * groupWidth;

    for (let li = 0; li < lotes.length; li++) {
      const lote = lotes[li];
      const val = dataByLote[lote]?.[key] || 0;
      const barH = (val / maxVal) * chartH;
      const barX = groupX + barPadding + li * (barWidth + barGap);
      const barY = margin.top + chartH - barH;

      const color = LOTE_COLORS[lote] || LOTE_COLORS[1];
      ctx.fillStyle = color.bar;
      ctx.fillRect(barX, barY, barWidth, barH);

      if (val > 0 && barH > 18) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(formatMetragem(val), barX + barWidth / 2, barY + 14);
      }
    }

    ctx.save();
    ctx.fillStyle = '#333';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    const labelX = groupX + groupWidth / 2;
    const labelY = margin.top + chartH + 12;
    ctx.translate(labelX, labelY);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(formatLabel(key), 0, 0);
    ctx.restore();
  }

  ctx.fillStyle = '#666';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(18, margin.top + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Metragem (m\u00B2)', 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

function addPdfHeader(doc: jsPDF, pageWidth: number, fromFormatted: string, toFormatted: string, loteLabel: string, count: number, totalFormatted: string) {
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CMTU-LD - Relatorio de Rocagem', pageWidth / 2, 15, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periodo: ${fromFormatted} a ${toFormatted}`, pageWidth / 2, 22, { align: 'center' });
  doc.text(`Lote: ${loteLabel}  |  Total de areas: ${count}  |  Metragem total: ${totalFormatted} m2`, pageWidth / 2, 28, { align: 'center' });
}

function generatePdf(data: PdfResponse, loteLabel: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const fromFormatted = formatDateBR(data.periodo.from);
  const toFormatted = formatDateBR(data.periodo.to);
  const totalFormatted = formatMetragem(data.totalMetragem);
  const generatedAt = new Date().toLocaleString('pt-BR');

  const lotes = Array.from(new Set(data.areas.map(a => a.lote))).sort((a, b) => a - b);

  const { dates: dailyDates, dataByLote: dailyByLote } = buildDailyData(data.areas, lotes);
  const { months: monthlyMonths, dataByLote: monthlyByLote } = buildMonthlyData(data.areas, lotes);

  addPdfHeader(doc, pageWidth, fromFormatted, toFormatted, loteLabel, data.count, totalFormatted);

  if (dailyDates.length > 0) {
    const chartW = Math.max(800, dailyDates.length * 60);
    const dailyImg = drawBarChart(
      'Comparativo Diario - Metragem Rocada por Dia',
      dailyDates,
      dailyByLote,
      lotes,
      (key) => formatDateBR(key),
      chartW,
      420,
    );
    const imgW = pageWidth - 28;
    const imgH = (pageHeight - 42);
    doc.addImage(dailyImg, 'PNG', 14, 33, imgW, imgH);
  }

  if (monthlyMonths.length > 0) {
    doc.addPage();
    addPdfHeader(doc, pageWidth, fromFormatted, toFormatted, loteLabel, data.count, totalFormatted);

    const monthNames: Record<string, string> = {
      '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
      '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
      '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
    };
    const chartW = Math.max(600, monthlyMonths.length * 120);
    const monthlyImg = drawBarChart(
      'Comparativo Mensal - Metragem Rocada por Mes',
      monthlyMonths,
      monthlyByLote,
      lotes,
      (key) => {
        const [y, m] = key.split('-');
        return `${monthNames[m] || m}/${y}`;
      },
      chartW,
      420,
    );
    const imgW = pageWidth - 28;
    const imgH = (pageHeight - 42);
    doc.addImage(monthlyImg, 'PNG', 14, 33, imgW, imgH);
  }

  doc.addPage();
  addPdfHeader(doc, pageWidth, fromFormatted, toFormatted, loteLabel, data.count, totalFormatted);

  const groupedByLote: Record<number, Record<string, PdfAreaData[]>> = {};
  for (const lote of lotes) {
    const loteAreas = data.areas.filter(a => a.lote === lote);
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
    groupedByLote[lote] = byDate;
  }

  const headColumns = ['#', 'Local (Endereco)', 'Bairro', 'Metragem', 'Data da Rocagem'];
  const tableBody: any[][] = [];
  const subtotalRowIndices: number[] = [];
  const loteHeaderIndices: number[] = [];
  const grandTotalIndex: number[] = [];

  let globalIndex = 0;

  for (const lote of lotes) {
    loteHeaderIndices.push(tableBody.length);
    const loteMetragemTotal = data.areas.filter(a => a.lote === lote).reduce((s, a) => s + (a.metragem || 0), 0);
    const loteAreaCount = data.areas.filter(a => a.lote === lote).length;
    tableBody.push([
      { content: `LOTE ${lote}  -  ${loteAreaCount} areas  -  ${formatMetragem(loteMetragemTotal)} m2`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [41, 128, 185], textColor: 255, fontSize: 9, halign: 'left' } },
    ]);

    const dateGroups = groupedByLote[lote];
    const dates = Object.keys(dateGroups).sort((a, b) => {
      if (a === 'sem-data') return 1;
      if (b === 'sem-data') return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });

    for (const dateKey of dates) {
      const areasForDate = dateGroups[dateKey];
      for (const area of areasForDate) {
        globalIndex++;
        tableBody.push([
          globalIndex.toString(),
          area.endereco || '-',
          area.bairro || '-',
          area.metragem ? formatMetragem(area.metragem) + ' m2' : '-',
          dateKey !== 'sem-data' ? formatDateBR(dateKey) : '-',
        ]);
      }

      const dayMetragem = areasForDate.reduce((s, a) => s + (a.metragem || 0), 0);
      subtotalRowIndices.push(tableBody.length);
      tableBody.push([
        { content: `Subtotal ${dateKey !== 'sem-data' ? formatDateBR(dateKey) : 'Sem data'}: ${areasForDate.length} areas  -  ${formatMetragem(dayMetragem)} m2`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [220, 230, 241], textColor: [30, 30, 30], fontSize: 8, halign: 'right' } },
      ]);
    }

    subtotalRowIndices.push(tableBody.length);
    tableBody.push([
      { content: `Total Lote ${lote}: ${loteAreaCount} areas  -  ${formatMetragem(loteMetragemTotal)} m2`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [180, 210, 240], textColor: [0, 0, 0], fontSize: 9, halign: 'right' } },
    ]);
  }

  if (lotes.length > 1) {
    grandTotalIndex.push(tableBody.length);
    tableBody.push([
      { content: `TOTAL GERAL: ${data.count} areas  -  ${totalFormatted} m2`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [41, 128, 185], textColor: 255, fontSize: 10, halign: 'center' } },
    ]);
  }

  autoTable(doc, {
    startY: 33,
    head: [headColumns],
    body: tableBody,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 55 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'center', cellWidth: 32 },
    },
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body') {
        const rowIndex = hookData.row.index;
        if (loteHeaderIndices.includes(rowIndex) || subtotalRowIndices.includes(rowIndex) || grandTotalIndex.includes(rowIndex)) {
          hookData.cell.styles.fillColor = hookData.cell.styles.fillColor;
        }
      }
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - 15, pageHeight - 8, { align: 'right' });
    doc.text(`Gerado em: ${generatedAt}`, 15, pageHeight - 8);
  }

  const loteSlug = loteLabel.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '');
  const dateSlug = `${data.periodo.from}_a_${data.periodo.to}`;
  doc.save(`rocagem_${loteSlug}_${dateSlug}.pdf`);
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
  const { toast } = useToast();

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
      const url = `/api/areas/by-period?from=${from}&to=${to}&details=true&lote=${loteFilter}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao buscar dados');
      const data: PdfResponse = await res.json();
      
      if (data.count === 0) {
        toast({ title: 'Nenhuma area encontrada', description: 'Nao ha areas rocadas neste periodo/lote.', variant: 'destructive' });
        return;
      }
      
      const loteLabel = loteFilter === 'all' ? 'Ambos (1 e 2)' : `Lote ${loteFilter}`;
      generatePdf(data, loteLabel);
      toast({ title: 'PDF gerado!', description: `${data.count} areas exportadas.` });
    } catch (err) {
      console.error('PDF generation error:', err);
      toast({ title: 'Erro ao gerar PDF', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setGeneratingPdf(false);
    }
  };

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
    </div>
  );
}
