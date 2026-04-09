# Orchestration References

Date checked: 2026-04-09

## High-star references reviewed

- `FoundationAgents/MetaGPT` — 66,814 stars
- `microsoft/autogen` — 56,842 stars
- `crewAIInc/crewAI` — 48,388 stars
- `langchain-ai/langgraph` — 28,753 stars
- `openai/openai-agents-python` — 20,656 stars

## What blackLAB should learn from each

### MetaGPT

- Strongest example of a role-based AI company
- Useful pattern: explicit department responsibilities and artifact handoffs
- Applied in blackLAB:
  `CEO -> Research -> Product -> Design -> Engineering -> Growth -> Finance`

### AutoGen

- Strong on multi-agent conversation and agent-to-agent coordination
- Useful pattern: agents should be able to collaborate while a central orchestrator still controls state
- Applied in blackLAB:
  department workers are background processes, while the factory owns the run state and audit trail

### CrewAI

- Strong on crews, tasks, and operational workflows
- Useful pattern: execution should be task-oriented, not just message-oriented
- Applied in blackLAB:
  each department is a bounded task that must produce a concrete artifact and handoff

### LangGraph

- Strong on durable execution, resumability, and dependency graphs
- Useful pattern: agent orchestration should be modeled as a graph, not just a linear loop
- Applied in blackLAB:
  departments now declare dependencies, and independent departments can run in parallel

### OpenAI Agents SDK

- Strong on handoffs, tools, and thin Python orchestration
- Useful pattern: keep the control plane lightweight while delegating reasoning to agents
- Applied in blackLAB:
  the factory keeps its own storage, logs, and dashboard rather than hiding them inside a framework

## Current blackLAB orchestration principles

- One central control plane owns truth
- Workers run in the background
- The operator watches a dashboard, not raw agent terminals
- Every department must produce an artifact
- Every run must leave logs, risk inventory, progress state, and process history
- Parallelism is allowed only where dependency edges permit it

## Current gap list

- The dashboard is a control room, but not yet a full live multiplexer for every worker terminal
- Codex runs need stronger timeout, retry, and cancellation controls
- Artifact quality should be scored before a handoff is accepted
- A future queue/graph runtime could replace the current in-process scheduler
