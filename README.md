# SEC Insight Agent

An AI-powered web application that answers plain-English questions about public companies using **real, live SEC EDGAR filings**. Powered by GPT-4o, LangChain, and FastAPI.

---

## Project Overview

SEC Insight Agent lets you ask questions like:

> *"What risks did Tesla mention in their latest 10-K?"*
> *"Did Apple discuss AI in their last quarterly report?"*
> *"What was Nvidia's revenue growth according to their most recent annual filing?"*

The agent searches SEC EDGAR for the relevant company, retrieves their actual filings, reads them, and synthesizes a clear answer — citing which filing type and date it used.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
│                    React + Vite + Tailwind CSS                  │
│                        localhost:5173                           │
└────────────────────────────┬────────────────────────────────────┘
                             │  POST /api/chat
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Backend                              │
│              FastAPI + LangChain + GPT-4o                       │
│                       localhost:8000                            │
│                                                                 │
│  1. Receives user question                                      │
│  2. Runs LangChain agent with 3 tools                           │
│  3. Agent decides which tools to call and in what order         │
│  4. Returns synthesized answer + source citations               │
└──────────────┬──────────────────────────────────────────────────┘
               │  GET /company/search
               │  GET /company/{cik}/filings
               │  GET /filing/document
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server                               │
│                FastAPI microservice                             │
│                     localhost:8001                              │
│                                                                 │
│  The ONLY service that talks to SEC EDGAR                       │
│  Wraps EDGAR APIs into clean typed endpoints                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTPS requests
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SEC EDGAR                                │
│              https://efts.sec.gov (search)                      │
│              https://data.sec.gov (filings)                     │
│              https://www.sec.gov  (documents)                   │
│                    Free, no API key required                    │
└─────────────────────────────────────────────────────────────────┘
```

### How the components connect

| Component | Role | Port |
|-----------|------|------|
| **Frontend** | React UI — user types questions, displays answers | 5173 |
| **Agent Backend** | LangChain agent — reasons over tools, calls GPT-4o | 8000 |
| **MCP Server** | EDGAR API wrapper — the only service touching SEC data | 8001 |

---

## Prerequisites

- **Node.js** 18+ and npm (for the frontend)
- **Python 3.10–3.13** — Python 3.14 is **not yet supported** due to a pydantic-core/Rust build constraint. If your default `python3` is 3.14, use `/opt/anaconda3/bin/python3.13` or install Python 3.13 via Homebrew (`brew install python@3.13`) and use `python3.13` in the commands below.
- **OpenAI API key** — get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Internet access (the MCP server fetches live data from SEC EDGAR)

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/sec-insight-agent.git
cd sec-insight-agent
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your OpenAI API key:

```
OPENAI_API_KEY=sk-...your-key-here...
MCP_SERVER_URL=http://localhost:8001
AGENT_PORT=8000
MCP_PORT=8001
```

### 3. Start the MCP Server

Open a terminal in the `mcp_server/` directory:

```bash
cd mcp_server

# Use python3.13 explicitly if your default python3 is 3.14
python3.13 -m venv venv          # or: python3 -m venv venv (if you have 3.10–3.13)
source venv/bin/activate        # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8001
```

Verify it's running: open [http://localhost:8001/health](http://localhost:8001/health) — you should see `{"status": "ok"}`.

You can also explore the auto-generated API docs at [http://localhost:8001/docs](http://localhost:8001/docs).

### 4. Start the Agent Backend

Open a **new terminal** in the `agent/` directory:

```bash
cd agent

# Use python3.13 explicitly if your default python3 is 3.14
python3.13 -m venv venv          # or: python3 -m venv venv (if you have 3.10–3.13)
source venv/bin/activate        # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server (it reads .env from the project root)
uvicorn main:app --reload --port 8000
```

Verify it's running: open [http://localhost:8000/health](http://localhost:8000/health) — you should see `{"status": "ok", "agent": "ready"}`.

### 5. Start the Frontend

Open a **new terminal** in the `frontend/` directory:

```bash
cd frontend

# Install dependencies
npm install

# Start the Vite dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 6. Test the full flow

In the chat, type:

> *"What risks did Tesla mention in their latest 10-K?"*

The agent will search EDGAR for Tesla, fetch their most recent 10-K, read it, and return a detailed answer with source citations.

---

## Example Queries

| Question | What the agent does |
|----------|---------------------|
| *"What risks did Tesla mention in their latest 10-K?"* | Finds Tesla's CIK, fetches their most recent 10-K, reads the Risk Factors section |
| *"Did Apple discuss AI in their last quarterly report?"* | Searches for Apple's most recent 10-Q, scans for AI-related disclosures |
| *"What was Nvidia's revenue in their most recent annual filing?"* | Retrieves Nvidia's 10-K, finds the consolidated statements of income |
| *"Summarize Microsoft's business overview from their 10-K"* | Reads the Business section of Microsoft's latest 10-K |
| *"What acquisitions did Google make according to their SEC filings?"* | Searches Alphabet's 10-K for acquisition disclosures |
| *"What did Amazon say about AWS growth in their latest 10-Q?"* | Fetches Amazon's most recent quarterly report, reads AWS segment data |

---

## Project Structure

