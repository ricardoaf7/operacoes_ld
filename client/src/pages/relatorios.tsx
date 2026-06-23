import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { AlertCircle, CheckCircle2, Clock, MapPin } from "lucide-react";
import type { ServiceArea } from "@shared/schema";

export default function RelatoriosPage() {
  const { data: areas = [] } = useQuery<ServiceArea[]>({
    queryKey: ["/api/areas/light"],
  });

  // Calcular estatísticas
  const stats = {
    total: areas.length,
    executando: areas.filter(a => a.executando === true).length,
    pendente: areas.filter(a => a.status === "Pendente").length,
    concluido: areas.filter(a => a.status === "Concluído").length,
    rocagem: areas.filter(a => a.servico === "rocagem" || !a.servico).length,
  };

  // Dados por status
  const statusData = [
    { name: "Em Execução", value: stats.executando, fill: "#10b981" },
    { name: "Pendente", value: stats.pendente, fill: "#f59e0b" },
    { name: "Concluído", value: stats.concluido, fill: "#3b82f6" },
  ];

  // Dados por serviço
  const servicoData = [
    { name: "Capina e Roçagem", value: stats.rocagem, fill: "#0086ff" },
  ];

  // Dados por lote
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

  // Dados de dias desde última roçagem (para rocagem)
  const getDaysSinceMowing = (area: ServiceArea): number => {
    if (!area.ultimaRocagem) return -1;
    const today = new Date();
    const lastMow = new Date(area.ultimaRocagem);
    return Math.floor((today.getTime() - lastMow.getTime()) / (1000 * 60 * 60 * 24));
  };

  const rocagemAreas = areas.filter(a => a.servico === "rocagem" || !a.servico);
  const daysDistribution = [
    { 
      range: "0-5 dias", 
      count: rocagemAreas.filter(a => {
        const days = getDaysSinceMowing(a);
        return days >= 0 && days <= 5;
      }).length 
    },
    { 
      range: "6-15 dias", 
      count: rocagemAreas.filter(a => {
        const days = getDaysSinceMowing(a);
        return days >= 6 && days <= 15;
      }).length 
    },
    { 
      range: "16-30 dias", 
      count: rocagemAreas.filter(a => {
        const days = getDaysSinceMowing(a);
        return days >= 16 && days <= 30;
      }).length 
    },
    { 
      range: "31-45 dias", 
      count: rocagemAreas.filter(a => {
        const days = getDaysSinceMowing(a);
        return days >= 31 && days <= 45;
      }).length 
    },
    { 
      range: "46-60 dias", 
      count: rocagemAreas.filter(a => {
        const days = getDaysSinceMowing(a);
        return days >= 46 && days <= 60;
      }).length 
    },
    { 
      range: ">60 dias", 
      count: rocagemAreas.filter(a => {
        const days = getDaysSinceMowing(a);
        return days > 60;
      }).length 
    },
    { 
      range: "Sem Registro", 
      count: rocagemAreas.filter(a => getDaysSinceMowing(a) === -1).length 
    },
  ];

  // Bairros com mais áreas
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

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Status</CardTitle>
              <CardDescription>Percentual de áreas por status</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Serviço Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Serviço</CardTitle>
              <CardDescription>Áreas do módulo ativo do sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={servicoData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {servicoData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Lote Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Áreas por Lote</CardTitle>
              <CardDescription>Comparativo total e em execução</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={loteData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" fill="#0086ff" name="Total" />
                  <Bar dataKey="executando" fill="#10b981" name="Em Execução" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Dias desde última roçagem */}
          <Card>
            <CardHeader>
              <CardTitle>Ciclo de Roçagem (60 dias)</CardTitle>
              <CardDescription>Distribuição de dias desde última manutenção</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={daysDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" name="Áreas" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Bairros */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Top 10 Bairros com Mais Áreas</CardTitle>
              <CardDescription>Bairros com maior concentração de áreas gerenciadas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={bairroData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8b5cf6" name="Áreas" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
