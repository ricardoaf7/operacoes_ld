import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Camera, LogOut } from "lucide-react";

export default function EncarregadoPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Cabeçalho */}
      <header className="px-4 py-4 border-b border-border flex items-center justify-between"
        style={{ background: "#1e5e38" }}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-green-300">
            CMTU Londrina — Zeladoria
          </p>
          <h1 className="text-lg font-bold text-white">Registro de Varrição</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout()}
          className="text-white hover:bg-white/10"
          title="Sair"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mb-5">
          <Camera className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          Olá, {user?.nome?.split(" ")[0]}!
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Em breve você vai registrar as fotos dos serviços de varrição e
          lavação por aqui, direto do celular. A tela de envio de fotos está
          em construção.
        </p>
      </main>

      <footer className="px-4 py-3 text-center">
        <p className="text-[11px] text-muted-foreground">
          CMTU — Companhia Municipal de Trânsito e Urbanização de Londrina
        </p>
      </footer>
    </div>
  );
}
