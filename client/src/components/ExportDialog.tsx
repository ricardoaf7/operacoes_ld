import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Download, Info, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportMode = 'full' | 'incremental' | 'photos';

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [exportMode, setExportMode] = useState<ExportMode>('full');
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);

    try {
      // Para o pacote de fotos, deixar o navegador fazer streaming do download
      // (evita carregar um ZIP potencialmente enorme em memória do navegador).
      if (exportMode === 'photos') {
        const a = document.createElement('a');
        a.href = '/api/export/photos';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        toast({
          title: "Download iniciado",
          description:
            'A geração do pacote de fotos pode levar alguns minutos. O download começará automaticamente.',
        });

        onOpenChange(false);
        return;
      }

      const response = await fetch(`/api/export/csv?mode=${exportMode}`);

      if (!response.ok) {
        throw new Error("Falha na exportação");
      }

      const exportInfo = response.headers.get('X-Export-Info');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download =
        response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') ||
        'export.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      toast({
        title: "Exportação concluída",
        description:
          exportInfo ||
          `${exportMode === 'full' ? 'Exportação completa' : 'Exportação incremental'} realizada com sucesso`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Erro na exportação",
        description: exportMode === 'photos'
          ? 'Falha ao gerar o pacote de fotos. Tente novamente.'
          : 'Falha ao exportar dados. Tente novamente.',
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="export-dialog">
        <DialogHeader>
          <DialogTitle>Exportar Dados para Supabase</DialogTitle>
          <DialogDescription>
            Escolha o tipo de exportação para o banco Supabase
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={exportMode} onValueChange={(value) => setExportMode(value as ExportMode)}>
            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover-elevate">
              <RadioGroupItem value="full" id="full" data-testid="radio-export-full" />
              <div className="flex-1 space-y-1">
                <Label htmlFor="full" className="font-semibold cursor-pointer">
                  Exportação Completa (Full)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Exporta todos os 1128 registros do banco de dados. Use esta opção na primeira vez ou para sincronização completa.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover-elevate">
              <RadioGroupItem value="incremental" id="incremental" data-testid="radio-export-incremental" />
              <div className="flex-1 space-y-1">
                <Label htmlFor="incremental" className="font-semibold cursor-pointer">
                  Exportação Incremental
                </Label>
                <p className="text-sm text-muted-foreground">
                  Exporta apenas registros novos ou modificados desde a última exportação. Economiza tempo e recursos.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover-elevate">
              <RadioGroupItem value="photos" id="photos" data-testid="radio-export-photos" />
              <div className="flex-1 space-y-1">
                <Label htmlFor="photos" className="font-semibold cursor-pointer flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Pacote de Fotos (ZIP)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Baixa um ZIP com todas as fotos das áreas e um arquivo <code>manifest.csv</code> com a correspondência foto ↔ área (ID, endereço, lote, etc.). Ideal para migrar para o Supabase Storage.
                </p>
              </div>
            </div>
          </RadioGroup>

          <div className="flex items-start space-x-2 rounded-md bg-muted p-3">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              {exportMode === 'photos'
                ? 'Cada foto é nomeada como "area_{ID}_foto_{N}.{ext}". O ZIP inclui também manifest.json e um README com instruções de migração.'
                : 'O arquivo CSV gerado está otimizado para importação direta no Supabase, com escape correto de campos JSONB e arrays.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
            data-testid="button-cancel-export"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            data-testid="button-confirm-export"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting
              ? (exportMode === 'photos' ? 'Gerando ZIP...' : 'Exportando...')
              : (exportMode === 'photos' ? 'Baixar ZIP de Fotos' : 'Exportar CSV')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
