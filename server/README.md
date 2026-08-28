# AutoDL H3 Agent Runtime

This process is the single source of truth for the Prompt Assistant. It owns
DeepAgents, the complete multi-file H3 skill bundle, model credentials, and
the AG-UI/CopilotKit transport. The Android app contains only the rendered
CopilotKit RN client.

## Run locally

1. Copy `.env.example` to `.env` and set `LLM_API_KEY`, `LLM_MODEL`, and a
   random `AUTH_SECRET`.
2. Install dependencies with `npm install`.
3. Start with `npm start` (default `http://0.0.0.0:8200`).

The Android emulator connects to `http://10.0.2.2:8200/api/copilotkit` and
sends `Authorization: Bearer <AUTH_SECRET>`. Configure that URL and token in
the app's Settings screen. Production deployments should use an HTTPS URL.

Health: `GET /healthz` (public). Runtime metadata and AG-UI requests are
under `/api/copilotkit` and require the bearer token.
