const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      // docker-compose service name by default; override for a local backend
      target: process.env.API_PROXY_TARGET || "http://backend:8000",
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
    })
  );
};