```
sec-insight-agent/
│
├── frontend/                   # React + Vite + Tailwind CSS frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx      # Scrollable message history
│   │   │   ├── MessageBubble.jsx   # Individual message (user/agent/error)
│   │   │   ├── SearchBar.jsx       # Bottom input bar
│   │   │   └── LoadingIndicator.jsx # Animated dots while agent thinks
│   │   ├── App.jsx             # Root component — state management, API calls
│   │   ├── main.jsx            # React entry point
│   │   └── index.css           # Global styles + Tailwind + markdown prose
│   ├── index.html              # HTML entry point
│   ├── vite.config.js          # Vite config + /api proxy rule
│   ├── tailwind.config.js      # Tailwind custom colors and animations
│   └── package.json
│
├── agent/                      # LangChain agent backend (FastAPI, port 8000)
│   ├── main.py                 # FastAPI app, POST /chat endpoint
│   ├── agent.py                # Agent executor construction + history formatting
│   ├── tools.py                # 3 LangChain tools: search, filings, content
│   ├── prompts.py              # System prompt and message templates
│   └── requirements.txt
│
├── mcp_server/                 # EDGAR API wrapper (FastAPI, port 8001)
│   ├── main.py                 # FastAPI app, 4 REST endpoints
│   ├── edgar_client.py         # All EDGAR HTTP calls — company search, filings, documents
│   ├── models.py               # Pydantic models for all requests/responses
│   └── requirements.txt
│
├── .env.example                # Template for required environment variables
├── .gitignore                  # Excludes .env, venvs, node_modules, caches
└── README.md                   # This file
```

### Key file responsibilities

| File | Responsibility |
|------|---------------|
| `mcp_server/edgar_client.py` | Every HTTP call to SEC EDGAR lives here. No other file touches EDGAR. |
| `mcp_server/models.py` | Pydantic models ensure type-safe data across all endpoints. |
| `agent/tools.py` | LangChain tool definitions — the bridge between the LLM and the MCP server. |
| `agent/agent.py` | Wires together GPT-4o, tools, and the prompt into an AgentExecutor. |
| `agent/prompts.py` | The system prompt defines the agent's identity, rules, and reasoning strategy. |
| `frontend/src/App.jsx` | Manages all React state and makes the single POST /api/chat call. |

---

## Deployment Guide (Railway + Vercel)

This is the recommended free-tier deployment for sharing with others.
Takes about 20 minutes. No Docker or cloud accounts beyond Railway and Vercel needed.

### Step 1 — Deploy the MCP Server to Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select `rayyankhann/sec-insight-agent`
3. When prompted for settings:
   - **Root Directory:** `mcp_server`
   - **Start Command:** *(leave blank — Railway reads the `Procfile` automatically)*
4. No environment variables needed (SEC EDGAR is a public API)
5. Click **Deploy**. Railway gives you a URL like:
   `https://mcp-server-production.up.railway.app`
6. Verify: open `https://mcp-server-production.up.railway.app/health` — should return `{"status":"ok"}`

### Step 2 — Deploy the Agent Backend to Railway

1. In the same Railway project → **New Service** → **GitHub Repo** → same repo
2. Settings:
   - **Root Directory:** `agent`
   - **Start Command:** *(leave blank — reads `Procfile`)*
3. Add these **environment variables** in Railway's Variables tab:
   ```
   OPENAI_API_KEY        = sk-proj-...your key...
   MCP_SERVER_URL        = https://mcp-server-production.up.railway.app
   ALLOWED_ORIGINS       = https://sec-insight-agent.vercel.app
   ```
   *(Set `ALLOWED_ORIGINS` to your Vercel URL — you'll get this in Step 3. You can update it after.)*
4. Click **Deploy**. You'll get a URL like:
   `https://sec-agent-backend-production.up.railway.app`
5. Verify: open `.../health` — should return `{"status":"ok","agent":"ready"}`

### Step 3 — Deploy the Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import `rayyankhann/sec-insight-agent`
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite *(auto-detected)*
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add this **environment variable**:
   ```
   VITE_API_URL = https://sec-agent-backend-production.up.railway.app
   ```
4. Click **Deploy**. Vercel gives you a URL like:
   `https://sec-insight-agent.vercel.app`

### Step 4 — Update CORS on Railway

Now that you have the Vercel URL, go back to your **agent backend** service on Railway:
- Update `ALLOWED_ORIGINS` to your exact Vercel URL:
  `https://sec-insight-agent.vercel.app`
- Railway redeploys automatically

### Done — share the Vercel URL with your friend!

### Environment Variables Summary

| Variable | Set on | Value |
|----------|--------|-------|
| `OPENAI_API_KEY` | Railway (agent) | Your OpenAI key |
| `MCP_SERVER_URL` | Railway (agent) | Railway MCP server URL |
| `ALLOWED_ORIGINS` | Railway (agent + mcp) | Your Vercel app URL |
| `VITE_API_URL` | Vercel (frontend) | Railway agent backend URL |

> **AWS alternative:** For enterprise deployment, replace Railway with AWS ECS (Fargate) and Vercel with S3 + CloudFront. Store secrets in AWS Secrets Manager and inject them as ECS task environment variables.

---

## Development Notes

- The Vite dev server proxies `/api/*` to `http://localhost:8000` — see `vite.config.js`
- Run all three services simultaneously in separate terminal tabs
- EDGAR rate limits: keep requests reasonable (the app doesn't batch-crawl)
- GPT-4o `temperature=0` is intentional — we want deterministic, factual answers
- Filing content is truncated at 12,000 characters to manage API costs

---

## License

MIT
