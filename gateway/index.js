const express = require("express")
const cors = require("cors")
const { createProxyMiddleware } = require("http-proxy-middleware")

const target = process.env.CHECKER_API_URL
if (!target) {
  console.error("CHECKER_API_URL is not set")
  process.exit(1)
}

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }))

// The gateway's own health must not depend on the upstream, otherwise a
// checker-api outage takes the gateway's pods down too and you lose the
// layer that would have told you about it.
app.get("/health", (_req, res) => res.json({ status: "ok", upstream: target }))

app.get("/ready", async (_req, res) => {
  try {
    const upstream = await fetch(`${target}/health`, { signal: AbortSignal.timeout(3000) })
    if (!upstream.ok) throw new Error(`upstream returned ${upstream.status}`)
    res.json({ status: "ready" })
  } catch (err) {
    res.status(503).json({ status: "not ready", error: err.message })
  }
})

// Everything under /api is forwarded with the prefix stripped: a request for
// /api/status reaches checker-api as /status.
app.use(
  "/api",
  createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
    proxyTimeout: 10_000,
    timeout: 10_000,
    on: {
      error: (err, _req, res) => {
        console.error("proxy error:", err.message)
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" })
        }
        res.end(JSON.stringify({ error: "upstream unavailable" }))
      },
    },
  })
)

const port = Number(process.env.PORT || 3000)
const server = app.listen(port, () =>
  console.log(`gateway listening on ${port}, forwarding /api to ${target}`)
)

function shutdown(signal) {
  console.log(`${signal} received, draining`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
