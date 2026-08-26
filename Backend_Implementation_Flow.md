# Backend Implementation Flow: RCE Engine (Iterative Approach)

This document provides an exhaustive, step-by-step technical roadmap for building the Remote Code Execution (RCE) backend engine from scratch. 

To ensure stability and ease of debugging, this guide follows an **iterative "start slow and scale up" approach**. You will build a working minimum viable product (MVP) first, and then progressively layer on asynchronous queues, strict security, process orchestration, and production-grade features.

> [!NOTE]
> **Scope Update:** Output verification (`ACCEPTED`, `WRONG_ANSWER` test case comparisons) is moved to **Future Scope**. Currently, the backend executes the submitted source code with optional standard input (`stdin`) and returns the raw execution results (`stdout`, `stderr`, execution time, memory usage) to the client.

---

## Technical Architecture & Directory Structure Overview

Even though we will build iteratively, it is important to establish the final directory structure early on to organize our code properly.

```
rce-engine/
├── package.json
├── Dockerfiles/
│   ├── cpp.Dockerfile
│   ├── python.Dockerfile
│   └── java.Dockerfile
├── temp/                      # Ephemeral execution workspace (git-ignored)
└── src/
    ├── config/
    │   ├── constants.js       # Boundaries, default limits, status enums
    │   └── redis.js           # Redis client setup & connection pooling
    ├── controllers/
    │   └── submission.controller.js
    ├── middlewares/
    │   ├── rateLimiter.js     # Express rate limiting
    │   └── validator.js       # Payload validation schemas
    ├── queue/
    │   ├── producer.js        # BullMQ queue producer
    │   └── worker.js          # BullMQ worker consumer listener
    ├── engine/
    │   ├── executor.js        # Docker container spawn & stream handling
    │   └── metrics.js         # /usr/bin/time output parser
    ├── utils/
    │   ├── fileManager.js     # Safe temp file write/delete wrappers
    │   └── sanitizer.js       # Paths & log output sanitizer
    ├── routes/
    │   └── submission.routes.js
    └── server.js              # Express app entrypoint
```

---

## Phase 1: The Bare Skeleton (Synchronous MVP)

**Objective:** Get the core execution logic working immediately. Build a simple API that receives code, saves it to a file, runs it inside a basic Docker container synchronously, and returns the output directly. **No Redis, no queues, no complex security yet.**

### Step 1.1: Project Setup & Dependencies
1. Initialize the project: `npm init -y`
2. Install basic dependencies: `npm install express uuid`
3. Install development dependencies: `npm install -D nodemon`
4. Set up the `temp/` directory in the root of your project.

### Step 1.2: Temporary File Management (`src/utils/fileManager.js`)
* Create `createTempWorkspace(jobId, language, sourceCode)`: Generates an isolated temporary folder `./temp/{jobId}/` and writes the code to a file (e.g., `Solution.py`).
* Create `cleanupWorkspace(jobId)`: Safely removes the directory using `fs.rmSync(path, { recursive: true, force: true })`.

### Step 1.3: Synchronous API & Execution (`server.js`)
* Create an Express server listening on port `3000`.
* Create `POST /api/v1/submissions`:
  * Generate a unique ID using `uuid`.
  * Save the code using `fileManager`.
  * Use Node's `child_process.exec` to run a very basic Docker command (e.g., `docker run --rm -v $(pwd)/temp/{jobId}:/workspace python:3.11-alpine python3 /workspace/Solution.py`).
  * *Wait* for execution to finish.
  * Send JSON response with `stdout` and `stderr`.
  * Call `cleanupWorkspace`.

---

## Phase 2: Asynchronous Queuing (Redis & BullMQ)

**Objective:** Prevent long-running code from blocking your API. Move execution to a background worker and introduce a polling mechanism.

### Step 2.1: Infrastructure Setup
* Spin up a local Redis 7 instance via Docker:
  ```bash
  docker run -d --name rce-redis -p 6379:6379 redis:7-alpine
  ```
* Install queue dependencies: `npm install bullmq redis dotenv`

### Step 2.2: The Producer API (`src/queue/producer.js`)
* Initialize a BullMQ queue named `rce-submission-queue`.
* Modify `POST /api/v1/submissions`:
  * Stop executing code synchronously here.
  * Push the payload to BullMQ.
  * Store initial job status (`QUEUED`) in Redis Hash key `submission:{jobId}` with a 24-hour TTL.
  * Return immediate response: `{ jobId: "uuid", status: "QUEUED" }`.
* Create `GET /api/v1/submissions/:jobId` to fetch the status, stdout, and metrics from Redis.

