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

// Restrição de lote pra endpoints de Roçagem, aplicada a encarregado e a
// fiscal de contrato ("coordenador"):
//   1 | 2 -> escopado a esse lote
//   0     -> bloqueia tudo (ex.: fiscal vinculado à Varrição pedindo dado de Roçagem)
//   null  -> sem restrição (admin, gestor, demo, público, ou qualquer um
//            sem contrato definido — a visão total/agregada continua livre)
//
// "Modo Visualização" (?verTudo=1): só o FISCAL pode pedir esse bypass — é
// um modo de consulta opt-in que ele liga/desliga na própria tela. O
// encarregado nunca ganha esse bypass, mesmo tentando pela URL: a restrição
// dele é uma barreira de segurança de verdade (terceirizado), não um modo
// de consulta.
export function loteRestritoDoUsuario(req: Request): 1 | 2 | 0 | null {
  const role = req.session?.userRole;
  if (role !== "encarregado" && role !== "fiscal") return null;

  const contrato = req.session?.userContrato || "";
  if (!contrato) return null; // fiscal sem contrato definido: acesso amplo, como hoje

  if (role === "fiscal" && req.query.verTudo === "1") return null;

  if (contrato === "rocagem_lote1") return 1;
  if (contrato === "rocagem_lote2") return 2;
  return 0; // contrato de outro serviço (ex.: varricao) — bloqueia toda a Roçagem
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
