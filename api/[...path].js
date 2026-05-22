let serverModulePromise;

function loadServerModule() {
  if (!serverModulePromise) {
    serverModulePromise = import("../Backend/server/server.js");
  }
  return serverModulePromise;
}

function normalizeRewrittenUrl(req) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const rewrittenPath = url.searchParams.get("path");
  if (!rewrittenPath) return;

  url.searchParams.delete("path");
  const search = url.searchParams.toString();
  req.url = `/api/${rewrittenPath.replace(/^\/+/, "")}${search ? `?${search}` : ""}`;
}

async function handler(req, res) {
  normalizeRewrittenUrl(req);
  const { handleRequest } = await loadServerModule();
  return handleRequest(req, res, {
    initializeDatabase: true,
    serveClient: false
  });
}

module.exports = handler;
module.exports.config = {
  maxDuration: 30
};
