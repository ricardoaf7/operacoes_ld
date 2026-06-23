import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: number;
    userRole?: string;
    userName?: string;
  }
}

interface ConfigureAppOptions {
  server?: Server;
  serveClient?: boolean;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (isProduction()) {
    throw new Error("SESSION_SECRET is required in production");
  }

  return "zeladoria-dev-secret";
}

function createSessionStore() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    if (isProduction()) {
      throw new Error("DATABASE_URL is required in production");
    }

    return undefined;
  }

  const PgStore = connectPgSimple(session);
  return new PgStore({
    conString: databaseUrl,
    createTableIfMissing: true,
  });
}

function registerBaseMiddleware(app: Express) {
  if (isProduction()) {
    app.set("trust proxy", 1);
  }

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      store: createSessionStore(),
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction(),
        sameSite: "lax",
      },
    }),
  );

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });
}

function registerErrorHandler(app: Express) {
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });
}

export async function configureApp(app: Express, options: ConfigureAppOptions = {}) {
  registerBaseMiddleware(app);
  await registerRoutes(app);
  registerErrorHandler(app);

  if (options.serveClient) {
    if (app.get("env") === "development") {
      if (!options.server) {
        throw new Error("HTTP server is required to run Vite in development");
      }
      await setupVite(app, options.server);
    } else {
      serveStatic(app);
    }
  }

  return app;
}

export async function createApp(options: ConfigureAppOptions = {}) {
  const app = express();
  return configureApp(app, options);
}
