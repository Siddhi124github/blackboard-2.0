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

// ========= DEBUGGING =========
console.log('=== SERVER STARTUP DEBUG ===');
console.log('Current directory:', __dirname);
console.log('PORT:', PORT);

// Check if .env file exists
try {
    if (fs.existsSync(path.join(__dirname, '.env'))) {
        console.log('.env file exists in:', __dirname);
    } else {
        console.log('.env file NOT found in:', __dirname);
    }
} catch (err) {
    console.log('Error checking .env file:', err.message);
}

// Check environment variables
console.log('OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);
if (process.env.OPENROUTER_API_KEY) {
    console.log('API Key length:', process.env.OPENROUTER_API_KEY.length);
    console.log('API Key starts with:', process.env.OPENROUTER_API_KEY.substring(0, 10) + '...');
    console.log('API Key format valid:', process.env.OPENROUTER_API_KEY.startsWith('sk-or-'));
} else {
    console.log('WARNING: OPENROUTER_API_KEY is not set in environment!');
    console.log('Available env vars:', Object.keys(process.env).filter(key => !key.includes('PASS')).join(', '));
}
console.log('=== END DEBUG ===\n');

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

    console.log('\n=== GENERATE REQUEST ===');
    console.log('Model:', model);
    console.log('Question type:', qtype);
    console.log('Number:', number);

    // Double-check API key
    const apiKey = process.env.OPENROUTER_API_KEY;
    
    if (!apiKey) {
        console.error('ERROR: OPENROUTER_API_KEY not found in environment');
        return res.status(500).json({ 
            error: "OpenRouter API key not configured. Please check server logs." 
        });
    }

    console.log('API Key being used (first 10 chars):', apiKey.substring(0, 10) + '...');

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
        console.log('Calling OpenRouter API...');
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": `http://localhost:${PORT}`,
                "X-Title": "Question Bank App"
            },
            body: JSON.stringify({
                model: model || "openai/gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        console.log('OpenRouter Response Status:', response.status);
        console.log('OpenRouter Response Headers:', JSON.stringify(response.headers.raw()));

        const data = await response.json();
        console.log('OpenRouter Response Data:', JSON.stringify(data, null, 2).substring(0, 500) + '...');

        if (!response.ok) {
            console.error('OpenRouter API error:', data);
            return res.status(response.status).json({ 
                error: `OpenRouter API error: ${data.error?.message || 'Unknown error'}`,
                details: data
            });
        }

        // Parse the content
        let output;
        try {
            const content = data.choices[0].message.content;
            console.log('Raw AI response:', content.substring(0, 200) + '...');
            
            // Try to extract JSON
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                            content.match(/```\n([\s\S]*?)\n```/) ||
                            [null, content];
            const jsonString = jsonMatch[1] || content;
            output = JSON.parse(jsonString);
            console.log('Successfully parsed', output.length, 'questions');
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            return res.status(500).json({ error: "Failed to parse AI response as JSON" });
        }
        
        res.json({ questions: output });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: "AI generation failed: " + err.message });
    }
});

// Test endpoint to verify API key
app.get('/test-api-key', (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    res.json({
        hasApiKey: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none',
        isValidFormat: apiKey ? apiKey.startsWith('sk-or-') : false,
        envVars: Object.keys(process.env).filter(key => !key.includes('PASS')).slice(0, 10)
    });
});

// Home route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ Test API key at: http://localhost:${PORT}/test-api-key`);
});
