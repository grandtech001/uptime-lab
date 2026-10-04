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

// Route params arrive as strings and go straight into an integer column. A
// non-numeric id is a client mistake, so it must not look like a DB failure.
function monitorId(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "id must be a positive integer" })
    return null
  }
  return id
}

app.post("/monitors", async (req, res, next) => {
  const { name, url, interval_sec } = req.body || {}
  if (!name || !url) {
    return res.status(400).json({ error: "name and url are required" })
  }
  // The schema's CHECK (interval_sec >= 10) catches this too, but surfaces it
  // as a constraint violation, which reads like a server fault. It isn't one.
  if (interval_sec !== undefined && interval_sec !== null &&
      (!Number.isInteger(interval_sec) || interval_sec < 10)) {
    return res.status(400).json({ error: "interval_sec must be an integer of at least 10" })
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
  const id = monitorId(req, res)
  if (id === null) return
  try {
    const { rowCount } = await query("DELETE FROM monitors WHERE id = $1", [id])
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
  const id = monitorId(req, res)
  if (id === null) return
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  try {
    const { rows } = await query(
      `SELECT id, checked_at, ok, status_code, latency_ms, error
       FROM checks WHERE monitor_id = $1
       ORDER BY checked_at DESC LIMIT $2`,
      [id, limit]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// Postgres codes that mean the client sent something invalid. Without this a
// typo in a request body comes back as a 5xx, and in stage 6 a 5xx rate alarm
// pages you for someone else's typo.
const CLIENT_ERRORS = {
  "22P02": "invalid value in request",      // invalid_text_representation
  "23502": "a required field was null",     // not_null_violation
  "23503": "referenced row does not exist", // foreign_key_violation
  "23514": "value outside the allowed range", // check_violation
}

app.use((err, _req, res, _next) => {
  const clientError = CLIENT_ERRORS[err.code]
  if (clientError) {
    console.warn("bad request:", err.message)
    return res.status(400).json({ error: clientError })
  }
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
