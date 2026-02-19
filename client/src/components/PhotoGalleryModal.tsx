import { useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X, Calendar, Image as ImageIcon, Loader2, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import type { ServiceArea } from "@shared/schema";
import { formatDateBR } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PhotoGalleryModalProps {
  area: ServiceArea;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PhotoGalleryModal({
  area,
  open,
  onOpenChange,
}: PhotoGalleryModalProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photoDate, setPhotoDate] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: freshArea } = useQuery<ServiceArea>({
    queryKey: ["/api/areas", area.id],
    enabled: open,
  });

  const liveArea = freshArea || area;

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoUrl: string) => {
      const currentFotos = liveArea.fotos || [];
      const updatedFotos = currentFotos.filter((p) => p.url !== photoUrl);

      const res = await apiRequest("PATCH", `/api/areas/${area.id}`, {
        fotos: updatedFotos,
      });

      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Foto Removida",
        description: "A foto foi deletada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/areas", area.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erro ao Deletar",
        description: "Falha ao remover a foto.",
      });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const filesToUpload: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (!validTypes.includes(file.type)) {
        toast({
          variant: "destructive",
          title: `Arquivo ${file.name} Inválido`,
          description: "Use JPG, PNG, GIF ou WebP.",
        });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: `Arquivo ${file.name} Muito Grande`,
          description: "Máximo 10MB.",
        });
        continue;
      }

      filesToUpload.push(file);
    }

    if (filesToUpload.length === 0) return;

    setIsUploading(true);
    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/photo/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const data = await res.json();
        return data.url;
      });

      const urls = await Promise.all(uploadPromises);
      
      const currentFotos = liveArea.fotos || [];
      const selectedDate = photoDate ? new Date(photoDate + "T12:00:00").toISOString() : new Date().toISOString();
      const newPhotos = urls.map((url) => ({
        url,
        data: selectedDate,
      }));
      const updatedFotos = [...currentFotos, ...newPhotos];

      const res = await apiRequest("PATCH", `/api/areas/${area.id}`, {
        fotos: updatedFotos,
      });

      if (res.ok) {
        toast({
          title: `${filesToUpload.length} Foto${filesToUpload.length !== 1 ? "s" : ""} Adicionada${filesToUpload.length !== 1 ? "s" : ""}`,
          description: "As fotos foram enviadas com sucesso.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/areas", area.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/areas/light"] });
        const input = document.getElementById("photo-input") as HTMLInputElement;
        if (input) input.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        variant: "destructive",
        title: "Erro no Upload",
        description: "Falha ao enviar as fotos.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const fotos = liveArea.fotos || [];
  const sortedFotos = [...fotos].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-photo-gallery">
        <DialogHeader>
          <DialogTitle data-testid="text-photo-gallery-title">Galeria de Fotos</DialogTitle>
          <DialogDescription data-testid="text-photo-gallery-desc">
            {liveArea.endereco}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground shrink-0">Data das fotos:</span>
            <Input
              type="date"
              value={photoDate}
              onChange={(e) => setPhotoDate(e.target.value)}
              className="max-w-[180px]"
              data-testid="input-photo-date"
            />
          </div>
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
            <label htmlFor="photo-input" className="flex flex-col items-center justify-center cursor-pointer gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {isUploading ? "Enviando fotos..." : "Clique para enviar fotos"}
              </span>
              <span className="text-xs text-muted-foreground">Envie uma ou múltiplas fotos (JPG, PNG, GIF, WebP - máx. 10MB cada)</span>
              <input
                id="photo-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
                data-testid="input-photo-file"
              />
            </label>
          </div>
        </div>

        <Separator />

        {isUploading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 mb-2 animate-spin" />
            <p className="text-sm">Enviando fotos...</p>
          </div>
        ) : fotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ImageIcon className="h-8 w-8 mb-2" />
            <p className="text-sm">Nenhuma foto ainda.</p>
            <p className="text-xs">Envie sua primeira foto acima.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {sortedFotos.map((foto, index) => (
              <div
                key={foto.url}
                className="relative group rounded-lg overflow-hidden border cursor-pointer"
                data-testid={`photo-card-${foto.url}`}
                onClick={() => setLightboxIndex(index)}
              >
                <img
                  src={foto.url}
                  alt="Galeria"
                  className="w-full h-40 object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
                </div>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    onClick={(e) => { e.stopPropagation(); deletePhotoMutation.mutate(foto.url); }}
                    variant="ghost"
                    size="icon"
                    className="text-white bg-black/50"
                    disabled={deletePhotoMutation.isPending}
                    data-testid={`button-delete-photo-${foto.url}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white text-xs flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateBR(foto.data)}
                </div>
              </div>
            ))}
          </div>
        )}

        {fotos.length > 0 && (
          <>
            <Separator />
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Total de fotos: {fotos.length}</span>
              <Badge variant="outline">{fotos.length} foto{fotos.length !== 1 ? "s" : ""}</Badge>
            </div>
          </>
        )}
      </DialogContent>

    </Dialog>

      {lightboxIndex !== null && sortedFotos[lightboxIndex] && createPortal(
        <div
          className="fixed inset-0 bg-black/95 flex items-center justify-center"
          style={{ zIndex: 10000 }}
          onClick={() => setLightboxIndex(null)}
          data-testid="lightbox-overlay"
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white bg-black/50"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            data-testid="button-lightbox-close"
          >
            <X className="h-5 w-5" />
          </Button>

          {sortedFotos.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="lg"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white bg-black/60 rounded-full p-0 min-w-12 min-h-12"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : sortedFotos.length - 1));
                }}
                data-testid="button-lightbox-prev"
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white bg-black/60 rounded-full p-0 min-w-12 min-h-12"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev! < sortedFotos.length - 1 ? prev! + 1 : 0));
                }}
                data-testid="button-lightbox-next"
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          <img
            src={sortedFotos[lightboxIndex].url}
            alt="Visualização"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            data-testid="img-lightbox"
          />

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white text-sm bg-black/60 px-4 py-2 rounded-full">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDateBR(sortedFotos[lightboxIndex].data)}</span>
            {sortedFotos.length > 1 && (
              <span className="ml-2 text-white/70">{lightboxIndex + 1} / {sortedFotos.length}</span>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
