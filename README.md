# Clarivue — AI-Powered Data Analytics Copilot

Clarivue turns plain-English questions into safe, optimized SQL queries — no SQL knowledge required. Upload a spreadsheet, ask a question, and get an accurate answer backed by real data: chart, table, and explanation included.

Built as a full-stack AI product: prompt engineering, database security, cost-aware LLM orchestration, and a polished frontend — not just a wrapper around an API call.

## Key Engineering Decisions

- **Security-first AI execution** — the AI is architecturally restricted to read-only `SELECT` queries. Even a maliciously-phrased question cannot trigger a `DELETE`, `DROP`, or `UPDATE` against the database.
- **Self-healing query generation** — if the AI's first SQL attempt fails, the system automatically feeds the error back to the model, regenerates a corrected query, and retries — reducing user-facing failures without manual intervention.
- **Cost-aware, conditional AI routing** — simple lookups run a single lightweight query. Deeper diagnostic questions ("why did X happen?") only trigger a more expensive multi-angle root-cause investigation when explicitly warranted — avoiding unnecessary LLM calls on routine requests.
- **Automatic dataset summarization** — large result sets are automatically condensed (top/bottom-N sampling) before being sent to the LLM, controlling token cost and latency as datasets scale.
- **Conversational memory** — follow-up queries ("now show the lowest instead") are resolved using prior query context, without requiring the user to repeat themselves.
- **Dynamic schema handling** — uploaded files are automatically profiled and converted into properly-typed database tables at runtime, with no hardcoded schema assumptions.

## Features

- Upload Excel/CSV → automatic table creation and ingestion
- Natural language → SQL → real-time execution → plain-English explanation
- Automatic chart + table generation per query
- Conditional root-cause analysis for diagnostic ("why") questions
- Persistent, clearable question history
- Read-only database access guarantee

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Database | MySQL |
| AI / LLM | Google Gemini API |
| Frontend | HTML, Tailwind CSS, Chart.js |
| Architecture | RESTful API, server-rendered static frontend |

## Getting Started

1. Clone this repo
2. `npm install`
3. Copy `.env.example` to `.env` and fill in your MySQL credentials + Gemini API key
4. `npm start`
5. Open `http://localhost:5000`

## Screenshots
(Add screenshots here later)

## Screenshots
*(Add screenshots here)*
