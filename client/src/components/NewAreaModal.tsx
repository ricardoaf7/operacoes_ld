import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const AREA_TIPOS_PADRAO = [
  "ÁREA PÚBLICA",
  "CANTEIRO",
  "CANTEIRO E LATERAL",
  "CANTEIRO E BARRANCO",
  "LATERAL",
  "PRAÇA",
  "FUNDO DE VALE",
  "VIELA",
  "LOTE PÚBLICO",
  "ROTATÓRIA",
  "CAMPO DE FUTEBOL",
];

const CUSTOM_VALUE = "__custom__";

interface NewAreaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat: number;
  lng: number;
  defaultServico?: "rocagem" | "jardins";
}

const newAreaSchema = z.object({
  tipo: z.string().min(1, "Tipo e obrigatorio"),
  endereco: z.string().min(1, "Endereco e obrigatorio"),
  bairro: z.string().optional(),
  metragem_m2: z.string().optional(),
  lote: z.string().min(1, "Selecione um lote"),
});

type NewAreaFormData = z.infer<typeof newAreaSchema>;

export function NewAreaModal({ open, onOpenChange, lat, lng, defaultServico = "rocagem" }: NewAreaModalProps) {
  const { toast } = useToast();
  const [showCustomTipo, setShowCustomTipo] = useState(false);
  const [customTipo, setCustomTipo] = useState("");
  
  const form = useForm<NewAreaFormData>({
    resolver: zodResolver(newAreaSchema),
    defaultValues: {
      tipo: "Area Publica",
      endereco: "",
      bairro: "",
      metragem_m2: "",
      lote: "1",
    },
  });

  useEffect(() => {
    if (!open || !lat || !lng) return;

    const fetchAddress = async () => {
      try {
        const response = await fetch(
          `/api/geocode/reverse?lat=${lat}&lng=${lng}`
        );
        if (response.ok) {
          const data = await response.json();
          const address = data.address || {};
          
          const road = address.road || address.street || "";
          const suburb = address.suburb || address.neighbourhood || address.quarter || "";
          const houseNumber = address.house_number || "";
          
          const fullAddress = [houseNumber, road]
            .filter(Boolean)
            .join(" ")
            .trim();

          form.setValue("endereco", fullAddress || data.display_name?.split(",")[0] || "");
          form.setValue("bairro", suburb || address.city_district || "");
        }
      } catch (error) {
        console.error("Erro ao buscar endereco:", error);
        toast({
          title: "Aviso",
          description: "Nao foi possivel buscar o endereco automaticamente. Preencha manualmente.",
          variant: "default",
        });
      }
    };

    fetchAddress();
  }, [open, lat, lng, form, toast]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset({
        tipo: "Area Publica",
        endereco: "",
        bairro: "",
        metragem_m2: "",
        lote: "1",
      });
      setShowCustomTipo(false);
      setCustomTipo("");
    }
    onOpenChange(newOpen);
  };

  const createAreaMutation = useMutation({
    mutationFn: async (data: NewAreaFormData) => {
      const metragem = data.metragem_m2 && data.metragem_m2.trim() !== "" 
        ? parseFloat(data.metragem_m2) 
        : undefined;
      
      const lote = parseInt(data.lote);
      
      if (metragem !== undefined && (isNaN(metragem) || metragem <= 0)) {
        throw new Error("Metragem deve ser um numero positivo");
      }
      
      if (isNaN(lote) || lote < 1 || lote > 2) {
        throw new Error("Lote deve ser 1 ou 2");
      }
      
      return await apiRequest("POST", "/api/areas", {
        tipo: data.tipo,
        endereco: data.endereco,
        bairro: data.bairro || undefined,
        metragem_m2: metragem,
        lat,
        lng,
        lote,
        servico: "rocagem",
        status: "Pendente",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light"] });
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      toast({
        title: "Area Cadastrada",
        description: `Area "${form.getValues("endereco")}" foi cadastrada com sucesso!`,
      });
      handleOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao Cadastrar",
        description: error.message || "Nao foi possivel cadastrar a area.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: NewAreaFormData) => {
    createAreaMutation.mutate(data);
  };

  const handleTipoSelectChange = (value: string, fieldOnChange: (val: string) => void) => {
    if (value === CUSTOM_VALUE) {
      setShowCustomTipo(true);
      setCustomTipo("");
      fieldOnChange("");
    } else {
      setShowCustomTipo(false);
      setCustomTipo("");
      fieldOnChange(value);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] z-[9999]" data-testid="modal-new-area">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Cadastrar Nova Area
          </DialogTitle>
          <DialogDescription>
            Preencha as informacoes da area de servico que sera cadastrada no sistema.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <FormLabel htmlFor="lat">Latitude</FormLabel>
                <Input
                  id="lat"
                  value={lat.toFixed(7)}
                  readOnly
                  className="bg-muted"
                  data-testid="input-lat"
                />
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="lng">Longitude</FormLabel>
                <Input
                  id="lng"
                  value={lng.toFixed(7)}
                  readOnly
                  className="bg-muted"
                  data-testid="input-lng"
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="endereco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereco *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Av. Jorge Casoni, 123"
                      {...field}
                      data-testid="input-endereco"
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
                      placeholder="Ex: Centro"
                      {...field}
                      data-testid="input-bairro"
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
                    {showCustomTipo ? (
                      <div className="flex gap-1">
                        <FormControl>
                          <Input
                            placeholder="Digite o tipo"
                            value={customTipo}
                            onChange={(e) => {
                              setCustomTipo(e.target.value);
                              field.onChange(e.target.value);
                            }}
                            data-testid="input-tipo-custom"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setShowCustomTipo(false);
                            field.onChange("Area Publica");
                          }}
                          data-testid="button-tipo-back"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Select
                        onValueChange={(val) => handleTipoSelectChange(val, field.onChange)}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-tipo">
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="z-[10001]">
                          {AREA_TIPOS_PADRAO.map((tipo) => (
                            <SelectItem key={tipo} value={tipo}>
                              {tipo}
                            </SelectItem>
                          ))}
                          <SelectItem value={CUSTOM_VALUE}>+ Outro (digitar)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-lote">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="z-[10001]">
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
                  <FormLabel>Metragem (m2)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 1500.50"
                      {...field}
                      data-testid="input-metragem"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={createAreaMutation.isPending}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createAreaMutation.isPending}
                data-testid="button-submit"
              >
                {createAreaMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  "Cadastrar Area"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
