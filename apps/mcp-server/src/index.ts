import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { pruneExpired as pruneExpiredOAuthState } from "./oauth/db.js";

const config = loadConfig();
const app = createApp({ config });

// Expired OAuth rows are harmless but accumulate, so sweep them
// periodically. Failures are logged and retried on the next tick — a
// cleanup problem must never take the server down.
const OAUTH_PRUNE_INTERVAL_MS = 15 * 60 * 1000;
const pruneOAuthState = () => {
  pruneExpiredOAuthState().catch((error) => {
    console.error("Failed to prune expired OAuth state:", error);
  });
};
setInterval(pruneOAuthState, OAUTH_PRUNE_INTERVAL_MS).unref();
pruneOAuthState();

const httpServer = createServer(app);

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});

httpServer.listen(config.port, () => {
  console.log(`Meal Planner MCP server listening on port ${config.port}`);
  console.log(`Using meals API origin: ${config.mealsApiOrigin}`);
  console.log(`OAuth issuer: ${config.oauth.issuer}`);
  console.log(`OAuth login URL: ${config.oauth.loginUrl}`);
  console.log(`Time zone: ${config.timeZone}`);
  console.log(
    `Admin tools: ${config.adminToolsEnabled ? "ENABLED for administrators" : "disabled"}`,
  );
  if (!config.mcpApiKey) {
    console.warn(
      "MCP_API_KEY is not set. tRPC calls to the meals API will fail with UNAUTHORIZED.",
    );
  }
});

const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Forcefully shutting down after timeout");
    process.exit(1);
  }, 10000);

  httpServer.close(() => {
    clearTimeout(forceExitTimer);
    console.log("Server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
