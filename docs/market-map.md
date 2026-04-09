# Stack Map

Date checked: April 9, 2026

## Current open-source options

### MetaGPT

- Repo: <https://github.com/geekan/MetaGPT>
- Why it matters: It is the closest match to the "AI company with roles" idea.
- Why it is not the base here: it is conceptually strong, but this workspace is
  being bootstrapped as a lighter local factory with direct file outputs and an
  inspectable dashboard rather than a framework-first runtime.

### CrewAI

- Repo: <https://github.com/crewAIInc/crewAI>
- Why it matters: strong multi-agent workflow focus and broad community usage.
- Why it is not the base here: it is useful when the framework should drive the
  whole runtime, but the immediate need is a transparent local operating system
  with simple persistence and audit visibility.

### LangGraph

- Repo: <https://github.com/langchain-ai/langgraph>
- Why it matters: graph-based orchestration, durable agent loops, and a very
  large ecosystem footprint.
- Why it is not the base here: it is excellent for complex state graphs, but is
  more infrastructure than needed for a first factory cut.

### OpenAI Agents SDK

- Repo: <https://github.com/openai/openai-agents-python>
- Docs: <https://openai.github.io/openai-agents-python/quickstart/>
- Why it is the runtime target here: it gives a clean Python interface for
  agents, tools, orchestration, and traces, while letting the project keep its
  own file-based control plane.

## Selection

This repository uses a hybrid approach:

- The operating model is inspired by MetaGPT's role-based company structure.
- The local control plane is custom and file-backed for auditability.
- Real-agent execution is designed around the OpenAI Agents SDK.
- Mock execution stays available so the factory can run without credentials.

This keeps the first version inspectable and practical instead of overfitting
to a framework before the company process is stable.
