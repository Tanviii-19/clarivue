require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');

const app = express();
app.use(express.static('public'));
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true); 
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed.'));
    }
  }
});
// Helper function
function getTableColumns(tableName, callback) {
  const query = `SHOW COLUMNS FROM \`${tableName}\``;
  db.query(query, (err, results) => {
    if (err) {
      return callback(err, null);
    }
    const columns = results.map(row => row.Field).filter(col => col !== 'id');
    callback(null, columns);
  });
}
let conversationHistory = [];
// only allow SELECT queries, block anything that changes data
function isSafeQuery(sql) {
  const cleaned = sql.trim().toUpperCase();
  const dangerousKeywords = ['DELETE', 'DROP', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'CREATE', 'RENAME', 'REPLACE'];
  const startsWithSelect = cleaned.startsWith('SELECT');
  const containsDangerousWord = dangerousKeywords.some(word => cleaned.includes(word));
  return startsWithSelect && !containsDangerousWord;
}


function needsRootCauseAnalysis(question) {
  const lowerQ = question.toLowerCase();
  const triggerWords = ['why', 'reason', 'root cause', 'caused', 'cause of', 'what led to', 'drivers of', 'explain the drop', 'explain the increase'];
  return triggerWords.some(word => lowerQ.includes(word));
}
// If a result has too many rows, keep only the top 5 and bottom 5 (saves tokens on large datasets)
function summarizeIfLarge(rows) {
  if (!Array.isArray(rows) || rows.length <= 10) return rows;
  const top5 = rows.slice(0, 5);
  const bottom5 = rows.slice(-5);
  return { note: `Showing top 5 and bottom 5 of ${rows.length} total results`, top5, bottom5 };
}
// Simple stage tracker
function createStageTracker() {
  const stages = [];
  return {
    add: (stageName) => stages.push(stageName),
    getAll: () => stages
  };
}


async function runRootCauseAnalysis(model, targetTable, columns, userQuestion, callback) {
  const angles = [
    `SELECT region, SUM(amount) as total FROM ${targetTable} GROUP BY region ORDER BY total DESC`,
    `SELECT product_name, SUM(amount) as total FROM ${targetTable} GROUP BY product_name ORDER BY total DESC`,
    `SELECT sale_date, SUM(amount) as total FROM ${targetTable} GROUP BY sale_date ORDER BY sale_date`
  ];

  const results = [];
  let completed = 0;

  angles.forEach((sql, index) => {
    db.query(sql, (err, rows) => {
      results[index] = err ? { error: err.message } : rows;
      completed++;

      if (completed === angles.length) {
        // Summarize any large results before sending to Gemini (saves tokens/cost)
        const summarizedRegion = summarizeIfLarge(results[0]);
        const summarizedProduct = summarizeIfLarge(results[1]);
        const summarizedDate = summarizeIfLarge(results[2]);

        
        const analysisPrompt = `You are a senior business analyst investigating this question: "${userQuestion}"

Here is data broken down by different angles (large datasets have been summarized to top/bottom 5 to save space):

By Region: ${JSON.stringify(summarizedRegion)}
By Product: ${JSON.stringify(summarizedProduct)}
By Date: ${JSON.stringify(summarizedDate)}

Based on this data, explain the most likely root cause(s) in 3-4 short sentences, in simple business language. Mention the biggest contributing factor(s) clearly. If the data is insufficient to be certain, say so honestly instead of guessing.`;
        model.generateContent(analysisPrompt).then(result => {
          const explanation = result.response.text().trim();
          callback(null, { explanation, breakdown: { byRegion: results[0], byProduct: results[1], byDate: results[2] } });
        }).catch(err => callback(err, null));
      }
    });
  });
}
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    ca: fs.readFileSync('./ca.pem')
  }
});


db.connect((err) => {
  if (err) {
    console.error(' Database connection failed:', err.message);
    return;
  }
  console.log(' Successfully connected to MySQL database!');
});

// Serve the Home page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/home/index.html');
});

// Serve the Chat page
app.get('/chat', (req, res) => {
  res.sendFile(__dirname + '/public/chat/index.html');
});

// Serve the History page
app.get('/history-page', (req, res) => {
  res.sendFile(__dirname + '/public/history-page/index.html');
});

app.use(express.json());

