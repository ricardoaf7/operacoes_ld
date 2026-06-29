import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface StatusEntry { name: string; value: number; fill: string }
interface LoteEntry   { name: string; total: number; executando: number }
interface DaysEntry   { range: string; count: number }
interface BairroEntry { name: string; value: number }

interface Props {
  statusData: StatusEntry[];
  servicoData: StatusEntry[];
  loteData: LoteEntry[];
  daysDistribution: DaysEntry[];
  bairroData: BairroEntry[];
}

export default function RelatoriosCharts({ statusData, servicoData, loteData, daysDistribution, bairroData }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Status</CardTitle>
          <CardDescription>Percentual de áreas por status</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80} fill="#8884d8" dataKey="value">
                {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Serviço</CardTitle>
          <CardDescription>Áreas do módulo ativo do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={servicoData} cx="50%" cy="50%" labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80} fill="#8884d8" dataKey="value">
                {servicoData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

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
  );
}
