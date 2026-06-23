import { createApp } from "../server/app";

let appPromise: Promise<any>;

function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveClient: false }).catch((err) => {
      console.error("=== ERRO FATAL NA INICIALIZAÇÃO ===");
      console.error(err);
      appPromise = undefined as any;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error("=== ERRO NO HANDLER ===", err);
    res.status(500).json({
      error: "Erro na inicialização do servidor",
      message: err?.message || String(err),
      stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined,
    });
  }
}
