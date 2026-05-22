let serverModulePromise;

function loadServerModule() {
  if (!serverModulePromise) {
    serverModulePromise = import("../Backend/server/server.js");
  }
  return serverModulePromise;
}

async function handler(req, res) {
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
