// Deliberately the simplest thing that works: run schema.sql, then seed.sql if
// the table is empty. Replacing this with a real migration tool is a fair
// exercise once the cluster is up.
const fs = require("fs")
const path = require("path")
const { pool } = require("./db")

const DB_DIR = path.join(__dirname, "..", "..", "db")

async function main() {
  const schema = fs.readFileSync(path.join(DB_DIR, "schema.sql"), "utf8")
  await pool.query(schema)
  console.log("schema applied")

  const { rows } = await pool.query("SELECT count(*)::int AS n FROM monitors")
  if (rows[0].n === 0) {
    await pool.query(fs.readFileSync(path.join(DB_DIR, "seed.sql"), "utf8"))
    console.log("seed applied")
  } else {
    console.log(`seed skipped, ${rows[0].n} monitors already present`)
  }
  await pool.end()
}

main().catch((err) => {
  console.error("migrate failed:", err.message)
  process.exit(1)
})
