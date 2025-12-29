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

IMPORTANT FORMATTING RULES:
- Use PLAIN TEXT ONLY (no Markdown formatting)
- Do NOT use hashtags (#), asterisks (**), underscores (_), or other Markdown symbols
- Use simple section headings followed by colons (e.g., "What we discussed today:")
- Write in clear prose paragraphs
- Do NOT include any preamble like "Here's your summary:"
- Start directly with the patient summary content

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

IMPORTANT FORMATTING RULES:
- Use PLAIN TEXT ONLY (no Markdown formatting)
- Do NOT use hashtags (#), asterisks (**), underscores (_), or other Markdown symbols
- Write in prose paragraphs with proper punctuation
- Do NOT include any preamble like "Here's the referral letter:"
- Start directly with the body of the referral letter

Clinical Summary:

${transcript}`;
        } else {
            // Clinical summary prompt
            userPrompt = `Please provide a CONCISE summary of the following GP consultation transcript. Structure your response with these sections:

PRESENTING COMPLAINTS: Brief statement only (e.g., "1. Chest pain 2. Skin rash"). One line per complaint.

HISTORY OF PRESENTING COMPLAINT: Write BRIEF, factual paragraphs. For each complaint:
- Key symptoms and duration only
- Relevant positives/negatives
- Treatments tried
- NO repetition, NO unnecessary detail, NO conversational filler
- 2-4 sentences maximum per complaint

PAST MEDICAL HISTORY: List only (e.g., "1. Type 2 diabetes (2015) 2. Hypertension"). No explanations.

DRUG HISTORY: List medications with doses only. No commentary.

ALLERGIES: List only. If none mentioned, write "None documented".

SOCIAL HISTORY: Brief bullet points or short sentences. Include ONLY if relevant to presenting complaint:
- Smoking/alcohol if applicable
- Living situation if relevant to care
- Mobility/functional status if relevant
- OMIT generic social chat and irrelevant details

EXAMINATION FINDINGS: List vital signs and findings only. No prose.

IMPRESSION: 1-2 sentences maximum. State diagnosis/assessment only.

MANAGEMENT PLAN: Numbered list. Each item should be ONE concise line:
1. Prescriptions (drug, dose, duration)
2. Investigations ordered
3. Follow-up timeframe
4. Safety-netting (one line)

CRITICAL RULES FOR CONCISENESS:
- Use medical shorthand where appropriate (BP, HR, SOB, PND, etc.)
- NEVER repeat information already stated in other sections
- OMIT irrelevant social conversation (birthdays, grandchildren, etc. unless medically relevant)
- Focus ONLY on clinically relevant information
- Use short, direct sentences
- Remove all unnecessary adjectives and adverbs
- NO phrases like "the patient reports", "she mentions", "she describes" - just state facts
- Maximum 150 words for History of Presenting Complaint section
- Management plan items should be 5-10 words each

IMPORTANT FORMATTING RULES:
- Use PLAIN TEXT ONLY (no Markdown formatting)
- Do NOT use hashtags (#), asterisks (**), underscores (_), or other Markdown symbols
- Use CAPITAL LETTERS for section headings (e.g., "PRESENTING COMPLAINTS")
- Use simple numbered lists where appropriate (e.g., "1. ", "2. ")
- Use colons (:) for subheadings
- Do NOT include any preamble like "Here's the summary:" or "Let me know if you'd like modifications"
- Start directly with "PRESENTING COMPLAINTS" as the first line

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
                model: 'deepseek/deepseek-chat',
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
        let summary = data.choices[0].message.content;
        
        // Clean up any Markdown formatting that slipped through
        summary = summary
            // Remove Markdown headers (### Header)
            .replace(/^#{1,6}\s+/gm, '')
            // Remove bold (**text** or __text__)
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/__(.+?)__/g, '$1')
            // Remove italic (*text* or _text_)
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/_(.+?)_/g, '$1')
            // Remove horizontal rules (---, ___, ***)
            .replace(/^[\-_\*]{3,}$/gm, '')
            // Remove any preambles
            .replace(/^Here'?s? (the|a) .+?:?\s*/i, '')
            .replace(/^Let me know if .+$/mi, '')
            // Clean up extra blank lines (more than 2 consecutive)
            .replace(/\n{3,}/g, '\n\n')
            // Trim whitespace
            .trim();

        return res.status(200).json({ summary });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
