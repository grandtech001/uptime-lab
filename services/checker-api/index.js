const express = require("express")
const { query, pool } = require("./db")
const metrics = require("./metrics")

const app = express()
app.use(express.json())
app.use(metrics.middleware)

// --- operational endpoints -------------------------------------------------
// health: is the process alive? Must not touch the database, or a brief DB
// blip gets the pod killed and restarted instead of just marked unready.
app.get("/health", (_req, res) => res.json({ status: "ok" }))

// ready: can this instance actually serve traffic? This one does touch the DB.
app.get("/ready", async (_req, res) => {
  try {
    await query("SELECT 1")
    res.json({ status: "ready" })
  } catch (err) {
    res.status(503).json({ status: "not ready", error: err.message })
  }
})

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", metrics.registry.contentType)
  res.end(await metrics.registry.metrics())
})

// --- monitors --------------------------------------------------------------
app.get("/monitors", async (_req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, name, url, interval_sec, enabled, created_at FROM monitors ORDER BY id"
    )
    res.json(rows)
  } catch (err) { next(err) }
})

app.post("/monitors", async (req, res, next) => {
  const { name, url, interval_sec } = req.body || {}
  if (!name || !url) {
    return res.status(400).json({ error: "name and url are required" })
  }
  try {
    const { rows } = await query(
      `INSERT INTO monitors (name, url, interval_sec)
       VALUES ($1, $2, COALESCE($3, 60))
       RETURNING id, name, url, interval_sec, enabled, created_at`,
      [name, url, interval_sec]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "that url is already monitored" })
    }
    next(err)
  }
})

app.delete("/monitors/:id", async (req, res, next) => {
  try {
    const { rowCount } = await query("DELETE FROM monitors WHERE id = $1", [req.params.id])
    if (rowCount === 0) return res.status(404).json({ error: "no such monitor" })
    res.status(204).end()
  } catch (err) { next(err) }
})

// --- status ----------------------------------------------------------------
// Latest result per monitor, plus a 24h success rate. The DISTINCT ON is
// Postgres-specific and the reason this is worth running against real
// Postgres rather than SQLite.
app.get("/status", async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT m.id, m.name, m.url, m.enabled,
             l.ok, l.status_code, l.latency_ms, l.error, l.checked_at,
             COALESCE(s.uptime_pct, 0) AS uptime_24h_pct,
             COALESCE(s.sample_count, 0) AS checks_24h
      FROM monitors m
      LEFT JOIN LATERAL (
        SELECT ok, status_code, latency_ms, error, checked_at
        FROM checks WHERE monitor_id = m.id
        ORDER BY checked_at DESC LIMIT 1
      ) l ON TRUE
      LEFT JOIN LATERAL (
        SELECT round(100.0 * count(*) FILTER (WHERE ok) / NULLIF(count(*), 0), 2) AS uptime_pct,
               count(*) AS sample_count
        FROM checks
        WHERE monitor_id = m.id AND checked_at > now() - interval '24 hours'
      ) s ON TRUE
      ORDER BY m.id
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

app.get("/monitors/:id/checks", async (req, res, next) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  try {
    const { rows } = await query(
      `SELECT id, checked_at, ok, status_code, latency_ms, error
       FROM checks WHERE monitor_id = $1
       ORDER BY checked_at DESC LIMIT $2`,
      [req.params.id, limit]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

app.use((err, _req, res, _next) => {
  console.error("unhandled:", err.message)
  res.status(500).json({ error: "internal error" })
})

const port = Number(process.env.PORT || 3001)
const server = app.listen(port, () => console.log(`checker-api listening on ${port}`))

// Without this, Kubernetes sends SIGTERM, the process ignores it, and kubelet
// SIGKILLs it 30s later mid-request. Draining properly is the whole point.
function shutdown(signal) {
  console.log(`${signal} received, draining`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
