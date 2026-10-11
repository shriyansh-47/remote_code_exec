# ⚡ RCE — Remote Code Execution Engine

A production-grade, sandboxed remote code execution engine built with **TypeScript**, **Express**, **BullMQ**, **Redis**, and **Docker**. Users submit code in C++, Python, or Java, and the engine compiles, executes, and returns the output — all inside isolated, resource-limited Docker containers.

---

## 📑 Table of Contents

- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [How It Works](#-how-it-works)
- [Sandbox Security Model](#-sandbox-security-model)
- [Setup & Installation](#-setup--installation)
- [API Reference](#-api-reference)
- [Configuration](#-configuration)
- [Error Handling](#-error-handling)
- [Future Implementations](#-future-implementations)

---

## 🏗 Architecture

```
                         ┌─────────────────────────────────────────────────────┐
                         │                    CLIENT                          │
                         │           (Browser / Frontend)                     │
                         └──────────┬──────────────────┬──────────────────────┘
                                    │                  │
                              POST /submissions   GET /submissions/:id
                              (submit code)        (poll for result)
                                    │                  │
                         ┌──────────▼──────────────────▼──────────────────────┐
                         │              EXPRESS API SERVER                    │
                         │                                                   │
                         │  ┌─────────────┐  ┌────────────┐  ┌────────────┐  │
                         │  │Rate Limiter │──▶│ Validator  │──▶│ Controller │  │
                         │  │(20 req/min) │  │  (Zod)     │  │            │  │
                         │  └─────────────┘  └────────────┘  └─────┬──────┘  │
                         └─────────────────────────────────────────┼──────────┘
                                                                   │
                                                          addJobToQueue()
                                                                   │
                         ┌─────────────────────────────────────────▼──────────┐
                         │                    REDIS                           │
                         │            (BullMQ Job Queue)                      │
                         │         "submission-queue"                         │
                         └─────────────────────────────────────────┬──────────┘
                                                                   │
                                                         Blocking BLMOVE
                                                          (event-driven)
                                                                   │
                         ┌─────────────────────────────────────────▼──────────┐
                         │               BULLMQ WORKER                       │
                         │            (concurrency: 5)                       │
                         │                                                   │
                         │  1. Create temp folder with source code           │
                         │  2. [C++/Java only] Spin COMPILATION container    │
                         │  3. Spin EXECUTION container (sandboxed)          │
                         │  4. Pipe stdin via streams                        │
                         │  5. Collect stdout/stderr                         │
                         │  6. Parse execution metrics (time, memory)        │
                         │  7. Clean up temp folder                          │
                         │  8. Return result → BullMQ stores in Redis        │
                         └───────────────────────────────────────────────────┘
                                          │
                            ┌─────────────┼─────────────┐
                            │             │             │
                            ▼             ▼             ▼
                     ┌──────────┐  ┌──────────┐  ┌──────────┐
                     │  C++     │  │  Python  │  │  Java    │
                     │Container │  │Container │  │Container │
                     │(Alpine)  │  │(Alpine)  │  │(Temurin) │
                     └──────────┘  └──────────┘  └──────────┘
                      Sandboxed     Sandboxed     Sandboxed
```

### Key Design Decisions

- **Asynchronous Task Queue:** Code execution is decoupled from the HTTP request-response cycle using BullMQ + Redis. The API immediately returns a `jobID` (HTTP 202 Accepted), and the client polls for the result. This prevents the Express server from being blocked by long-running compilations.
- **Short Polling:** The frontend polls `GET /submissions/:jobID` every second. The backend responds instantly with the current state — it never holds the connection open (no long polling).
- **Split Compilation & Execution:** Compiled languages (C++, Java) use two separate containers — one for compilation (less restricted, 10s timeout) and one for execution (heavily sandboxed, 5s timeout). This enables precise error classification (COMPILATION-ERROR vs RUNTIME-ERROR).
- **Event-Driven Worker:** BullMQ uses Redis Blocking Lists (`BLMOVE`) internally, so the worker doesn't poll Redis in a loop. It sleeps until a job arrives, saving CPU and RAM.

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | TypeScript | Type-safe codebase with strict mode |
| **Runtime** | Node.js | Server-side JavaScript runtime |
| **Framework** | Express v5 | HTTP API server |
| **Queue** | BullMQ | Job queue for async code execution |
| **Datastore** | Redis (via ioredis) | Job storage, queue backend |
| **Sandboxing** | Docker | Isolated container execution |
| **Validation** | Zod | Runtime schema validation with TS type inference |
| **Rate Limiting** | express-rate-limit | API abuse prevention (20 req/min per IP) |
| **Dev Tooling** | tsx | TypeScript execution without build step |

---

## 📁 Project Structure

```
rce/
├── Dockerfiles/
│   ├── cpp.Dockerfile          # Alpine + g++ + GNU time
│   ├── java.Dockerfile         # Eclipse Temurin JDK 17 + GNU time
│   └── python.Dockerfile       # Python 3.11 Alpine + GNU time
│
├── src/
│   ├── config/
│   │   └── redis.ts            # Redis connection (ioredis)
│   │
│   ├── controllers/
│   │   └── submissions.controller.ts  # POST (submit) & GET (poll) handlers
│   │
│   ├── engine/
│   │   ├── executor.ts         # Spawns Docker containers, pipes I/O, handles timeouts
│   │   └── metrics.ts          # Parses GNU time output (execution time, memory)
│   │
│   ├── middlewares/
│   │   ├── rateLimiter.ts      # 20 requests/minute per IP
│   │   └── validator.ts        # Zod schema validation + SubmissionPayload type
│   │
│   ├── queues/
│   │   └── producer.ts         # BullMQ Queue definition, addJobToQueue, getJobById
│   │
│   ├── routes/
│   │   └── submissions.routes.ts  # Express router wiring
│   │
│   ├── utils/
│   │   ├── apiError.ts         # Custom error class with statusCode
│   │   ├── asyncHandler.ts     # Wraps async route handlers for error bubbling
│   │   └── fileManager.ts      # Creates/cleans temp folders for source code
│   │
│   ├── workers/
│   │   └── worker.ts           # BullMQ Worker — orchestrates compile + execute
│   │
│   ├── app.ts                  # Express app setup, middleware, global error handler
│   └── index.ts                # Entry point — starts server + worker
│
├── temp/                       # Runtime: temporary job folders (gitignored)
├── tsconfig.json               # TypeScript configuration
├── package.json                # Dependencies and scripts
└── .env                        # Environment variables
```

---

## ⚙ How It Works

### 1. Code Submission (`POST /api/v1/submissions`)
```
Client → Rate Limiter → Zod Validator → Controller → BullMQ Queue → Redis
```
- The request body is validated against a Zod schema (`language`, `srcCode`, `stdin`).
- A UUID (`jobID`) is generated and the job is pushed into the `submission-queue`.
- The server immediately responds with `{ jobID, status: "QUEUED" }` (HTTP 202).

### 2. Code Execution (BullMQ Worker)
```
Redis → Worker → Create Files → [Compile Container] → Execute Container → Parse Metrics → Store Result
```
- The worker picks up the job from Redis (event-driven, no polling).
- Source code and stdin are written to `temp/<jobID>/`.
- **Compiled languages (C++, Java):** A compilation container runs first with a 10-second timeout.
- **All languages:** An execution container runs with full sandbox restrictions and a 5-second timeout.
- `stdin` is piped into the container via Node.js streams (`fs.createReadStream → child.stdin`).
- `stdout` and `stderr` are collected from the container's output streams.
- GNU `time` writes execution time and peak memory usage to `metrics.txt`, which is parsed after execution.
- The temp folder is cleaned up regardless of success or failure.

### 3. Result Polling (`GET /api/v1/submissions/:jobID`)
```
Client → Controller → Redis → Response
```
- The controller checks BullMQ for the job state (`completed`, `failed`, or still processing).
- Returns the appropriate response with output, error details, or "PROCESSING" status.

---

## 🔒 Sandbox Security Model

Every user's code runs inside a Docker container with these restrictions:

| Restriction | Flag | Purpose |
|------------|------|---------|
| **No Network** | `--network none` | Prevents internet access, DNS lookups, and data exfiltration |
| **Read-Only Filesystem** | `--read-only` | Prevents writing to the container's filesystem |
| **Writable /tmp** | `--tmpfs /tmp:rw,noexec,nosuid,size=64m` | Limited writable space, no executable files |
| **Non-Root User** | `--user 1729:1729` | Runs as unprivileged `sandboxed_user` |
| **Drop All Capabilities** | `--cap-drop=ALL` | Removes all Linux kernel capabilities |
| **No Privilege Escalation** | `--security-opt=no-new-privileges` | Prevents `setuid`/`setgid` exploits |
| **Process Limit** | `--pids-limit 64` | Prevents fork bombs |
| **Memory Limit** | `--memory=256m --memory-swap=256m` | Hard 256MB cap, no swap |
| **Time Limit** | `setTimeout (5s)` | Kills container after 5 seconds |
| **Compilation Timeout** | `exec timeout (10s)` | Kills compilation after 10 seconds |

---

## 🚀 Setup & Installation

### Prerequisites

- **Node.js** (v18 or higher)
- **Docker Desktop** (running)
- **Redis** (running on `localhost:6379`)

### Step 1: Clone & Install

```bash
git clone https://github.com/your-username/rce.git
cd rce
npm install
```

### Step 2: Build Docker Images

```bash
docker build -t rce-sandbox-cpp -f Dockerfiles/cpp.Dockerfile .
docker build -t rce-sandbox-python -f Dockerfiles/python.Dockerfile .
docker build -t rce-sandbox-java -f Dockerfiles/java.Dockerfile .
```

### Step 3: Configure Environment

Create a `.env` file in the project root:

```env
PORT=3000
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
CORS_ORIGIN=*
```

### Step 4: Run

```bash
# Development (hot-reload with tsx)
npm run dev

# Production
npm run build      # Compiles TypeScript → dist/
npm run start      # Runs compiled JavaScript
```

### Verify Setup

```bash
curl -X POST http://localhost:3000/api/v1/submissions \
  -H "Content-Type: application/json" \
  -d '{"language": "python", "srcCode": "print(\"Hello, World!\")"}'
```

Expected response:
```json
{ "jobID": "abc-123-...", "status": "QUEUED" }
```

Then poll the result:
```bash
curl http://localhost:3000/api/v1/submissions/abc-123-...
```

---

## 📡 API Reference

### `POST /api/v1/submissions`

Submit code for execution.

**Request Body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `language` | `"cpp" \| "python" \| "java"` | ✅ | Must be one of the supported languages |
| `srcCode` | `string` | ✅ | 1–64,000 characters |
| `stdin` | `string` | ❌ | 0–64,000 characters (defaults to empty) |

**Response (202 Accepted):**
```json
{
  "jobID": "550e8400-e29b-41d4-a716-446655440000",
  "status": "QUEUED"
}
```

### `GET /api/v1/submissions/:jobID`

Poll for the execution result.

**Possible Responses:**

```json
// Still processing
{ "jobID": "...", "status": "PROCESSING" }

// Successful execution
{
  "jobID": "...",
  "status": "COMPLETED",
  "result": {
    "stdout": "Hello, World!\n",
    "stderr": "",
    "executionTime": 0.012,
    "memoryUsage": 3.2
  }
}

// Failed execution
{ "jobID": "...", "status": "RUNTIME-ERROR", "error": "segmentation fault" }
{ "jobID": "...", "status": "COMPILATION-ERROR", "error": "expected ';' before '}'" }
{ "jobID": "...", "status": "TIME-LIMIT-EXCEEDED", "error": "Execution took too long (> 5sec)" }
{ "jobID": "...", "status": "MEMORY-LIMIT-EXCEEDED", "error": "Code consumed all my memory (>256MB)" }
```

---

## ⚙ Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Express server port |
| `REDIS_HOST` | `127.0.0.1` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |

---

## 🛡 Error Handling

The engine uses a layered error-handling strategy:

1. **Zod Validation** → Catches malformed requests before they reach the controller.
2. **asyncHandler** → Wraps every async controller and forwards thrown errors to the global error handler.
3. **Error Bubbling** → Errors thrown anywhere in the controller chain are caught by `asyncHandler` and passed to Express via `next(error)`.
4. **Global Error Handler** → Catches all errors and returns a structured JSON response with `statusCode`, `message`, `errors`, and `stack`.
5. **BullMQ Error Propagation** → Worker errors are thrown as `new Error(JSON.stringify({type, message}))`. BullMQ stores `Error.message` as `failedReason` in Redis. The controller later parses it back with `JSON.parse()`.

---

## 🔮 Future Implementations

### Phase 1: Decouple API & Worker
- Separate `src/index.ts` into two independent processes: `server.ts` (API only) and `worker-process.ts` (worker only).
- This enables scaling workers independently from the API server.

### Phase 2: Horizontal Scaling
- Run multiple worker instances across different machines, all connected to the same Redis queue.
- BullMQ natively supports competing consumers — no code changes needed once Phase 1 is complete.

### Phase 3: Additional Language Support
- Add Node.js/JavaScript, Rust, Go, and other language sandboxes.
- Each language requires a new Dockerfile and a command mapping in `worker.ts`.

### Phase 4: WebSocket-Based Result Delivery
- Replace short polling with WebSockets for real-time result streaming.
- Reduces unnecessary HTTP requests and provides instant feedback.

### Phase 5: Observability & Monitoring
- Add structured logging (e.g., Pino/Winston) with correlation IDs per job.
- Integrate Prometheus metrics for queue depth, execution times, and error rates.
- Build a Grafana dashboard for real-time monitoring.

### Phase 6: Load Balancer & API Gateway
- Place Nginx or Traefik in front of multiple API server instances.
- Centralize rate limiting, SSL termination, and routing.

### Phase 7: Container Orchestration
- Migrate from raw Docker CLI to Kubernetes or Docker Swarm.
- Use resource quotas, auto-scaling, and health checks at the orchestration layer.

---

## 👤 Author

**Shriyansh Yadav**

## 📄 License

ISC
