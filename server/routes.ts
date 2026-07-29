import type { Express } from "express";
import {
  ensureUsersSetorColumn, ensureUsersContratoColumn, ensureSetoresTable, ensureAdminExists,
  registerAuthRoutes, registerUserRoutes, registerSetoresRoutes,
} from "./routes/auth-users";
import { ensureAuditLogTable, registerAuditRoutes } from "./routes/audit";
import {
  ensureDemandasTable, ensureNotificacoesTable, ensureSolicitantesTable, registerDemandasRoutes,
} from "./routes/demandas";
import { ensureContratoConfigTable, registerRocagemRoutes } from "./routes/rocagem";
import {
  ensureVarricaoLocaisTable, ensureVarricaoFotosTable, ensureVarricaoOrdensTable, ensureVarricaoConfigTable,
  registerVarricaoRoutes,
} from "./routes/varricao";

export async function registerRoutes(app: Express): Promise<void> {
  // Colunas/tabelas precisam existir ANTES de qualquer leitura de usuários
  // (ensureAdminExists consulta a tabela users com todas as colunas do schema)
  await ensureSetoresTable();
  await ensureUsersSetorColumn();
  await ensureUsersContratoColumn();
  await ensureAdminExists();
  await ensureAuditLogTable();
  await ensureDemandasTable();
  await ensureNotificacoesTable();
  await ensureSolicitantesTable();
  await ensureContratoConfigTable();
  await ensureVarricaoLocaisTable();
  await ensureVarricaoFotosTable();
  await ensureVarricaoOrdensTable();
  await ensureVarricaoConfigTable();

  // Middleware: perfis restritos (encarregado da terceirizada, transparência
  // pra prefeito/presidente) só acessam o próprio universo — nada de área,
  // usuário, demanda ou configuração além do que cada um precisa enxergar.
  app.use((req, res, next) => {
    const role = req.session?.userRole;
    if ((role === "encarregado" || role === "transparencia") && req.path.startsWith("/api/")) {
      let permitido = req.path.startsWith("/api/auth/");

      if (!permitido && role === "encarregado") {
        const contrato = req.session.userContrato || "";

        if (contrato === "varricao") {
          // Varrição: locais (leitura) + fluxo de fotos
          permitido =
            (req.path === "/api/varricao/locais" && req.method === "GET") ||
            req.path.startsWith("/api/varricao/fotos");
        }

        if (!permitido && contrato.startsWith("rocagem")) {
          // Roçagem: áreas e OS do contrato (leitura) + envio de fotos das áreas
          // + marcar a área como roçada hoje (rota restrita, não o PATCH genérico)
          permitido =
            (req.method === "GET" && (req.path.startsWith("/api/areas") || req.path.startsWith("/api/ordens"))) ||
            (req.method === "POST" && /^\/api\/areas\/\d+\/photos$/.test(req.path)) ||
            (req.method === "POST" && /^\/api\/areas\/\d+\/registrar-rocagem$/.test(req.path));
        }
      }

      if (!permitido && role === "transparencia") {
        // Painel de transparência: só leitura da galeria de fotos por data —
        // nada de área, local, OS ou qualquer outra tela/edição
        permitido =
          req.method === "GET" &&
          (req.path === "/api/varricao/fotos" || req.path === "/api/areas/fotos");
      }

      if (!permitido) {
        return res.status(403).json({ error: "Acesso restrito a este perfil" });
      }
    }
    next();
  });

  // Middleware: bloqueia gravações para usuário demo (retorna sucesso sem salvar)
  app.use((req, res, next) => {
    if (
      req.session?.userRole === "demo" &&
      ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
      req.path.startsWith("/api/") &&
      !req.path.startsWith("/api/auth/")
    ) {
      if (req.method === "DELETE") {
        return res.json({ success: true, demo: true });
      }
      return res.status(req.method === "POST" ? 201 : 200).json({
        id: 99999,
        demo: true,
        success: true,
        created_at: new Date().toISOString(),
      });
    }
    next();
  });

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerRocagemRoutes(app);
  registerAuditRoutes(app);
  registerDemandasRoutes(app);
  registerVarricaoRoutes(app);
  registerSetoresRoutes(app);
}
