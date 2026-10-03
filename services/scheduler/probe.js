// One HTTP probe. Never throws: a probe failure is a result to record, not an
// error to propagate, otherwise one bad host aborts the whole sweep.
const DEFAULT_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 10_000)

async function probe(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = process.hrtime.bigint()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "uptime-lab/1.0" },
    })
    return {
      ok: res.status >= 200 && res.status < 400,
      status_code: res.status,
      latency_ms: elapsedMs(started),
      error: null,
    }
  } catch (err) {
    const aborted = err.name === "AbortError"
    return {
      ok: false,
      status_code: null,
      latency_ms: elapsedMs(started),
      error: aborted ? `timeout after ${timeoutMs}ms` : err.message,
    }
  } finally {
    clearTimeout(timer)
  }
}

const elapsedMs = (started) =>
  Number((process.hrtime.bigint() - started) / 1_000_000n)

module.exports = { probe }
