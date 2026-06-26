import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CalendarOff } from "lucide-react";
import "leaflet/dist/leaflet.css";

function formatDate(d: string) {
  if (!d) return "";
  const s = d.split("T")[0];
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}

export default function PublicCronogramaPage() {
  const params = useParams<{ lote: string }>();
  const lote = parseInt(params.lote || "1");
  const cronogramaId = new URLSearchParams(window.location.search).get("id");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const apiUrl = cronogramaId
    ? `/api/public/cronograma/${lote}?id=${cronogramaId}`
    : `/api/public/cronograma/${lote}`;

  const { data, isLoading } = useQuery<{ cronograma: any; areas: any[] }>({
    queryKey: [`/api/public/cronograma/${lote}`, cronogramaId],
    queryFn: async () => {
      const r = await fetch(apiUrl);
      return r.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const cronograma = data?.cronograma ?? null;
  const areas = data?.areas ?? [];
  const totalMetragem = areas.reduce(
    (s: number, a: any) => s + (a.metragem_m2 || 0),
    0
  );

  useEffect(() => {
    if (!mapRef.current || areas.length === 0) return;

    import("leaflet").then((mod) => {
      const L = mod.default;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current!).setView([-23.3045, -51.1696], 12);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      const bounds: [number, number][] = [];

      areas.forEach((area: any) => {
        if (area.lat && area.lng) {
          L.circleMarker([area.lat, area.lng], {
            radius: 9,
            fillColor: "#1e7a34",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85,
          })
            .bindPopup(
              `<b>${area.endereco}</b><br/>${area.tipo}${area.bairro ? "<br/>" + area.bairro : ""}`
            )
            .addTo(map);
          bounds.push([area.lat, area.lng]);
        }
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [areas]);

  return (
    <div className="min-h-screen" style={{ background: "#f5f7f5" }}>
      {/* Header */}
      <div style={{ background: "#1e5e38" }} className="text-white px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-green-300">
              CMTU — Companhia Municipal de Trânsito e Urbanização de Londrina
            </p>
            <h1 className="text-2xl font-bold mt-1">
              Programação de Roçagem
            </h1>
            <p className="text-green-200 mt-0.5 text-sm">
              {lote === 1 ? "Lote 1 — Zona Norte" : "Lote 2 — Zona Sul"}
            </p>
          </div>
          {cronograma && (
            <div className="text-right">
              <p className="text-xs text-green-300 uppercase tracking-wide">
                Semana programada
              </p>
              <p className="text-lg font-semibold mt-0.5">
                {formatDate(cronograma.semana_inicio)} a{" "}
                {formatDate(cronograma.semana_fim)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        )}

        {!isLoading && !cronograma && (
          <div className="text-center py-20">
            <CalendarOff className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-600">
              Sem programação para esta semana
            </h2>
            <p className="text-gray-400 mt-2 max-w-sm mx-auto">
              Não há cronograma de roçagem cadastrado para o{" "}
              {lote === 1 ? "Lote 1 — Zona Norte" : "Lote 2 — Zona Sul"} nesta
              semana.
            </p>
          </div>
        )}

        {!isLoading && cronograma && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  Áreas programadas
                </p>
                <p className="text-3xl font-bold text-emerald-700 mt-1">
                  {areas.length}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  Metragem total
                </p>
                <p className="text-3xl font-bold text-emerald-700 mt-1">
                  {totalMetragem.toLocaleString("pt-BR", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  <span className="text-xl font-normal text-gray-500">m²</span>
                </p>
              </div>
            </div>

            {/* Map */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-700 text-sm">
                  Localização das áreas programadas
                </h2>
              </div>
              <div ref={mapRef} style={{ height: 420 }} />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-700 text-sm">
                  Lista de áreas
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left font-medium text-gray-600">
                        Endereço
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">
                        Bairro
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">
                        Metragem (m²)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map((area: any, idx: number) => (
                      <tr
                        key={area.id}
                        className={`border-t border-gray-50 ${
                          idx % 2 === 1 ? "bg-gray-50/60" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-gray-800">
                          {area.endereco}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {area.bairro || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{area.tipo}</td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {area.metragem_m2
                            ? area.metragem_m2.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {cronograma.observacao && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-medium text-amber-800">Observação</p>
                <p className="text-sm text-amber-700 mt-1">
                  {cronograma.observacao}
                </p>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-center text-gray-400 mt-8 pb-4">
          CMTU Londrina · Programação atualizada automaticamente pela equipe de
          zeladoria
        </p>
      </div>
    </div>
  );
}
