# blackLAB Factory

<p align="center">
  <img src="docs/images/console_v2.png" alt="blackLAB 3D Campus Console" width="100%" />
</p>

<p align="center">
  <strong>Local-first autonomous venture studio.</strong><br />
  Persistent project memory, multi-department orchestration, 3D campus monitoring, and 24/7 recovery-aware loops.
</p>

<p align="center">
  <a href="https://github.com/junexi0828/blackLAB/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/junexi0828/blackLAB?style=for-the-badge" /></a>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-control%20plane-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-3D%20campus-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-metaverse%20view-111111?style=for-the-badge&logo=three.js&logoColor=white" />
  <img alt="Codex CLI" src="https://img.shields.io/badge/Codex-CLI%20runtime-412991?style=for-the-badge" />
  <img alt="Local First" src="https://img.shields.io/badge/Local--First-no%20cloud%20required-BF6A02?style=for-the-badge" />
</p>

## What This Is

`blackLAB Factory` is a local AI company operating system.

It gives you:

- a control plane at `http://127.0.0.1:8000`
- a 3D campus at `http://127.0.0.1:8000/console`
- multi-department company runs
- persistent project memory across runs
- continuous autopilot loops with recovery logic

The goal is not to run one-off demos. The goal is to keep one project moving forward like a real AI company.

## Core Concepts

| Concept | Meaning |
| --- | --- |
| `Project` | A long-lived product/company effort with persistent memory and shared workspace |
| `Run` | One company work cycle that produces department artifacts and a final operator briefing |
| `Loop` | A long-running automation layer that keeps launching runs for the same project |
| `Launch` | Start one run manually |
| `Autopilot` | Start one loop that keeps improving the same project |
| `Operator Chat` | Natural-language control room for status, launch, stop, and defaults |
| `3D Campus` | Visual-only metaverse view of the company state |

## Control Surfaces

| Surface | Purpose |
| --- | --- |
| `/` | Executive overview of current project, recent runs, loops, and event feed |
| `/console` | Primary visual monitoring surface with 3D campus and live event layer |
| `/launch` | Manual single-run execution |
| `/autopilot` | Continuous loop execution |
| `/operator` | Natural-language control channel |
| `/runs` | Ledger of all runs |
| `/loops` | Ledger of all loops |
| `/settings` | Runtime defaults, models, autonomy, parallelism |

## Quick Start

### 1. Install dependencies

```bash
uv sync --group dev
chmod +x ./blacklab.sh
```

### 2. Start the local control plane

```bash
./blacklab.sh start
```

### 3. Open the product

```bash
./blacklab.sh open
```

Main URLs:

- Control plane: `http://127.0.0.1:8000`
- 3D Campus: `http://127.0.0.1:8000/console`

### 4. Stop it

```bash
# in the same terminal
Ctrl+C
```

Optional background mode:

```bash
./blacklab.sh start-bg
./blacklab.sh status
./blacklab.sh stop
```

## Daily Workflow

1. Open `/console` if you want a visual live view of the company.
2. Open `/launch` if you want one controlled company cycle.
3. Open `/autopilot` if you want the same project to keep moving forward.
4. Open `/runs` to inspect one cycle in detail.
5. Open `/loops` to inspect long-running automation and recovery incidents.
6. Open `/operator` if you want to control the whole system in natural language.

## Departments

The default company layout is:

- CEO
- Research
- Product
- Design
- Dev 1
- Dev 2
- Dev 3
- Growth
- Finance
- Validation
- Test Lab
- Quality Gate
- Board Review

Core departments focus on planning, design, and implementation.

Review departments focus on validation, testing, and final synthesis.

## Persistent Project Memory

Every project gets its own directory under `.factory/projects/<project-slug>/`.

| File | Purpose |
| --- | --- |
| `project.md` | Stable foundation context for the project |
| `current.md` | Latest authoritative context from the newest successful run |
| `memory.md` | Rolling memory of previous runs, decisions, risks, and next hints |
| `workspace/` | Shared project workspace for future implementation files |

This means the next run does not start from zero.

The prompt stack is:

1. `PROJECT FOUNDATION`
2. `PROJECT LIVE CONTEXT`
3. `PROJECT MEMORY`

So the system can keep one product evolving over many runs.

<details>
<summary><strong>Why this matters</strong></summary>

Without a project layer, every run behaves like a separate demo.

With the project layer:

- the company remembers what it already decided
- the latest board-approved direction becomes the next starting point
- the same project can move from research to scope to implementation instead of restarting each time

</details>

## 24/7 Operation And Recovery

Autopilot is designed to keep one project moving, not just to repeat the same prompt.

When a run succeeds:

- the project memory is updated
- the latest context is refreshed
- the next loop iteration starts from the new state

When a run fails:

- the loop records a recovery incident
- `Task Force`, `Rapid Response`, and `Recovery Ops` guidance is created
- the loop can retry instead of dying immediately

Special handling exists for quota errors:

- `usage limit` is treated as a wait condition
- the system waits until retry time
- then resumes with a recovery cycle

<details>
<summary><strong>Recovery model</strong></summary>

The recovery path is intentionally different from a normal cycle.

- review lanes can be forced back to lightweight settings
- concurrency pressure can be reduced
- the next mission becomes a rescue mission instead of a full restart

This keeps the company aligned to the same project even after runtime failures.

</details>

## Tech Stack

- Python 3.11+
- FastAPI
- Jinja2
- Typer
- Pydantic
- Uvicorn
- React 19
- Vite
- React Three Fiber / Drei / Three.js
- Codex CLI runtime integration

## Development

Run tests:

```bash
.venv/bin/pytest -q
```

Run the backend directly:

```bash
.venv/bin/uvicorn blacklab_factory.web:create_app --factory --host 127.0.0.1 --port 8000
```

Build the frontend:

```bash
cd frontend
npm install
npm run build
```

## Project Layout

```text
src/blacklab_factory/     core runtime, orchestration, dashboard, storage
frontend/                 React-based 3D campus and console UI
config/company.yaml       department definitions and company defaults
.factory/                 runtime data, runs, loops, projects, operator state
docs/                     architecture notes, references, screenshots
tests/                    backend and web test suite
```

## Advanced Notes

<details>
<summary><strong>Launch vs Autopilot vs Operator Chat</strong></summary>

- `Launch` creates one run and stops.
- `Autopilot` creates a loop that keeps launching runs.
- `Operator Chat` is the same control plane expressed in natural language.

</details>

<details>
<summary><strong>Run vs Loop</strong></summary>

- A `run` is one company work cycle.
- A `loop` is a persistent automation layer over many runs.

Use `Runs` to inspect one cycle.

Use `Loops` to inspect continuous project execution.

</details>

<details>
<summary><strong>Related docs</strong></summary>

- [Stack Decision](docs/stack-decision.md)
- [Market Map](docs/market-map.md)
- [Orchestration References](docs/orchestration-references.md)

</details>

---

<p align="center">
  Built by juns for blackLAB.
</p>