### Step 2.3: The Consumer Worker (`src/queue/worker.js`)
* Create a worker process listening to `rce-submission-queue`.
* Move the execution logic from Phase 1 into this worker.
* When dequeued, update Redis state to `PROCESSING`.
* When execution finishes, update Redis state to `COMPLETED` (or `RUNTIME_ERROR`), saving the raw stdout/stderr output.

---

## Phase 3: Docker Sandbox & Multi-Image Security Architecture

**Objective:** Secure the Docker environment to prevent malicious attacks (fork bombs, network attacks) and optimize startup times by using dedicated micro-images.

### Step 3.1: Multi-Image Strategy
Create dedicated, lightweight Dockerfiles for each language in the `Dockerfiles/` directory:

**1. C++ Sandbox (`cpp.Dockerfile`)**
```dockerfile
FROM alpine:3.18
RUN apk add --no-core g++ libstdc++ util-linux
RUN adduser -D -u 1001 sandboxuser
USER sandboxuser
WORKDIR /tmp
```

**2. Python Sandbox (`python.Dockerfile`)**
```dockerfile
FROM python:3.11-alpine
RUN apk add --no-core util-linux
RUN adduser -D -u 1001 sandboxuser
USER sandboxuser
WORKDIR /tmp
```

### Step 3.2: Compilation vs Runtime Pipelines
* **Compilation Pipeline (C++/Java):** Before running the code, spawn a dedicated Compilation Container. If exit code `!= 0`, capture `stderr`, sanitize paths, and return `COMPILATION_ERROR` immediately. Skip runtime execution.

### Step 3.3: Sandbox Security Flags
* Update the `docker run` command in your worker to include strict isolation flags:
  ```bash
  docker run --rm -i \
    --network none \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --user 1001:1001 \
    --cap-drop=ALL \
    --security-opt=no-new-privileges \
    --pids-limit 64 \
    --memory=${memoryLimitMb}m \
    --memory-swap=${memoryLimitMb}m \
    rce-sandbox-python \
    /usr/bin/time -f "__METRICS__ %e %U %S %M" python3 /tmp/Solution.py
  ```

---

## Phase 4: Process Stream Orchestration & Metric Extraction

**Objective:** Safely pipe inputs, extract exact CPU and memory usage, and handle hard timeouts.

### Step 4.1: Stream Handling & Execution Timeouts (`src/engine/executor.js`)
* Use `child_process.spawn` instead of `exec` to stream data safely.
* Pipe the optional `stdin` payload string into `childProcess.stdin`.
* Collect `stdout` and `stderr` buffers.
* **Timeout Safeguard:** Set a hard timer in Node.js (`setTimeout`) equal to `timeLimitMs + 500ms`.
  * If container does not exit before timeout: Send `docker kill {containerId}` or `childProcess.kill('SIGKILL')`.
  * Mark execution result as `TIME_LIMIT_EXCEEDED (TLE)`.

### Step 4.2: Metric Parsing (`src/engine/metrics.js`)
* Parse the raw execution stream containing the `__METRICS__` tag generated by `/usr/bin/time`.
* Extract Wall time (`%e`), User CPU time (`%U`), System CPU time (`%S`), and Peak RSS Memory (`%M` in KB).
* Calculate `executionTimeMs = Math.round((userCpu + sysCpu) * 1000)`.
* Calculate `memoryUsedKb = peakRssKb`.

---

## Phase 5: Production Polish (Validation & Rate Limiting)

**Objective:** Protect the API from malformed payloads, excessive usage, and internal crashes.

### Step 5.1: Payload Validation (`src/middlewares/validator.js`)
* Install Zod: `npm install zod`
* Create a middleware intercepting `POST /api/v1/submissions`.
* Validate that `language` is supported, `sourceCode` and `stdin` are within 64KB limits, and resource limits are bounded (e.g., max 512MB RAM, max 10000ms time). Return `400 Bad Request` if validation fails.

### Step 5.2: Rate Limiting & Error Handling
* Install: `npm install express-rate-limit`
* Apply a sliding window rate limiter (e.g., 20 requests/minute per IP) to the submission routes.
* Implement a global Express error-handler middleware to catch unexpected worker crashes and return clean `500 Internal Server Error` responses.

---

## Phase 6: Future Roadmap & Advanced Optimizations

Once the core MVP is stabilized, the following features can be added:

1. **Output Verification Engine:**
   * Batch test case evaluation against `expectedOutput` strings.
   * Generation of `ACCEPTED` and `WRONG_ANSWER` status codes.
2. **Pre-Warmed Container Pools:**
   * Transition from cold `docker run` per submission to warm idle container pools for sub-50ms execution latency.
