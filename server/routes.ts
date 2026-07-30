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
          // Varrição: locais (leitura) + fluxo de fotos/vídeos
          permitido =
            (req.path === "/api/varricao/locais" && req.method === "GET") ||
            req.path.startsWith("/api/varricao/fotos") ||
            (req.method === "POST" && /^\/api\/varricao\/locais\/\d+\/video-url$/.test(req.path));
        }

        if (!permitido && contrato.startsWith("rocagem")) {
          // Roçagem: áreas e OS do contrato (leitura) + envio de fotos/vídeos
          // das áreas + marcar a área como roçada hoje (rota restrita, não o
          // PATCH genérico)
          permitido =
            (req.method === "GET" && (req.path.startsWith("/api/areas") || req.path.startsWith("/api/ordens"))) ||
            (req.method === "POST" && /^\/api\/areas\/\d+\/photos$/.test(req.path)) ||
            (req.method === "POST" && /^\/api\/areas\/\d+\/registrar-rocagem$/.test(req.path)) ||
            (req.method === "POST" && /^\/api\/areas\/\d+\/video-url$/.test(req.path)) ||
            (req.method === "POST" && /^\/api\/areas\/\d+\/video-registrar$/.test(req.path));
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

  // Middleware: fiscal vinculado a um contrato específico ("fiscal de
  // contrato" / coordenador) fica bloqueado do domínio que não é dele —
  // Roçagem × Varrição. Diferente do middleware acima (lista de permissão
  // bem estreita, pensada só pro encarregado terceirizado), este é uma
  // lista de BLOQUEIO: o fiscal mantém acesso normal a tudo que já usava
  // (demandas, setores, configurações), só perde o serviço que não é dele.
  // "Modo Visualização" (?verTudo=1) desliga esse bloqueio temporariamente
  // pra ele poder consultar — sem editar — o que não é dele.
  app.use((req, res, next) => {
    if (
      req.session?.userRole === "fiscal" &&
      req.session.userContrato &&
      req.path.startsWith("/api/") &&
      req.query.verTudo !== "1"
    ) {
      const contrato = req.session.userContrato;
      const ehRotaVarricao = req.path.startsWith("/api/varricao/");
      const ehRotaRocagem =
        req.path.startsWith("/api/areas") ||
        req.path.startsWith("/api/ordens") ||
        req.path.startsWith("/api/cronogramas");

      if (
        (contrato === "varricao" && ehRotaRocagem) ||
        (contrato.startsWith("rocagem") && ehRotaVarricao)
      ) {
        return res.status(403).json({ error: "Acesso restrito ao contrato do fiscal" });
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
