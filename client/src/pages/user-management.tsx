import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Users, Shield, Eye, Wrench, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import type { Setor } from "@shared/schema";

interface UserData {
  id: number;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
  setorId: number | null;
  setorNome: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  fiscal: "Fiscal",
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: Shield,
  gestor: Eye,
  fiscal: Wrench,
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState("fiscal");
  const [setorId, setSetorId] = useState<string>("");

  const { data: users = [], isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
  });

  const { data: setores = [] } = useQuery<Setor[]>({
    queryKey: ["/api/setores"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/setores");
      return res.json();
    },
  });

  // Setores ativos, com hierarquia para o dropdown
  const setoresAtivos = setores.filter(s => s.ativo);
  const pais = setoresAtivos.filter(s => !s.parentId);
  const filhosDe = (parentId: number) => setoresAtivos.filter(s => s.parentId === parentId);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/users", {
        nome, email, senha, role,
        setorId: setorId ? parseInt(setorId) : null,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário criado com sucesso" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;
      const body: any = { id: editingUser.id, nome, email, role, setorId: setorId ? parseInt(setorId) : null };
      if (senha) body.senha = senha;
      const res = await apiRequest("PATCH", `/api/users/${editingUser.id}`, body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário atualizado" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/users/${id}`);
      if (!res.ok) throw new Error("Erro ao deletar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário removido" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erro ao remover usuário" });
    },
  });

  function openCreate() {
    setEditingUser(null);
    setNome(""); setEmail(""); setSenha(""); setRole("fiscal"); setSetorId("");
    setShowDialog(true);
  }

  function openEdit(u: UserData) {
    setEditingUser(u);
    setNome(u.nome); setEmail(u.email); setSenha(""); setRole(u.role);
    setSetorId(u.setorId ? String(u.setorId) : "");
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditingUser(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingUser) {
      updateMutation.mutate();
    } else {
      if (!senha) {
        toast({ variant: "destructive", title: "Senha é obrigatória para novo usuário" });
        return;
      }
      createMutation.mutate();
    }
  }

  function toggleActive(u: UserData) {
    apiRequest("PATCH", `/api/users/${u.id}`, { ativo: !u.ativo }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["/api/users"] })
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold" data-testid="text-page-title">Gerenciar Usuários</h1>
          <div className="flex-1" />
          <Button onClick={openCreate} data-testid="button-new-user">
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhum usuário cadastrado.</p>
        ) : (
          users.map((u) => {
            const RoleIcon = ROLE_ICONS[u.role] || Shield;
            return (
              <Card key={u.id} data-testid={`card-user-${u.id}`}>
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <RoleIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" data-testid={`text-user-name-${u.id}`}>{u.nome}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {u.email}
                      {u.setorNome && (
                        <span className="ml-2 text-xs text-foreground/50">· {u.setorNome}</span>
                      )}
                    </div>
                  </div>
                  <Badge variant={u.ativo ? "default" : "secondary"} data-testid={`badge-user-role-${u.id}`}>
                    {ROLE_LABELS[u.role] || u.role}
                  </Badge>
                  {!u.ativo && <Badge variant="outline">Inativo</Badge>}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)} data-testid={`button-edit-user-${u.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleActive(u)} data-testid={`button-toggle-user-${u.id}`}>
                      {u.ativo ? <Eye className="h-4 w-4" /> : <Eye className="h-4 w-4 opacity-30" />}
                    </Button>
                    {u.id !== currentUser?.id && (
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(u.id)} data-testid={`button-delete-user-${u.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent data-testid="dialog-user-form">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "Atualize os dados do usuário." : "Preencha os dados para criar um novo usuário."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required data-testid="input-user-nome" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-user-email" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {editingUser ? "Nova Senha (deixe vazio para manter)" : "Senha"}
              </label>
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required={!editingUser} data-testid="input-user-senha" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nível de Acesso</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="admin">Administrador — Acesso total</SelectItem>
                  <SelectItem value="gestor">Gestor — Visualização completa + relatórios</SelectItem>
                  <SelectItem value="fiscal">Fiscal — Registrar serviços + upload de fotos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Setor</label>
              <Select value={setorId} onValueChange={v => setSetorId(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-user-setor">
                  <SelectValue placeholder="Sem setor definido" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="none">Sem setor definido</SelectItem>
                  {pais.map(pai => {
                    const filhos = filhosDe(pai.id);
                    return filhos.length > 0 ? (
                      <div key={pai.id}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {pai.nome}
                        </div>
                        {filhos.map(f => (
                          <SelectItem key={f.id} value={String(f.id)}>
                            &nbsp;&nbsp;{f.nome}
                          </SelectItem>
                        ))}
                      </div>
                    ) : (
                      <SelectItem key={pai.id} value={String(pai.id)}>{pai.nome}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-user">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingUser ? "Salvar" : "Criar Usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
