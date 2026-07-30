// Funções compartilhadas de captura/compressão de foto e vídeo — usadas na
// tela do encarregado e no upload de área (fiscal/coordenador). Extraídas
// pra cá pra não duplicar a lógica quando o mesmo fluxo for replicado em
// Varrição e em módulos novos.

export const DURACAO_MAXIMA_VIDEO_S = 30;

// Lê a duração de um vídeo sem precisar subir/decodificar o arquivo inteiro
export function duracaoDoVideo(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { resolve(video.duration); URL.revokeObjectURL(url); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler o vídeo")); };
    video.src = url;
  });
}

// Descobre as dimensões do arquivo sem decodificar a imagem inteira na memória
function getDimensoesImagem(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler a imagem")); };
    img.src = url;
  });
}

// Reduz a foto para no máx. 1600px e JPEG 80% — economiza dados móveis.
// Câmeras de celular tiram fotos de 12-48 megapixels: decodificar a imagem inteira
// antes de reduzir pode exigir 100-200MB de memória e travar o navegador em aparelhos
// mais simples. Por isso pedimos ao navegador para já decodificar em tamanho reduzido
// (createImageBitmap com resizeWidth/resizeHeight), evitando esse pico de memória.
// A marca d'água (local, GPS, data/hora) é gravada na própria imagem para valer
// como registro perante fiscalização.
export async function comprimirImagem(file: File, marcaDagua: string[]): Promise<Blob> {
  const maxDim = 1600;
  const { width: origW, height: origH } = await getDimensoesImagem(file);
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "medium",
    });
  } catch {
    // Navegador sem suporte a resize no decode: cai para o modo antigo
    bitmap = await createImageBitmap(file);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close(); // libera a memória do bitmap imediatamente, sem esperar o coletor de lixo

  if (marcaDagua.length > 0) {
    const fontSize = Math.max(14, Math.round(w / 42));
    const pad = Math.round(fontSize * 0.6);
    const lineH = Math.round(fontSize * 1.35);
    const boxH = pad * 2 + lineH * marcaDagua.length;

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, h - boxH, w, boxH);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    marcaDagua.forEach((linha, i) => {
      // Corta a linha se for mais larga que a foto
      let texto = linha;
      while (ctx.measureText(texto).width > w - pad * 2 && texto.length > 4) {
        texto = texto.slice(0, -5) + "…";
      }
      ctx.fillText(texto, pad, h - boxH + pad + i * lineH);
    });
  }

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8)
  );
  canvas.width = 0;
  canvas.height = 0; // ajuda o navegador a liberar o buffer do canvas antes do GC
  return blob;
}
