const express = require("express")
const cron = require("node-cron")
const client = require("prom-client")
const { query, pool } = require("./db")
const { probe } = require("./probe")

// --- metrics ---------------------------------------------------------------
const registry = new client.Registry()
client.collectDefaultMetrics({ register: registry })

const sweepDuration = new client.Histogram({
  name: "sweep_duration_seconds",
  help: "Time to probe every enabled monitor once",
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
})
const probeTotal = new client.Counter({
  name: "probe_total",
  help: "Probes performed, by outcome",
  labelNames: ["result"],
  registers: [registry],
})
const lastSweep = new client.Gauge({
  name: "last_sweep_unixtime",
  help: "Unix timestamp of the last completed sweep",
  registers: [registry],
})

// --- the actual work -------------------------------------------------------
let sweeping = false

async function sweep() {
  // A sweep that overruns its schedule must not start a second copy of itself.
  if (sweeping) {
    console.warn("previous sweep still running, skipping this tick")
    return
  }
  sweeping = true
  const done = sweepDuration.startTimer()

  try {
    const { rows: monitors } = await query(
      "SELECT id, name, url FROM monitors WHERE enabled ORDER BY id"
    )
    if (monitors.length === 0) {
      console.log("no enabled monitors")
      return
    }

    const results = await Promise.all(
      monitors.map(async (m) => ({ monitor: m, result: await probe(m.url) }))
    )

    for (const { monitor, result } of results) {
      probeTotal.inc({ result: result.ok ? "up" : "down" })
      try {
        await query(
          `INSERT INTO checks (monitor_id, ok, status_code, latency_ms, error)
           VALUES ($1, $2, $3, $4, $5)`,
          [monitor.id, result.ok, result.status_code, result.latency_ms, result.error]
        )
      } catch (err) {
        // Losing one row is survivable; aborting the sweep is not.
        console.error(`failed to record check for ${monitor.name}:`, err.message)
      }
      const label = result.ok ? "UP  " : "DOWN"
      console.log(
        `${label} ${monitor.name} ${result.status_code ?? "-"} ${result.latency_ms}ms` +
          (result.error ? ` (${result.error})` : "")
      )
    }
    lastSweep.setToCurrentTime()
  } finally {
    sweeping = false
    done()
  }
}

// Delete check rows older than the retention window, so the table that grows
// without bound actually stops growing.
async function prune() {
  const days = Number(process.env.RETENTION_DAYS || 30)
  try {
    const { rowCount } = await query(
      `DELETE FROM checks WHERE checked_at < now() - ($1 || ' days')::interval`,
      [days]
    )
    if (rowCount > 0) console.log(`pruned ${rowCount} checks older than ${days}d`)
  } catch (err) {
    console.error("prune failed:", err.message)
  }
}

// --- wiring ----------------------------------------------------------------
async function main() {
  if (process.env.RUN_ONCE === "true") {
    // This path is what a Kubernetes CronJob runs: do the work, exit 0.
    await sweep()
    await pool.end()
    return
  }

  const schedule = process.env.SWEEP_CRON || "*/2 * * * *"
  const pruneSchedule = process.env.PRUNE_CRON || "30 3 * * *"
  if (!cron.validate(schedule)) throw new Error(`invalid SWEEP_CRON: ${schedule}`)

  cron.schedule(schedule, sweep)
  cron.schedule(pruneSchedule, prune)
  console.log(`scheduler started, sweep "${schedule}", prune "${pruneSchedule}"`)
  await sweep()

  // A worker still needs probes and a scrape target, so it gets a tiny server.
  const app = express()
  app.get("/health", (_req, res) => res.json({ status: "ok" }))
  app.get("/ready", async (_req, res) => {
    try {
      await query("SELECT 1")
      res.json({ status: "ready" })
    } catch (err) {
      res.status(503).json({ status: "not ready", error: err.message })
    }
  })
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType)
    res.end(await registry.metrics())
  })

  const port = Number(process.env.PORT || 3002)
  const server = app.listen(port, () => console.log(`scheduler probes on ${port}`))

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
}

main().catch((err) => {
  console.error("scheduler failed to start:", err.message)
  process.exit(1)
})
