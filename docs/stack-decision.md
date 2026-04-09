# Stack Decision

Date: 2026-04-09

## The current OSS landscape

- MetaGPT is still the closest match to the "AI company with specialized roles" idea. It is large, popular, and explicitly models a software company.
- LangGraph is strong when you want durable state graphs, resumability, and human checkpoints.
- OpenAI Agents SDK is a lighter base when you want a Python-native multi-agent core with optional tracing and handoffs.

## Decision

BlackLAB Factory uses:

- `uv` for environment and dependency management.
- File-backed run storage under `.factory/`.
- A department-based runner implemented in plain Python.
- An optional OpenAI Agents SDK adapter for live agent execution.
- FastAPI + Jinja for local observability.

## Why not clone MetaGPT directly

- The local machine is on Python 3.14. MetaGPT currently documents Python `>=3.9,<3.12`, so it is not the cleanest zero-friction starting point here.
- You asked for a user-auditable "factory", not just a one-shot generator. That means storage, audit trails, and an operations screen matter more than pure role simulation.
- A thinner control plane keeps the repo understandable and modifiable when the company shape changes.

## Upgrade path

1. Start with `mock` mode to prove the operating model.
2. Switch to `openai` mode once keys are configured.
3. Replace the simple sequential runner with a graph or queue scheduler if you want concurrent subteams later.
4. Add a worker process, approvals, or external tools only after the audit loop is stable.

