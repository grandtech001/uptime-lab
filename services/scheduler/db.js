const { Pool } = require("pg")

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

// PGSSLMODE=require is what most managed Postgres (RDS, Render) needs.
// Local Postgres in a container does not speak TLS, so default to off.
const ssl =
  process.env.PGSSLMODE === "require"
    ? { rejectUnauthorized: false }
    : false

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: Number(process.env.PG_POOL_MAX || 10),
  connectionTimeoutMillis: 5000,
})

pool.on("error", (err) => {
  // A pooled client dying in the background must not take the process with it.
  console.error("idle postgres client error:", err.message)
})

module.exports = { pool, query: (text, params) => pool.query(text, params) }
