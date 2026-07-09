# Clarivue — AI Data Analytics Copilot

Clarivue lets you upload your data (Excel/CSV) and ask questions about it in plain English. It turns your questions into SQL, runs them safely against your data, and gives you a clear answer — plus a chart and table.

## Features
- Upload Excel/CSV files → automatically creates a database table
- Ask questions in plain English, get real answers (no SQL knowledge needed)
- Follow-up questions understand context (e.g., "now show the lowest instead")
- Automatic charts and tables for every answer
- Root cause analysis for "why" questions
- Full question history, with the ability to clear it
- Read-only database access — your data can never be accidentally changed or deleted

## Tech Stack
- **Backend:** Node.js, Express, MySQL
- **AI:** Google Gemini
- **Frontend:** HTML, Tailwind CSS, Chart.js

## Getting Started

1. Clone this repo
2. Run `npm install`
3. Create a `.env` file (see `.env.example`) with your MySQL credentials and Gemini API key
4. Run `npm start`
5. Open `http://localhost:5000` in your browser

## Screenshots
(Add screenshots here later)