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
1. Convert the raw dictation transcript into a properly formatted professional letter
2. Remove all dictation commands (e.g., "full stop", "comma", "new paragraph", "delete that")
3. Add proper punctuation where indicated by voice commands
4. Use British English spelling and conventions
5. Format the letter professionally with appropriate structure
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
- Output ONLY the formatted letter text
- Use British English spelling (e.g., "summarise" not "summarize", "centre" not "center")
- Do NOT include any preamble, explanation, or meta-commentary
- Do NOT wrap the letter in markdown code blocks
- Maintain professional medical tone
- Preserve all medical terminology and abbreviations exactly as dictated
- Add appropriate spacing between sections
- Use proper letter structure with clear paragraphs`;

        const userPrompt = `Please format this dictated letter transcript into a professional letter:

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
                model: 'deepseek/deepseek-chat', // Fast and good at following instructions
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
                temperature: 0.3, // Lower temperature for more consistent formatting
                max_tokens: 2000
            })
        });

        console.log('OpenRouter response status:', response.status);
        console.log('OpenRouter response headers:', {
            'content-type': response.headers.get('content-type'),
            'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining')
        });

        if (!response.ok) {
            let errorText;
            try {
                const errorData = await response.json();
                errorText = JSON.stringify(errorData);
                console.error('OpenRouter JSON error:', errorData);
            } catch (e) {
                errorText = await response.text();
                console.error('OpenRouter text error:', errorText);
            }
            return res.status(response.status).json({ 
                error: `AI formatting failed (${response.status}): ${errorText.substring(0, 200)}` 
            });
        }

        const data = await response.json();
        console.log('OpenRouter response received successfully');
        console.log('Response structure:', {
            hasChoices: !!data.choices,
            choicesLength: data.choices?.length,
            hasMessage: !!data.choices?.[0]?.message,
            hasContent: !!data.choices?.[0]?.message?.content
        });

        // Extract formatted letter
        const letter = data.choices?.[0]?.message?.content;

        if (!letter || letter.trim() === '') {
            console.error('Empty letter received from AI');
            return res.status(500).json({ 
                error: 'AI returned empty response' 
            });
        }

        console.log('Letter formatted successfully');
        console.log('Letter length:', letter.length, 'characters');

        return res.status(200).json({ letter });

    } catch (error) {
        console.error('Letter formatting error:', error);
        return res.status(500).json({ 
            error: error.message || 'Failed to format letter' 
        });
    }
}

// Get letter-specific formatting instructions
function getLetterInstructions(letterType) {
    switch (letterType) {
        case 'referral':
            return `LETTER TYPE: Medical Referral Letter

STRUCTURE:
1. Date (today's date in UK format: DD Month YYYY)
2. Recipient details (if provided)
3. "Dear Dr [Name]" or "Dear Colleague"
4. Re: Patient details (if mentioned)
5. Opening line: "Thank you for seeing this patient..."
6. Presenting complaint
7. Relevant history
8. Examination findings (if mentioned)
9. Investigations (if mentioned)
10. Current management
11. Reason for referral / Question being asked
12. Closing: "Thank you for your help with this patient's care"
13. Sign-off: "Yours sincerely" (if named) or "Yours faithfully" (if Dear Colleague)
14. [Doctor's name and credentials to be added]

Include NHS number, date of birth if mentioned.`;

        case 'sick-note':
            return `LETTER TYPE: Sick Note / Fit Note

STRUCTURE:
1. Date (today's date)
2. "To Whom It May Concern"
3. Re: [Patient Name]
4. Statement of unfitness for work
5. Period of absence
6. Medical reason (keep general, preserve confidentiality)
7. Any recommendations (e.g., phased return, adjustments)
8. Sign-off: "Yours faithfully"
9. [Doctor's name and credentials to be added]

Keep brief and professional. Avoid excessive medical details.`;

        case 'to-whom':
            return `LETTER TYPE: To Whom It May Concern

STRUCTURE:
1. Date (today's date)
2. "To Whom It May Concern"
3. Re: [Patient Name] (if mentioned)
4. Clear statement of purpose
5. Relevant supporting information
6. Conclusion
7. Sign-off: "Yours faithfully"
8. [Doctor's name and credentials to be added]

Formal and concise.`;

        case 'patient':
            return `LETTER TYPE: Letter to Patient

STRUCTURE:
1. Date (today's date)
2. "Dear [Patient Name]"
3. Friendly opening
4. Explanation in plain English (avoid medical jargon)
5. Clear action points or recommendations
6. Invitation to contact if questions
7. Closing: "Kind regards" or "Best wishes"
8. [Doctor's name and credentials to be added]

Use simple, clear language. Explain medical terms.`;

        case 'general':
        default:
            return `LETTER TYPE: General Correspondence

STRUCTURE:
1. Date (today's date)
2. Recipient address/name (if provided)
3. Appropriate greeting ("Dear [Name]" or "Dear Sir/Madam")
4. Clear subject line (if mentioned)
5. Introduction
6. Main content in logical paragraphs
7. Conclusion
8. Appropriate sign-off:
   - "Yours sincerely" if named recipient
   - "Yours faithfully" if unnamed
   - "Kind regards" for less formal
9. [Name and credentials to be added]

Professional business letter format.`;
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};
