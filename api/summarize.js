// File: /api/summarize.js
// OpenRouter AI endpoint for generating clinical summaries

export default async function handler(req, res) {
    console.log('=== Summarize API Called ===');
    console.log('Method:', req.method);
    
    if (req.method !== 'POST') {
        console.log('Error: Method not allowed');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { transcript, type } = req.body;
        console.log('Request body received');
        console.log('Summary type:', type || 'clinical');
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

        // Determine which type of summary to generate
        let systemPrompt;
        let userPrompt;

        if (type === 'referral') {
            // Referral Letter
            systemPrompt = `You are an expert UK GP creating a referral letter to secondary care.

Extract key information from the consultation transcript and format it as a professional referral letter.

STRUCTURE:
1. Date: [Today's date in UK format]
2. Recipient: Dear Dr [Specialist Name] or Dear Colleague
3. Patient Details (plain text format):
   Name: [Title and full name]
   DoB: DD/MM/YYYY
   NHS Number: [if mentioned]
   Address: [if mentioned]
4. Blank line
5. Reason for referral: [Main presenting complaint/diagnosis]
6. Blank line
7. Background: [Relevant medical history, medications, allergies]
8. Blank line
9. Clinical details: [Detailed history, examination findings, investigations]
10. Blank line
11. Request: [What you're asking the specialist to do]
12. Closing: "Thank you for seeing this patient"
13. Yours sincerely / faithfully
14. [GP name and practice details]

Use British English spelling and medical terminology appropriate for UK secondary care.`;

            userPrompt = `Create a referral letter from this consultation:\n\n${transcript}`;

        } else if (type === 'patient') {
            // Patient Summary
            systemPrompt = `You are a UK GP creating a patient-friendly summary.

Convert the medical consultation into clear, simple language that a patient can understand.

GUIDELINES:
- Use plain English, avoid medical jargon
- Explain any medical terms you must use
- Be warm and reassuring in tone
- Use short paragraphs
- Include what was discussed, what was found, and what the plan is
- Format as a letter: "Dear [Patient Name]"

STRUCTURE:
1. Greeting
2. What we discussed today
3. What I found on examination (if relevant)
4. The diagnosis or working diagnosis
5. The treatment plan
6. What happens next
7. When to seek help / red flags
8. Closing with invitation to contact if questions`;

            userPrompt = `Create a patient-friendly summary from this consultation:\n\n${transcript}`;

        } else {
            // Clinical Summary (default)
            systemPrompt = `You are an expert UK GP creating structured clinical documentation for the medical record.

Convert the consultation transcript into a professional clinical summary suitable for the patient's medical notes.

IMPORTANT FORMATTING RULES:
- Use Title Case for section headings (e.g., "History of Presenting Complaint" NOT "HISTORY OF PRESENTING COMPLAINT")
- Use British English spelling throughout
- Be concise but comprehensive
- Include relevant clinical details
- Use appropriate medical terminology
- Format for direct copy-paste into EMIS/SystmOne

REQUIRED SECTIONS (in this order):
1. Presenting Complaint
2. History of Presenting Complaint
3. Past Medical History
4. Medications
5. Allergies
6. Social History (if relevant)
7. Examination Findings (if documented)
8. Assessment
9. Plan

SECTION FORMATTING:
- Each section heading should be in Title Case and bold
- Use bullet points for lists within sections
- If a section wasn't covered in the consultation, write "Not documented" or omit the section
- Keep each section concise - aim for 2-4 sentences or bullet points per section

DO NOT INCLUDE:
- QOF outcomes section
- Coding suggestions
- Read codes
- Quality improvement metrics
- Administrative notes

OUTPUT FORMAT:
Return ONLY the formatted clinical summary. Do not include any preamble, explanation, or meta-commentary.`;

            userPrompt = `Create a structured clinical summary from this GP consultation transcript:\n\n${transcript}`;
        }

        console.log('Calling OpenRouter API...');
        console.log('Using model: deepseek/deepseek-chat');

        // Call OpenRouter API
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://ambientdoc.vercel.app',
                'X-Title': 'EchoDoc Clinical Scribe'
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
                max_tokens: 2000
            })
        });

        console.log('OpenRouter response status:', response.status);

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
                error: `AI summary failed (${response.status}): ${errorText.substring(0, 200)}` 
            });
        }

        const data = await response.json();
        console.log('OpenRouter response received successfully');

        // Extract summary
        const summary = data.choices?.[0]?.message?.content;

        if (!summary || summary.trim() === '') {
            console.error('Empty summary received from AI');
            return res.status(500).json({ 
                error: 'AI returned empty response' 
            });
        }

        console.log('Summary generated successfully');
        console.log('Summary length:', summary.length, 'characters');

        return res.status(200).json({ 
            summary,
            type: type || 'clinical'
        });

    } catch (error) {
        console.error('Summary generation error:', error);
        return res.status(500).json({ 
            error: error.message || 'Failed to generate summary' 
        });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};