app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please attach a file.' });
    }
    

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'The uploaded file appears to be empty.' });
    }

    const columnNames = Object.keys(data[0]);

   
    const rawName = req.file.originalname.replace(/\.[^/.]+$/, ''); 
    const tableName = 'uploaded_' + rawName.toLowerCase().replace(/[^a-z0-9]/g, '_');

 
    const columnDefs = columnNames.map(col => {
      const safeCol = col.toLowerCase().replace(/[^a-z0-9]/g, '_');
      return `\`${safeCol}\` TEXT`;
    }).join(', ');

    const createTableSQL = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (id INT AUTO_INCREMENT PRIMARY KEY, ${columnDefs})`;

    db.query(createTableSQL, (createErr) => {
      if (createErr) {
        return res.status(500).json({ error: 'Failed to create table', details: createErr.message });
      }
      db.query(`TRUNCATE TABLE \`${tableName}\``, (truncateErr) => {
        if (truncateErr) {
          return res.status(500).json({ error: 'Failed to clear old data before re-upload', details: truncateErr.message });
        }

      
      const safeColumns = columnNames.map(col => col.toLowerCase().replace(/[^a-z0-9]/g, '_'));
      const columnList = safeColumns.map(col => `\`${col}\``).join(', ');
      const placeholders = safeColumns.map(() => '?').join(', ');
      const insertSQL = `INSERT INTO \`${tableName}\` (${columnList}) VALUES (${placeholders})`;

      
      let insertedCount = 0;
      let hasError = false;

      data.forEach((row, index) => {
        const values = columnNames.map(col => row[col] !== undefined ? row[col] : null);

        db.query(insertSQL, values, (insertErr) => {
          if (insertErr && !hasError) {
            hasError = true;
            return res.status(500).json({ error: 'Failed to insert data', details: insertErr.message });
          }

          insertedCount++;

         
          
          if (insertedCount === data.length && !hasError) {
           
            fs.unlink(req.file.path, (unlinkErr) => {
              if (unlinkErr) console.error('Could not delete temp file:', unlinkErr.message);
            });

            res.json({
              message: 'File uploaded, table created, and data inserted successfully!',
              tableName: tableName,
              sheetName: sheetName,
              totalRowsInserted: insertedCount,
              columns: columnNames
            });
          }
        });
      });
    });
    });

 } catch (error) {
    res.status(500).json({ error: 'Failed to read the uploaded file', details: error.message });
  }
  });
});
//added a new route to handle the question and generate SQL query
app.post('/ask', async (req, res) => {
  const userQuestion = req.body.question;
  const targetTable = req.body.table || 'sales';

  if (!userQuestion) {
    return res.status(400).json({ error: 'Please provide a question.' });
  }

  getTableColumns(targetTable, async (colErr, columns) => {
    if (colErr) {
      return res.status(400).json({ error: `Table "${targetTable}" not found or unreadable.`, details: colErr.message });
    }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const stages = createStageTracker();
    stages.add('Understanding question');
    // If this is a "why" question, run root cause analysis instead of a normal query
    if (needsRootCauseAnalysis(userQuestion)) {
      stages.add('Finding root causes');
    }
    if (needsRootCauseAnalysis(userQuestion)) {
      return runRootCauseAnalysis(model, targetTable, columns, userQuestion, (rcaErr, rcaResult) => {
        if (rcaErr) {
          return res.status(500).json({ error: 'Root cause analysis failed', details: rcaErr.message });
        }
        res.json({
          question: userQuestion,
          type: 'root_cause_analysis',
          explanation: rcaResult.explanation,
          breakdown: rcaResult.breakdown,
          stages: stages.getAll()
        });
      });
    }
stages.add('Generating SQL');
    const historyText = conversationHistory
      .map((item, i) => `Previous Question ${i + 1}: ${item.question}\nPrevious SQL ${i + 1}: ${item.sql}`)
      .join('\n\n');

    const prompt = `You are a MySQL expert. The table is called "${targetTable}" with columns: ${columns.join(', ')}.

${historyText ? 'Here is the recent conversation for context:\n' + historyText + '\n\n' : ''}Convert this NEW question into ONE valid MySQL SQL query only.

IMPORTANT RULE: If the new question is a short follow-up (like "now show the lowest", "sort descending", "only Electronics"), assume it refers to the EXACT SAME subject/grouping as the most recent previous question, unless the new question clearly mentions a different subject. For example, if the previous question was about "region", and the new question says "show the lowest instead", it means the lowest by region, not the lowest single value.

Do not explain anything, just return the raw SQL query with no markdown formatting, no backticks.

New Question: ${userQuestion}`;

    const result = await model.generateContent(prompt);
    const generatedSQL = result.response.text().trim();
    console.log('Generated SQL:', generatedSQL);

    // Safety check: block the query if it's not a safe read-only SELECT
    if (!isSafeQuery(generatedSQL)) {
      return res.status(403).json({
        error: 'This question would require changing or deleting data, which is not allowed. Please ask a question that only reads or analyzes data.',
        blocked_sql: generatedSQL
      });
    }
    stages.add('Executing query...');

    db.query(generatedSQL, async (err, results) => {
      if (err) {
        // First attempt failed - asking Gemini to fix its own mistake
        console.log('First SQL attempt failed, asking Gemini to fix it...');

        const fixPrompt = `The following MySQL query failed:
${generatedSQL}

Error message: ${err.message}

The table is called "sales" with columns: id, product_name, region, amount, sale_date.
Fix the query and return ONLY the corrected raw SQL query, no explanation, no markdown formatting, no backticks.`;

        try {
          const fixResult = await model.generateContent(fixPrompt);
          const fixedSQL = fixResult.response.text().trim();
          console.log('Corrected SQL:', fixedSQL);

          db.query(fixedSQL, (err2, results2) => {
            if (err2) {
              return res.status(500).json({
                error: 'SQL execution failed even after automatic fix attempt',
                details: err2.message,
                original_sql: generatedSQL,
                attempted_fix: fixedSQL
              });
            }

            return res.json({
              question: userQuestion,
              sql: fixedSQL,
              result: results2,
              note: 'The first attempt had an error, but it was automatically corrected.'
            });
          });
        } catch (fixError) {
          return res.status(500).json({ error: 'Automatic fix attempt failed', details: fixError.message });
        }
        return;
      }

    conversationHistory.push({ question: userQuestion, sql: generatedSQL });
      if (conversationHistory.length > 5) conversationHistory.shift(); // keep only last 5

      
      // Summarize large results before sending to Gemini (saves tokens/cost on big datasets)
      const summarizedResults = summarizeIfLarge(results);

      // Asking Gemini to explain the result in plain English
      const explainPrompt = `You are a friendly business analyst. A user asked: "${userQuestion}"
The database returned this result: ${JSON.stringify(summarizedResults)}

Explain this result in 1-2 short, simple sentences a non-technical business person would understand. Do not mention SQL or databases. Just explain what the data means.`;
stages.add('Generating insights');
      const explainResult = await model.generateContent(explainPrompt);
      const explanation = explainResult.response.text().trim();

      db.query(
        'INSERT INTO question_history (table_name, question, sql_query, explanation) VALUES (?, ?, ?, ?)',
        [targetTable, userQuestion, generatedSQL, explanation],
        (histErr) => { if (histErr) console.error('Could not save to history:', histErr.message); }
      );
     res.json({
        question: userQuestion,
        sql: generatedSQL,
        result: results,
        explanation: explanation,
        stages: stages.getAll()
      });

    });

 } catch (error) {
    res.status(500).json({ error: 'AI request failed', details: error.message });
  }
  });
});
// Route to fetch all saved question history
app.get('/history', (req, res) => {
  db.query('SELECT * FROM question_history ORDER BY asked_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch history', details: err.message });
    }
    res.json({ history: rows });
  });
});

// Route to clear all saved question history
app.delete('/history', (req, res) => {
  db.query('DELETE FROM question_history', (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to clear history', details: err.message });
    }
    res.json({ message: 'History cleared successfully.' });
  });
});
// Route to list all real datasets (tables) available to ask questions about
app.get('/datasets', (req, res) => {
  db.query("SHOW TABLES", (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to list datasets', details: err.message });
    }
    // Extract table names & hide internal system tables from the user
    const hiddenTables = ['question_history'];
    const tableKey = Object.keys(results[0] || {})[0];
    const tables = results
      .map(row => row[tableKey])
      .filter(name => !hiddenTables.includes(name));

    res.json({ datasets: tables });
  });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});