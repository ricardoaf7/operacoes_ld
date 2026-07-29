import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function getSupabase() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  next();
}

// Se o requisitante é um encarregado vinculado a um lote específico da
// Roçagem, devolve esse lote (1 ou 2) para restringir o que ele enxerga.
// Para todo o resto (admin, gestor, fiscal, demo, público) devolve null —
// a visão total/agregada continua livre, só o encarregado é escopado ao
// próprio lote (antes vazava para o lote do colega).
export function loteRestritoDoEncarregado(req: Request): 1 | 2 | null {
  if (req.session?.userRole !== "encarregado") return null;
  const contrato = req.session.userContrato || "";
  if (contrato === "rocagem_lote1") return 1;
  if (contrato === "rocagem_lote2") return 2;
  return null;
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    if (!roles.includes(req.session.userRole || '')) {
      return res.status(403).json({ error: "Sem permissão" });
    }
    next();
  };
}

// Nome de arquivo seguro pra dentro de um .zip — sem acento (alguns
// descompactadores no Windows corrompem nomes com acento), sem caracteres
// reservados do sistema de arquivos.
export function nomeArquivoSeguro(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();
}

// URL assinada de upload — o celular do encarregado manda o arquivo DIRETO
// pro Supabase Storage, sem passar pelo nosso servidor. Vídeo não cabe no
// caminho normal (multer + função serverless) porque a Vercel tem um limite
// de payload bem menor que um vídeo de celular.
export async function criarUrlUploadAssinada(path: string): Promise<{ signedUrl: string; token: string; path: string }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from("fotos").createSignedUploadUrl(path);
  if (error) throw error;
  return data;
}
