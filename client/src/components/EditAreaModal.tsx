import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { ServiceArea } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AREA_TIPOS_PADRAO } from "./NewAreaModal";

const editAreaSchema = z.object({
  endereco: z.string().min(1, "Endereço é obrigatório"),
  bairro: z.string().optional(),
  tipo: z.string().optional(),
  lote: z.string().optional(),
  metragem_m2: z.coerce.number().positive("Metragem deve ser positiva").optional().or(z.literal("")),
});

type EditAreaFormData = z.infer<typeof editAreaSchema>;

interface EditAreaModalProps {
  area: ServiceArea | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAreaModal({ area, open, onOpenChange }: EditAreaModalProps) {
  const { toast } = useToast();

  const form = useForm<EditAreaFormData>({
    resolver: zodResolver(editAreaSchema),
    defaultValues: {
      endereco: "",
      bairro: "",
      tipo: "",
      lote: "",
      metragem_m2: undefined,
    },
  });

  useEffect(() => {
    if (area && open) {
      form.reset({
        endereco: area.endereco || "",
        bairro: area.bairro || "",
        tipo: area.tipo || "",
        lote: area.lote ? String(area.lote) : "",
        metragem_m2: area.metragem_m2 || undefined,
      });
    }
  }, [area, open, form]);

  const updateAreaMutation = useMutation({
    mutationFn: async (data: EditAreaFormData) => {
      if (!area) throw new Error("Área não selecionada");

      const metragem = data.metragem_m2 ? Number(data.metragem_m2) : null;

      const res = await apiRequest("PATCH", `/api/areas/${area.id}`, {
        endereco: data.endereco,
        bairro: data.bairro,
        tipo: data.tipo || null,
        lote: data.lote ? Number(data.lote) : null,
        metragem_m2: metragem,
      });
      return await res.json() as ServiceArea;
    },
    onSuccess: (updatedArea) => {
      toast({
        title: "Área Atualizada!",
        description: `${updatedArea.endereco} foi atualizada com sucesso.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
      queryClient.invalidateQueries({ queryKey: ["/api/areas", area?.id] });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erro ao Atualizar",
        description: "Não foi possível atualizar a área.",
      });
    },
  });

  const onSubmit = (data: EditAreaFormData) => {
    updateAreaMutation.mutate(data);
  };

  if (!area) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-edit-area">
        <DialogHeader>
          <DialogTitle className="text-lg">Editar Área</DialogTitle>
          <DialogDescription className="text-sm">
            ID: {area.id}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="endereco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Endereço da área"
                      {...field}
                      data-testid="input-edit-endereco"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bairro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bairro</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Bairro"
                      {...field}
                      data-testid="input-edit-bairro"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-tipo">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="z-[9999]">
                        {AREA_TIPOS_PADRAO.map((tipo) => (
                          <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-lote">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="z-[9999]">
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="metragem_m2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metragem (m²)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      {...field}
                      data-testid="input-edit-metragem"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateAreaMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                data-testid="button-save-edit"
              >
                {updateAreaMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
