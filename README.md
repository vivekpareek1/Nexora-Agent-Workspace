# Nexora Agent Workspace

Chat with an automatically selected specialist (260+), save skills and knowledge, and generate small static web apps with approval-first GitHub/Render publishing. Runs on Hatchable (https://nexora-agent.hatchable.site).

## Layout
- `api/` HTTP routes (all require a signed-in user except the platform user-deleting hook)
- `lib/` shared code: `providers.js` (free-tier LLM routing with a 48s time budget), `agents.js` (specialist catalogue)
- `public/` static front end; `migrations/` SQL; `hatchable.toml` manifest

## Required secrets
`GITHUB_TOKEN` (read access to the specialist repo), plus at least one of `GROQ_API_KEY` / `OPENROUTER_API_KEY`. Only free models are used (OpenRouter ids must end in `:free`).

## Behaviour and limits
- 40 requests per user per day; failed requests are refunded.
- Prompts are sent to third-party free-tier providers; do not submit confidential data.
- Generated apps are drafts: review them before pushing or deploying.
