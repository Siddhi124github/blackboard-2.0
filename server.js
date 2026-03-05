require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

/* Serve all static files (HTML, CSS, JS) */
app.use(express.static(__dirname));

/* Home route */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

/* ========= HELPER FILE READ ========= */
function readJSON(file) {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ========= GENERATE QUESTIONS ========= */
app.post('/generate', async (req, res) => {
    const { content, qtype, number, model } = req.body;

    const prompt = `
Generate ${number} ${qtype} questions from the following text.

Return strictly valid JSON:
[
 {
  "type": "mcq",
  "question": "",
  "options": ["A","B","C","D"],
  "correct": 0,
  "difficulty": "easy|medium|hard",
  "explanation": "Explain why correct answer is correct"
 }
]

Text:
${content}
`;

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }]
            })
        });

        const data = await response.json();
        const output = JSON.parse(data.choices[0].message.content);

        res.json({ questions: output });

    } catch (err) {
        res.status(500).json({ error: "AI generation failed" });
    }
});

/* ========= SAVE RATING ========= */
app.post('/rate', (req, res) => {
    const ratings = readJSON('ratings.json');
    ratings.push({ ...req.body, date: new Date() });
    writeJSON('ratings.json', ratings);
    res.json({ message: "Rating saved" });
});

/* ========= SAVE ANALYTICS ========= */
app.post('/analytics', (req, res) => {
    const analytics = readJSON('analytics.json');
    analytics.push({ ...req.body, date: new Date() });
    writeJSON('analytics.json', analytics);
    res.json({ message: "Analytics saved" });
});

/* ========= GET ANALYTICS ========= */
app.get('/analytics-data', (req, res) => {
    const analytics = readJSON('analytics.json');
    res.json(analytics);
});

/* ========= START SERVER ========= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
