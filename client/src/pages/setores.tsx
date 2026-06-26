import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import type { Setor } from "@shared/schema";

interface SetorForm {
  nome: string;
  parentId: string;
  ativo: boolean;
}

const emptyForm: SetorForm = { nome: "", parentId: "", ativo: true };

export default function SetoresPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SetorForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: setores = [], isLoading } = useQuery<Setor[]>({
    queryKey: ["/api/setores"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/setores");
      return res.json();
    },
  });

  const pais = setores.filter(s => !s.parentId);
  const filhosDe = (parentId: number) => setores.filter(s => s.parentId === parentId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        nome: form.nome.trim(),
        parentId: form.parentId ? parseInt(form.parentId) : null,
        ativo: form.ativo,
      };
      if (editingId) {
        const res = await apiRequest("PUT", `/api/setores/${editingId}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/setores", body);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "Setor atualizado!" : "Setor criado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/setores"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/setores/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
    },
    onSuccess: () => {
      toast({ title: "Setor excluído!" });
      queryClient.invalidateQueries({ queryKey: ["/api/setores"] });
      setDeleteConfirm(null);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
      setDeleteConfirm(null);
    },
  });

  const toggleAtivo = (setor: Setor) => {
    apiRequest("PUT", `/api/setores/${setor.id}`, {
      nome: setor.nome,
      parentId: setor.parentId ?? null,
      ativo: !setor.ativo,
    }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/setores"] }));
  };

  const openNew = (parentId?: number) => {
    setEditingId(null);
    setForm({ nome: "", parentId: parentId ? String(parentId) : "", ativo: true });
    setDialogOpen(true);
  };

  const openEdit = (s: Setor) => {
    setEditingId(s.id);
    setForm({ nome: s.nome, parentId: s.parentId ? String(s.parentId) : "", ativo: s.ativo });
    setDialogOpen(true);
  };

  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "gestor";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/configuracoes">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Setores</h1>
            <p className="text-sm text-muted-foreground">Gerencie os setores e sub-setores da D.O.</p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => openNew()} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Novo Setor
            </Button>
          )}
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
        ) : pais.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Nenhum setor cadastrado.</div>
        ) : (
          <div className="space-y-2">
            {pais.map(pai => {
              const filhos = filhosDe(pai.id);
              return (
                <div key={pai.id} className="border border-border rounded-lg overflow-hidden">
                  {/* Setor pai */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                    <div className="flex-1 flex items-center gap-2">
                      <span className={`text-sm font-medium ${!pai.ativo ? "text-muted-foreground line-through" : ""}`}>
                        {pai.nome}
                      </span>
                      {!pai.ativo && <Badge variant="outline" className="text-xs">Inativo</Badge>}
                      {filhos.length > 0 && (
                        <span className="text-xs text-muted-foreground">({filhos.length} sub-setores)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <>
                          <Switch
                            checked={pai.ativo}
                            onCheckedChange={() => toggleAtivo(pai)}
                            className="scale-75"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openNew(pai.id)}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(pai)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(pai.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Sub-setores */}
                  {filhos.map(filho => (
                    <div key={filho.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-border/50">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-2" />
                      <div className="flex-1 flex items-center gap-2">
                        <span className={`text-sm ${!filho.ativo ? "text-muted-foreground line-through" : ""}`}>
                          {filho.nome}
                        </span>
                        {!filho.ativo && <Badge variant="outline" className="text-xs">Inativo</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <>
                            <Switch
                              checked={filho.ativo}
                              onCheckedChange={() => toggleAtivo(filho)}
                              className="scale-75"
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(filho)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {isAdmin && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirm(filho.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog: criar / editar */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setForm(emptyForm); setEditingId(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Setor" : "Novo Setor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome *</Label>
              <Input
                className="mt-1"
                placeholder="Ex: Varrição"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div>
              <Label>Setor Pai (opcional)</Label>
              <Select
                value={form.parentId}
                onValueChange={v => setForm(f => ({ ...f, parentId: v === "none" ? "" : v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Nenhum (setor principal)" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="none">Nenhum (setor principal)</SelectItem>
                  {pais
                    .filter(p => p.id !== editingId)
                    .map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.ativo}
                onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))}
              />
              <Label>Ativo</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!form.nome.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar exclusão */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Setor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground pt-2">
            Tem certeza? Esta ação não pode ser desfeita. Setores com sub-setores não podem ser excluídos.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirm !== null && deleteMutation.mutate(deleteConfirm)}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
