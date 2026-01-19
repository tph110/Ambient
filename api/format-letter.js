// File: /api/format-letter.js
// OpenRouter AI endpoint for formatting dictated letters

export default async function handler(req, res) {
    console.log('=== Format Letter API Called ===');
    console.log('Method:', req.method);
    
    if (req.method !== 'POST') {
        console.log('Error: Method not allowed');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { transcript, letterType } = req.body;
        console.log('Request body received');
        console.log('Letter type:', letterType);
        console.log('Transcript length:', transcript?.length || 0);

        if (!transcript || transcript.trim() === '') {
            console.log('Error: No transcript provided');
            return res.status(400).json({ error: 'Transcript is required' });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        
        if (!apiKey) {
            console.error('Error: OpenRouter API key not configured');
            return res.status(500).json({ error: 'OpenRouter API key not configured. Please add OPENROUTER_API_KEY to Vercel environment variables.' });
        }

        console.log('OpenRouter API key found');
        console.log('Formatting letter type:', letterType);

        // Build letter-specific instructions
        const letterInstructions = getLetterInstructions(letterType);

        // System prompt for letter formatting
        const systemPrompt = `You are an expert medical secretary specializing in formatting dictated letters for UK healthcare professionals.

YOUR TASK:
1. Convert the raw dictation transcript into a properly formatted professional document
2. Remove all dictation commands (e.g., "full stop", "comma", "new paragraph", "delete that")
3. Add proper punctuation where indicated by voice commands
4. Use British English spelling and conventions
5. Format the document professionally with appropriate structure
6. Correct any obvious transcription errors or grammatical mistakes
7. Maintain medical terminology exactly as dictated

FORMATTING RULES:
- "full stop" or "period" → Add a period (.)
- "comma" → Add a comma (,)
- "new paragraph" → Start a new paragraph
- "new line" → Add a line break
- "colon" → Add a colon (:)
- "semicolon" → Add a semicolon (;)
- "question mark" → Add a question mark (?)
- "exclamation mark" or "exclamation point" → Add an exclamation mark (!)
- "open bracket" / "close bracket" → Add brackets ()
- "hyphen" or "dash" → Add a hyphen (-)
- "delete that" / "scratch that" → Remove the previous sentence
- "yours sincerely" / "yours faithfully" / "kind regards" → Format as sign-off

${letterInstructions}

IMPORTANT:
- Output ONLY the formatted document text
- Use British English spelling (e.g., "summarise" not "summarize", "centre" not "center")
- Do NOT include any preamble, explanation, or meta-commentary
- Do NOT wrap the text in markdown code blocks or use markdown formatting symbols (like **)
- Maintain professional medical tone
- Preserve all medical terminology and abbreviations exactly as dictated
- Add appropriate spacing between sections
- Use proper structure with clear paragraphs
- For patient details or headers, use plain text format followed by a dashed underline where specified.`;

        const userPrompt = `Please format this dictated transcript into a professional document:

${transcript}`;

        console.log('Calling OpenRouter API...');
        console.log('Using model: deepseek/deepseek-chat');

        // Call OpenRouter API
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://ambientdoc.vercel.app',
                'X-Title': 'EchoDoc Letter Dictation'
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 3000
            })
        });

        if (!response.ok) {
            let errorText = await response.text();
            return res.status(response.status).json({ 
                error: `AI formatting failed (${response.status}): ${errorText.substring(0, 200)}` 
            });
        }

        const data = await response.json();
        const letter = data.choices?.[0]?.message?.content;

        if (!letter || letter.trim() === '') {
            return res.status(500).json({ error: 'AI returned empty response' });
        }

        return res.status(200).json({ letter });

    } catch (error) {
        console.error('Letter formatting error:', error);
        return res.status(500).json({ error: error.message || 'Failed to format letter' });
    }
}

// Get letter-specific formatting instructions
function getLetterInstructions(letterType) {
    switch (letterType) {
        case 'meeting-minutes':
            return `LETTER TYPE: Healthcare Meeting Minutes

CRITICAL FORMATTING RULES:
1. IDENTITY: Use ONLY initials for all names (e.g., "Dr J.S." or "M.P."), NEVER full names.
2. TITLES: Do NOT use markdown bolding (**). Use plain text followed by a dashed underline.
   Example:
   Meeting Details
   ---------------
3. LISTS: Use bullet points (•) for all content.
4. CONTENT: Be comprehensive and detailed. Capture specific data, statistics, and who said what (using initials).

STRUCTURE:
Meeting Details
---------------
• Date: [Extract from transcript]
• Attendees: [List with initials]
• Apologies: [List with initials]
• Chair: [Initials]

Agenda Items Discussed
----------------------
[For each item include:]
• [Topic Name]
  - [Initials]: [Detailed point/contribution]
  - [Initials]: [Response/concern]
  - Outcome: [Decision or agreement]
  - Rationale: [Why it was decided]

Action Items
------------
• [Task description]
  - Responsible: [Initials]
  - Due date: [Date or TBD]

Decisions Made
--------------
• [Decision with context]
  - Rationale: [Why]

Risks and Concerns
------------------
• [Risk description] - Raised by: [Initials]
  - Mitigation: [Plan]

Next Meeting
------------
• Date/Time/Agenda if mentioned.`;

        case 'referral':
            return `LETTER TYPE: Medical Referral Letter

STRUCTURE:
1. Date (UK format: DD Month YYYY)
2. Recipient details
3. Greeting
4. Patient details: Name, DoB (DD/MM/YYYY), NHS Number
5. Reason for referral (Plain text header)
6. Background (Plain text header)
7. Clinical narrative
8. Closing and Sign-off

RULES: Use plain text headers. British English.`;

        case 'sick-note':
            return `LETTER TYPE: Sick Note / Fit Note. Keep brief. Statement of unfitness, period of absence, and medical reason.`;

        case 'to-whom':
            return `LETTER TYPE: To Whom It May Concern. Formal and concise statement of purpose.`;

        case 'patient':
            return `LETTER TYPE: Letter to Patient. Use plain English, avoid jargon. Friendly but professional tone.`;

        case 'free-text':
            return `LETTER TYPE: Free Text. Clean up punctuation and grammar only. No letter structure.`;

        case 'general':
        default:
            return `LETTER TYPE: General Correspondence. Professional business letter format.`;
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};
