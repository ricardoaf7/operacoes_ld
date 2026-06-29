import { useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, MapPin } from "lucide-react";
import type { ServiceArea } from "@shared/schema";

const RechartsCharts = lazy(() => import("@/components/RelatoriosCharts"));

export default function RelatoriosPage() {
  const { data: areas = [] } = useQuery<ServiceArea[]>({
    queryKey: ["/api/areas/light"],
  });

  const getDaysSinceMowing = (area: ServiceArea): number => {
    if (!area.ultimaRocagem) return -1;
    const today = new Date();
    const lastMow = new Date(area.ultimaRocagem);
    return Math.floor((today.getTime() - lastMow.getTime()) / (1000 * 60 * 60 * 24));
  };

  const { stats, statusData, servicoData, loteData, daysDistribution, bairroData } = useMemo(() => {
    const stats = {
      total: areas.length,
      executando: areas.filter(a => a.executando === true).length,
      pendente: areas.filter(a => a.status === "Pendente").length,
      concluido: areas.filter(a => a.status === "Concluído").length,
      rocagem: areas.filter(a => a.servico === "rocagem" || !a.servico).length,
    };

    const statusData = [
      { name: "Em Execução", value: stats.executando, fill: "#10b981" },
      { name: "Pendente", value: stats.pendente, fill: "#f59e0b" },
      { name: "Concluído", value: stats.concluido, fill: "#3b82f6" },
    ];

    const servicoData = [
      { name: "Capina e Roçagem", value: stats.rocagem, fill: "#0086ff" },
    ];

    const loteData = [
      {
        name: "Lote 1",
        total: areas.filter(a => a.lote === 1).length,
        executando: areas.filter(a => a.lote === 1 && a.executando === true).length,
      },
      {
        name: "Lote 2",
        total: areas.filter(a => a.lote === 2).length,
        executando: areas.filter(a => a.lote === 2 && a.executando === true).length,
      },
    ];

    const rocagemAreas = areas.filter(a => a.servico === "rocagem" || !a.servico);
    const daysDistribution = [
      { range: "0-5 dias",    count: rocagemAreas.filter(a => { const d = getDaysSinceMowing(a); return d >= 0 && d <= 5; }).length },
      { range: "6-15 dias",   count: rocagemAreas.filter(a => { const d = getDaysSinceMowing(a); return d >= 6 && d <= 15; }).length },
      { range: "16-30 dias",  count: rocagemAreas.filter(a => { const d = getDaysSinceMowing(a); return d >= 16 && d <= 30; }).length },
      { range: "31-45 dias",  count: rocagemAreas.filter(a => { const d = getDaysSinceMowing(a); return d >= 31 && d <= 45; }).length },
      { range: "46-60 dias",  count: rocagemAreas.filter(a => { const d = getDaysSinceMowing(a); return d >= 46 && d <= 60; }).length },
      { range: ">60 dias",    count: rocagemAreas.filter(a => getDaysSinceMowing(a) > 60).length },
      { range: "Sem Registro",count: rocagemAreas.filter(a => getDaysSinceMowing(a) === -1).length },
    ];

    const bairroData = Object.entries(
      areas.reduce((acc, area) => {
        const bairro = area.bairro || "Sem Bairro";
        acc[bairro] = (acc[bairro] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    return { stats, statusData, servicoData, loteData, daysDistribution, bairroData };
  }, [areas]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Relatórios Operacionais</h1>
          <p className="text-muted-foreground">Dashboard de estatísticas e análises do sistema</p>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Áreas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">áreas cadastradas</p>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Em Execução
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.executando}</div>
              <p className="text-xs text-muted-foreground mt-1">{((stats.executando / stats.total) * 100).toFixed(1)}% do total</p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pendente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pendente}</div>
              <p className="text-xs text-muted-foreground mt-1">{((stats.pendente / stats.total) * 100).toFixed(1)}% do total</p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Concluído
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.concluido}</div>
              <p className="text-xs text-muted-foreground mt-1">{((stats.concluido / stats.total) * 100).toFixed(1)}% do total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Lotes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Badge variant="outline">{stats.rocagem} áreas ativas</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos — carregados de forma assíncrona para não bloquear o bundle inicial */}
        <Suspense fallback={
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Carregando gráficos...
          </div>
        }>
          <RechartsCharts
            statusData={statusData}
            servicoData={servicoData}
            loteData={loteData}
            daysDistribution={daysDistribution}
            bairroData={bairroData}
          />
        </Suspense>
      </div>
    </div>
  );
}
