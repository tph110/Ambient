// This is a serverless function for Vercel to securely handle API requests
// Place this in /api/summarize.js in your project

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { transcript } = req.body;

        if (!transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }

        // Get API key from environment variable
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // Call OpenRouter API
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.referer || 'https://yourdomain.vercel.app',
                'X-Title': 'AmbientDoc'
            },
            body: JSON.stringify({
                model: 'anthropic/claude-3.5-sonnet',
                messages: [
                    {
                        role: 'user',
                        content: `Please provide a detailed summary of the following GP consultation transcript. Structure your response with these sections:

HISTORY OF PRESENTING COMPLAINT: Write this as detailed prose paragraphs describing the patient's symptoms, their timeline, severity, aggravating/relieving factors, associated symptoms, and any treatments tried. Include the patient's own words and descriptions where relevant.

PAST MEDICAL HISTORY: List relevant conditions with dates if mentioned.

DRUG HISTORY: List current medications with doses.

ALLERGIES: List any allergies and reactions.

SOCIAL HISTORY: Include occupation, smoking status (pack-years if mentioned), alcohol consumption (units per week if mentioned), recreational drug use, living situation (alone/with family, house/flat/bungalow), mobility aids (walking stick, zimmer frame, wheelchair), home adaptations (stairlift, grab rails, wet room), care arrangements (carers, frequency of visits), support network, and any other relevant social factors affecting health.

EXAMINATION FINDINGS: Detail vital signs and examination findings.

IMPRESSION: Clinical assessment and diagnosis.

MANAGEMENT PLAN: Numbered list of actions including prescriptions, follow-up arrangements, and safety-netting advice.

Transcript:\n\n${transcript}`
                    }
                ],
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const data = await response.json();
        const summary = data.choices[0].message.content;

        return res.status(200).json({ summary });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
