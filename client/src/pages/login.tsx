import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";
import { useLocation } from "wouter";
import logoPositivo from "@assets/Operacoes_Logo_Positivo_1762027620245.png";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !senha) {
      toast({ variant: "destructive", title: "Preencha todos os campos" });
      return;
    }

    setIsLoading(true);
    try {
      await login(email, senha);
      toast({ title: "Login realizado com sucesso" });
      navigate("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro no login",
        description: error.message || "Email ou senha inválidos",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950 p-4">
      <Card className="w-full max-w-md" data-testid="card-login">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logoPositivo} alt="CMTU Operações" className="h-20 object-contain" />
          </div>
          <CardTitle className="text-xl" data-testid="text-login-title">Zeladoria em Tempo Real</CardTitle>
          <CardDescription>Painel de Operações CMTU-LD</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="seu.email@cmtu.londrina.pr.gov.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="senha">Senha</label>
              <Input
                id="senha"
                type="password"
                placeholder="Digite sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={isLoading}
                data-testid="input-senha"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Entrar
                </>
              )}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <a
              href="/publico"
              className="text-sm text-muted-foreground underline"
              data-testid="link-public"
            >
              Acessar visão pública (transparência)
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
