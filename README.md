# Clarivue

An AI-powered data analytics tool. Upload an Excel or CSV file, ask questions about it in plain English, and get back an answer with a chart and a table — no SQL needed.

## Demo Video
<a href="https://www.youtube.com/watch?v=Os5uC45igMc">
  <img src="https://img.youtube.com/vi/Os5uC45igMc/maxresdefault.jpg" width="500">
</a>

*Click the thumbnail above to watch a full walkthrough — uploading data, automatic chart selection, root cause analysis, and more.*

▶️ [Watch the full demo on YouTube](https://www.youtube.com/watch?v=Os5uC45igMc)

## Why I built this

I wanted to understand how a full AI product actually gets built — not just calling an API, but handling the real problems that come with it: making sure the AI can't accidentally run a destructive database query, keeping costs down when questions get complex, and dealing with things like duplicate uploads and broken SQL.

## What it does

- Upload a CSV/Excel file → it automatically creates a database table from it
- Ask a question like "which region had the highest sales?" → it writes the SQL, runs it, and explains the answer in plain English
- Automatically picks a chart type based on the data (bar, line, or scatter)
- Understands follow-up questions like "now show the lowest instead"
- If you ask "why" something happened, it digs a bit deeper — checking region, product, and time period before answering, and it says "not enough data" instead of making something up when that's genuinely true
- Keeps a history of past questions, which you can clear
- The AI can only read data, never modify or delete it — this is enforced in code, not just something I asked it nicely to do

## How it works

```
Browser (HTML + Tailwind + Chart.js)
        |
        v
Backend (Node.js + Express)
   - checks the uploaded file, builds the table
   - sends the question + schema to Gemini
   - validates the SQL is read-only before running it
   - runs it on MySQL
   - sends the result back to Gemini for a plain-English explanation
        |
        v
MySQL database (hosted on Aiven)
```

## Tech stack

- **Backend:** Node.js, Express
- **Database:** MySQL (Aiven, cloud-hosted)
- **AI:** Google Gemini API
- **Frontend:** HTML, Tailwind CSS, Chart.js
- **Deployment:** Render (auto-deploys from this repo)

## Running it locally

1. Clone this repo
2. `npm install`
3. Copy `.env.example` to `.env`, fill in your MySQL credentials and Gemini API key
4. `npm start`
5. Go to `http://localhost:5000`

## Things I'd still like to add

- Letting users delete a dataset from the UI instead of MySQL directly
- Basic login, so different people's uploads don't all mix together
- Live progress updates instead of a single "thinking..." state

