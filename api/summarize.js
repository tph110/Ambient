// This is a serverless function for Vercel to securely handle API requests
// Place this in /api/summarize.js in your project

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { transcript, isReferral, isPatientSummary } = req.body;

        if (!transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }

        // Get API key from environment variable
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // Choose prompt based on whether this is a referral letter, patient summary, or clinical summary
        let userPrompt;
        
        if (isPatientSummary) {
            // Patient-friendly summary prompt
            userPrompt = `Please create a patient-friendly summary based on this clinical summary. This will be given to the patient to take home.

Requirements:
- Use simple, everyday language (avoid medical jargon)
- Explain medical terms in plain English when they must be used
- Write in short, clear sentences
- Use a warm, reassuring tone
- Organise information in a way that's easy for patients to understand
- Include:
  * What we discussed today
  * What we found during the examination
  * What we think is causing your symptoms (diagnosis in simple terms)
  * What you need to do next (medications, lifestyle changes, follow-up)
  * When to seek urgent help (if relevant)
- Write in second person ("you", "your") to speak directly to the patient
- Keep it concise but complete
- Use British English spelling

Clinical Summary:

${transcript}`;
        } else if (isReferral) {
            // Referral letter prompt
            userPrompt = `Please write a referral letter from a GP to a secondary care specialist based on this clinical summary. 

Requirements:
- Write in professional medical letter format
- Use British English spelling and terminology throughout (e.g., "favour" not "favor", "organised" not "organized")
- Use prose paragraphs, avoid bullet points
- Include relevant clinical history, examination findings, and reason for referral
- Be concise but comprehensive
- Use appropriate medical terminology
- Body of the letter only (no "Dear Dr..." greeting or signature block needed)

Clinical Summary:

${transcript}`;
        } else {
            // Clinical summary prompt
            userPrompt = `Please provide a detailed summary of the following GP consultation transcript. Structure your response with these sections:

PRESENTING COMPLAINTS: If the patient presents with multiple unrelated complaints, list them clearly (e.g., "1. Chest pain 2. Skin rash 3. Medication review"). If there is only one complaint, simply state it.

HISTORY OF PRESENTING COMPLAINT: Write detailed prose paragraphs for each presenting complaint. If there are multiple unrelated complaints, use clear subheadings (e.g., "Chest pain:", "Skin rash:", "Medication review:"). For each complaint, describe the patient's symptoms, timeline, severity, aggravating/relieving factors, associated symptoms, and any treatments tried. Include the patient's own words and descriptions where relevant.

PAST MEDICAL HISTORY: List relevant conditions with dates if mentioned.

DRUG HISTORY: List current medications with doses.

ALLERGIES: List any allergies and reactions.

SOCIAL HISTORY: Include occupation, smoking status (pack-years if mentioned), alcohol consumption (units per week if mentioned), recreational drug use, living situation (alone/with family, house/flat/bungalow), mobility aids (walking stick, zimmer frame, wheelchair), home adaptations (stairlift, grab rails, wet room), care arrangements (carers, frequency of visits), support network, and any other relevant social factors affecting health.

EXAMINATION FINDINGS: Detail vital signs and examination findings for each complaint where relevant.

IMPRESSION: Clinical assessment and diagnosis for each complaint.

MANAGEMENT PLAN: Numbered list of actions including prescriptions, follow-up arrangements, and safety-netting advice. Clearly indicate which actions relate to which complaint if there are multiple issues.

Transcript:

${transcript}`;
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
                        content: userPrompt
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
