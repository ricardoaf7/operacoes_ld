import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock } from "lucide-react";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { toast } = useToast();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      toast({ variant: "destructive", title: "Preencha todos os campos" });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      toast({ variant: "destructive", title: "As senhas não coincidem" });
      return;
    }

    if (novaSenha.length < 4) {
      toast({ variant: "destructive", title: "A nova senha deve ter pelo menos 4 caracteres" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/change-password", {
        senhaAtual,
        novaSenha,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao alterar senha");
      }

      toast({ title: "Senha alterada com sucesso" });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Não foi possível alterar a senha",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setSenhaAtual("");
        setNovaSenha("");
        setConfirmarSenha("");
      }
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-change-password">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Alterar Senha
          </DialogTitle>
          <DialogDescription>
            Digite sua senha atual e a nova senha desejada.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="senha-atual">Senha Atual</label>
            <Input
              id="senha-atual"
              type="password"
              placeholder="Digite sua senha atual"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              disabled={isLoading}
              data-testid="input-senha-atual"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="nova-senha">Nova Senha</label>
            <Input
              id="nova-senha"
              type="password"
              placeholder="Digite a nova senha"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              disabled={isLoading}
              data-testid="input-nova-senha"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="confirmar-senha">Confirmar Nova Senha</label>
            <Input
              id="confirmar-senha"
              type="password"
              placeholder="Confirme a nova senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              disabled={isLoading}
              data-testid="input-confirmar-senha"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} data-testid="button-save-password">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
