import express from "express";
import { createServer } from "http";
import { configureApp } from "./app";
import { log } from "./vite";

(async () => {
  const app = express();
  const server = createServer(app);

  await configureApp(app, {
    server,
    serveClient: true,
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
