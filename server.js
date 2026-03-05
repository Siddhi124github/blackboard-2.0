require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

/* ========= HELPER FILE READ ========= */
function readJSON(file) {
    try {
        if (!fs.existsSync(file)) return [];
        return JSON.parse(fs.readFileSync(file));
    } catch (err) {
        console.error(`Error reading ${file}:`, err);
        return [];
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`Error writing ${file}:`, err);
    }
}

/* ========= GENERATE QUESTIONS ========= */
app.post('/generate', async (req, res) => {
    const { content, qtype, number, model } = req.body;

    // Check if API key exists in environment
    if (!process.env.OPENROUTER_API_KEY) {
        console.error('OPENROUTER_API_KEY not found in environment');
        return res.status(500).json({ 
            error: "OpenRouter API key not found. Please check your environment variables on Render." 
        });
    }

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
        console.log('Calling OpenRouter API with model:', model);
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": `https://${req.get('host')}`, // Use the actual host
                "X-Title": "Question Bank App"
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        const data = await response.json();
        
        // Check if response is not OK
        if (!response.ok) {
            console.error('OpenRouter API error:', data);
            return res.status(response.status).json({ 
                error: `OpenRouter API error: ${data.error?.message || 'Unknown error'}` 
            });
        }

        // Check if we have valid response structure
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('Invalid OpenRouter response structure:', data);
            return res.status(500).json({ error: "Invalid response from OpenRouter" });
        }

        // Parse the content from the AI response
        let output;
        try {
            const content = data.choices[0].message.content;
            // Try to extract JSON if it's wrapped in markdown code blocks
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                            content.match(/```\n([\s\S]*?)\n```/) ||
                            [null, content];
            const jsonString = jsonMatch[1] || content;
            output = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('Error parsing AI response:', data.choices[0].message.content);
            return res.status(500).json({ error: "Failed to parse AI response as JSON" });
        }
        
        res.json({ questions: output });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: "AI generation failed: " + err.message });
    }
});

/* ========= SAVE RATING ========= */
app.post('/rate', (req, res) => {
    try {
        const ratings = readJSON('ratings.json');
        ratings.push({ ...req.body, date: new Date().toISOString() });
        writeJSON('ratings.json', ratings);
        res.json({ message: "Rating saved" });
    } catch (err) {
        console.error('Error saving rating:', err);
        res.status(500).json({ error: "Failed to save rating" });
    }
});

/* ========= SAVE ANALYTICS ========= */
app.post('/analytics', (req, res) => {
    try {
        const analytics = readJSON('analytics.json');
        analytics.push({ ...req.body, date: new Date().toISOString() });
        writeJSON('analytics.json', analytics);
        res.json({ message: "Analytics saved" });
    } catch (err) {
        console.error('Error saving analytics:', err);
        res.status(500).json({ error: "Failed to save analytics" });
    }
});

/* ========= GET ANALYTICS ========= */
app.get('/analytics-data', (req, res) => {
    try {
        const analytics = readJSON('analytics.json');
        res.json(analytics);
    } catch (err) {
        console.error('Error reading analytics:', err);
        res.status(500).json({ error: "Failed to read analytics" });
    }
});

/* ========= HEALTH CHECK ENDPOINT ========= */
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        apiKeyConfigured: !!process.env.OPENROUTER_API_KEY,
        timestamp: new Date().toISOString()
    });
});

// Home route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`API Key configured: ${process.env.OPENROUTER_API_KEY ? 'Yes' : 'No'}`);
});
