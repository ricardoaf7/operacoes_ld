import { createClient } from "@supabase/supabase-js";

// Cliente Supabase só pra upload direto de vídeo do celular (bypass do
// limite de payload das funções da Vercel) — usa a chave PÚBLICA (anon),
// segura de expor no navegador. A autorização de cada envio vem da URL
// assinada gerada pelo servidor (com a chave privada), não desta chave.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

export async function enviarParaUrlAssinada(path: string, token: string, file: File | Blob): Promise<void> {
  const { error } = await supabase.storage.from("fotos").uploadToSignedUrl(path, token, file);
  if (error) throw error;
}
