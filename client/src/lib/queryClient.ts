import { QueryClient, QueryFunction } from "@tanstack/react-query";

// "Modo Visualização" — fiscal de contrato liga esse modo pra consultar (sem
// editar) o serviço/lote que não é o dele. Enquanto ativo, os pedidos GET de
// área/ordem/cronograma/varrição levam ?verTudo=1, que o servidor aceita como
// bypass da restrição de lote/domínio SÓ pra sessões de fiscal (nunca pro
// encarregado). Guardado aqui como estado simples de módulo porque
// apiRequest/getQueryFn são funções puras usadas em dezenas de call sites —
// mais simples que fiar essa flag por todo canto.
let modoVisualizacaoAtivo = false;
const ouvintesModoVisualizacao = new Set<() => void>();

export function setModoVisualizacao(ativo: boolean) {
  modoVisualizacaoAtivo = ativo;
  ouvintesModoVisualizacao.forEach((fn) => fn());
}
export function getModoVisualizacao(): boolean {
  return modoVisualizacaoAtivo;
}
// Pra useSyncExternalStore — App.tsx (gate de rota) e Dashboard (o botão em
// si) precisam reagir ao mesmo estado, e eles não têm um ancestral React em
// comum que pudesse guardar isso como state normal.
export function subscribeModoVisualizacao(callback: () => void): () => void {
  ouvintesModoVisualizacao.add(callback);
  return () => ouvintesModoVisualizacao.delete(callback);
}

const PREFIXOS_COM_ESCOPO = ["/api/areas", "/api/ordens", "/api/cronogramas", "/api/varricao"];

// Só se aplica a leituras (GET) — o modo é de consulta, escrita nunca leva o
// bypass, mesmo que algum caminho de edição escape do que a UI já esconde.
export function comVerTudo(url: string, method: string = "GET"): string {
  if (!modoVisualizacaoAtivo || method !== "GET") return url;
  if (!PREFIXOS_COM_ESCOPO.some((p) => url.startsWith(p))) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}verTudo=1`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(comVerTudo(url, method), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(comVerTudo(queryKey.join("/") as string), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
