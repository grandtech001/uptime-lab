# uptime-lab

A deliberately small uptime checker, built as a **practice target** for Terraform,
AWS, Docker, Kubernetes, CI/CD and monitoring. Nothing here is production and
nothing here connects to any live system.

The application is not the point. It exists because it has the right *shape*:
three services, a stateful database, a scheduled job, and real health
endpoints. That shape is what makes each DevOps stage a genuine problem rather
than a tutorial.

## What it does

`scheduler` probes a list of URLs on a cron, writes each result to Postgres.
`checker-api` serves the monitors and their status. `gateway` is a thin proxy
that puts everything behind `/api`.

```
                  ┌───────────┐
   client ──/api──▶  gateway  │──▶ checker-api ──┐
                  └───────────┘                  │
                                                 ▼
                   scheduler ──probes──▶ web  ┌────────┐
                        └────writes results──▶│Postgres│
                                              └────────┘
```

## Layout

| Path                     | What it is                                              |
| ------------------------ | ------------------------------------------------------- |
| `services/checker-api/`  | Express + Postgres. Monitors CRUD, status, `/metrics`.    |
| `services/scheduler/`    | Cron worker. Probes URLs, prunes old rows, `/metrics`.    |
| `gateway/`               | Express proxy. Strips `/api`, forwards upstream.          |
| `db/`                    | `schema.sql` and `seed.sql`.                              |

## Running it locally

You need a Postgres. Until stage 1 gives you a compose file, the quickest is:

```bash
docker run -d --name uptime-lab-pg \
  -e POSTGRES_USER=uptime -e POSTGRES_PASSWORD=uptime -e POSTGRES_DB=uptime \
  -p 5432:5432 postgres:16-alpine
```

Then, in three terminals:

```bash
cp .env.example .env            # once

cd services/checker-api && npm install && npm run migrate && npm start
cd services/scheduler   && npm install && npm start
cd gateway              && npm install && CHECKER_API_URL=http://localhost:3001 npm start
```

Check it:

```bash
curl -s localhost:3000/api/status  | jq
curl -s localhost:3001/health
curl -s localhost:3001/ready
curl -s localhost:3002/metrics | grep probe_total
```

## Endpoints

Every service exposes the same three operational endpoints, and the
distinction between the first two is deliberate:

| Endpoint   | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `/health`  | Is the process alive? **Never touches the database.**            |
| `/ready`   | Can it serve traffic? **Does** touch its dependency.             |
| `/metrics` | Prometheus exposition format.                                    |

A liveness probe pointed at `/ready` is a classic outage: a brief database
blip gets every pod restarted instead of just pulled from the load balancer.
Wiring these two to the right probes in stage 5 is the exercise.

`checker-api` also serves:

```
GET    /monitors              list monitors
POST   /monitors              {name, url, interval_sec?}
DELETE /monitors/:id
GET    /status                latest result + 24h uptime % per monitor
GET    /monitors/:id/checks   recent raw checks (?limit=50, max 500)
```

## The roadmap

Each stage stands alone and leaves the project working. Do them in order —
every one depends on the last.

### Stage 1 — Docker
Write a `Dockerfile` per service and a `docker-compose.yml` that brings up all
three plus Postgres. Targets worth hitting: multi-stage builds, non-root
`USER`, `.dockerignore`, pinned base image digests, and a `HEALTHCHECK` that
uses `/health`. Done when `docker compose up` gives you a working `/api/status`
and images are small enough that you'd be comfortable pulling them often.

### Stage 2 — Git and PRs
Branch protection on `main`, a PR template, and a GitHub Actions workflow that
runs on PRs: lint, `docker build` for each service, and a compose-based smoke
test that curls `/ready`. Done when a red check actually blocks a merge.

### Stage 3 — Terraform and AWS
VPC with public and private subnets, ECR repositories, RDS Postgres in private
subnets, and remote state in S3 with DynamoDB locking. Targets: modules with
real inputs and outputs, `terraform plan` in CI on PRs, and **no secrets in
state or tfvars**. Done when you can destroy and recreate the whole thing from
nothing.

### Stage 4 — Secrets
Move `DATABASE_URL` into AWS Secrets Manager and reach it with IRSA rather
than a static key. Done when no long-lived AWS credential exists anywhere in
the repo, the cluster, or your shell profile.

### Stage 5 — Kubernetes
EKS via Terraform. `Deployment` for `checker-api` and `gateway`, a `CronJob`
for the scheduler using its `RUN_ONCE=true` path, plus `Service`, `Ingress`,
`HorizontalPodAutoscaler`, `PodDisruptionBudget`, and resource requests and
limits. Targets: liveness on `/health`, readiness on `/ready`, a rolling update
with zero dropped requests. Done when `kubectl delete pod` is invisible to a
client looping on `/api/status`.

### Stage 6 — Monitoring
kube-prometheus-stack via Helm. Scrape all three `/metrics` endpoints, build a
Grafana dashboard from `probe_total`, `sweep_duration_seconds` and
`http_request_duration_seconds`, and write alerts that would actually page:
sweep hasn't completed in 10 minutes, p99 latency over threshold, any monitor
down for 3 consecutive checks. Done when you break something on purpose and
the alert fires before you notice by hand.

### Stage 7 — Close the loop
CD on merge to `main`: build, push to ECR, roll the deployment, verify. Then
deliberately ship a broken image and practise the rollback.

## Cost

Everything through stage 2 is free and local. Stage 3 onward bills: EKS control
plane is ~$0.10/hr, NAT gateways ~$0.045/hr each, RDS on top. **Set an AWS
Budgets alarm before the first `apply`,** and `terraform destroy` whenever you
stop for the day — the state is reproducible by design, that's the point of
stage 3.
