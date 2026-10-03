const client = require("prom-client")

const registry = new client.Registry()
client.collectDefaultMetrics({ register: registry })

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
})

// Express 5 exposes the matched route on req.route only after routing, so read
// it in the finish handler rather than up front. Falling back to the literal
// path would make every unmatched URL its own label and blow up cardinality.
function middleware(req, res, next) {
  const done = httpDuration.startTimer()
  res.on("finish", () => {
    done({
      method: req.method,
      route: req.route ? req.baseUrl + req.route.path : "unmatched",
      status: res.statusCode,
    })
  })
  next()
}

module.exports = { registry, middleware }
