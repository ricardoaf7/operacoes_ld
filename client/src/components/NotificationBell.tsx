import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Notificacao } from "@shared/schema";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: notificacoes = [] } = useQuery<Notificacao[]>({
    queryKey: ["/api/notificacoes"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notificacoes");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const naoLidas = notificacoes.filter(n => !n.lida).length;

  const marcarLidaMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notificacoes/${id}/lida`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notificacoes"] }),
  });

  const marcarTodasMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notificacoes/lida-todas");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notificacoes"] }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-5 w-5" />
          {naoLidas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0 z-[9999]"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">Notificações</span>
          {naoLidas > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => marcarTodasMutation.mutate()}
              disabled={marcarTodasMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        {/* Lista */}
        <div className="max-h-[400px] overflow-y-auto">
          {notificacoes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notificacoes.map(n => (
              <div
                key={n.id}
                className={`flex gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors ${
                  !n.lida ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug ${!n.lida ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                      {n.titulo}
                    </p>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0 mt-0.5">
                      {n.createdAt ? timeAgo(n.createdAt) : ""}
                    </span>
                  </div>
                  {n.mensagem && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>
                  )}
                </div>
                {!n.lida && (
                  <button
                    className="flex-shrink-0 mt-1 text-muted-foreground hover:text-emerald-500 transition-colors"
                    onClick={() => marcarLidaMutation.mutate(n.id)}
                    title="Marcar como lida"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
