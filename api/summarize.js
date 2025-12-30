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
            userPrompt = `Please provide a detailed summary of the following GP consultation transcript. Structure your response with these sections:

PRESENTING COMPLAINTS: If the patient presents with multiple unrelated complaints, list them clearly (e.g., "1. Chest pain 2. Skin rash 3. Medication review"). If there is only one complaint, simply state it.

HISTORY OF PRESENTING COMPLAINT: Write detailed prose paragraphs for each presenting complaint in FIRST-PERSON perspective (as if you are the GP writing the notes). If there are multiple unrelated complaints, use clear subheadings (e.g., "Chest pain:", "Skin rash:", "Medication review:"). For each complaint, describe the patient's symptoms, timeline, severity, aggravating/relieving factors, associated symptoms, and any treatments tried.

IMPORTANT WRITING STYLE FOR HISTORY:
- Write in FIRST-PERSON from the GP's perspective (e.g., "I saw Mr Smith today regarding...", "The patient informed me that...", "On taking the history, I noted that...")
- Use PROFESSIONAL MEDICAL TERMINOLOGY throughout
- DO NOT include direct quotes from the patient (e.g., avoid "the patient said 'I feel terrible'" - instead write "the patient described feeling unwell")
- DO NOT use colloquial or informal language (e.g., avoid "quite a time", "lots", "really bad" - use "several weeks", "frequent", "severe")
- Maintain a formal, professional clinical tone suitable for medical records
- Write as concise clinical documentation, not conversational narrative

PAST MEDICAL HISTORY: List relevant conditions with dates if mentioned.

DRUG HISTORY: List current medications with doses.

ALLERGIES: List any allergies and reactions.

SOCIAL HISTORY: Include occupation, smoking status (pack-years if mentioned), alcohol consumption (units per week if mentioned), recreational drug use, living situation (alone/with family, house/flat/bungalow), mobility aids (walking stick, zimmer frame, wheelchair), home adaptations (stairlift, grab rails, wet room), care arrangements (carers, frequency of visits), support network, and any other relevant social factors affecting health.

EXAMINATION FINDINGS: Detail vital signs and examination findings for each complaint where relevant. Write in first-person (e.g., "On examination, I found...", "I auscultated clear lung fields bilaterally").

IMPRESSION: Clinical assessment and diagnosis for each complaint. Write in first-person (e.g., "I assess this as...", "My clinical impression is...").

MANAGEMENT PLAN: Numbered list of actions including prescriptions, follow-up arrangements, and safety-netting advice. Write in first-person (e.g., "I have prescribed...", "I have arranged...", "I advised the patient to..."). Clearly indicate which actions relate to which complaint if there are multiple issues.

QOF AND IIF OPPORTUNITIES: Identify any relevant Quality and Outcomes Framework (QOF) or Investment and Impact Fund (IIF) indicators that could be addressed or coded from this consultation. Include:
- QOF indicators that have been completed (e.g., diabetes HbA1c recorded, blood pressure checks, medication reviews)
- IIF opportunities (e.g., early cancer diagnosis codes, health inequalities, prevention activities)
- Specific Read codes or SNOMED codes where applicable
- Annual reviews or health checks that may be due
- Vaccinations or screening that could be offered
- Lifestyle interventions that qualify for IIF points
Only include opportunities that are genuinely relevant to this consultation. If none apply, write "No specific QOF/IIF opportunities identified in this consultation."

CRITICAL RULE FOR EMPTY SECTIONS:
If NO information is available for a section (e.g., SOCIAL HISTORY, ALLERGIES, EXAMINATION FINDINGS), COMPLETELY OMIT that section including its heading. Do NOT write "None documented", "Not mentioned", "No details provided", or any placeholder text. Simply skip to the next section that has actual content.

Example - if no social history mentioned:
WRONG: "SOCIAL HISTORY: Not mentioned" or "SOCIAL HISTORY: No details provided"
CORRECT: Skip the entire SOCIAL HISTORY section and heading completely

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
