// File: /api/transcribe.js
// Deepgram Speech-to-Text API endpoint - V4 - Fixed for audioBlob field

export const config = {
    api: {
        bodyParser: false, // Disable body parser
    },
};

export default async function handler(req, res) {
    console.log('=== Transcribe API Called (Deepgram) ===');
    console.log('Method:', req.method);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check API key
        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
            console.error('Error: Deepgram API key not configured');
            return res.status(500).json({ 
                error: 'Deepgram API key not configured. Please add DEEPGRAM_API_KEY to Vercel environment variables.' 
            });
        }

        // Read raw body
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks);
        console.log('Raw body size:', rawBody.length, 'bytes');

        // Parse JSON
        const body = JSON.parse(rawBody.toString('utf-8'));
        console.log('JSON body parsed');
        console.log('Body keys:', Object.keys(body));

        // IMPORTANT: Frontend sends "audioBlob" not "audio"
        const base64Audio = body.audioBlob || body.audio || body.file || body.data;
        
        if (!base64Audio) {
            console.error('No audio data found. Keys received:', Object.keys(body));
            return res.status(400).json({ 
                error: 'Audio data is required. Expected field: audioBlob, audio, file, or data',
                receivedFields: Object.keys(body)
            });
        }

        console.log('Audio data found, converting from base64...');
        const audioBuffer = Buffer.from(base64Audio, 'base64');
        console.log('Audio buffer size:', audioBuffer.length, 'bytes');
        console.log('Audio buffer size:', (audioBuffer.length / 1024).toFixed(2), 'KB');

        // Check file size
        if (audioBuffer.length > 4.5 * 1024 * 1024) {
            console.error('Audio file too large:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
            return res.status(413).json({ 
                error: 'Audio file too large. Maximum size is 4.5MB.' 
            });
        }

        // Build Deepgram API URL with medical model
        const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
        deepgramUrl.searchParams.append('model', 'nova-2-medical'); // Medical-specific model
        deepgramUrl.searchParams.append('language', 'en-GB'); // British English
        deepgramUrl.searchParams.append('punctuate', 'true'); // Auto-punctuation
        deepgramUrl.searchParams.append('paragraphs', 'true'); // Paragraph breaks
        deepgramUrl.searchParams.append('smart_format', 'true'); // Smart formatting

        console.log('Sending to Deepgram API...');
        console.log('Model: nova-2-medical (medical terminology)');
        console.log('Language: en-GB (British English)');

        // Send to Deepgram
        const response = await fetch(deepgramUrl.toString(), {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'audio/webm',
            },
            body: audioBuffer,
        });

        console.log('Deepgram response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Deepgram API error:', response.status, errorText);
            
            if (response.status === 401) {
                return res.status(401).json({ 
                    error: 'Invalid Deepgram API key. Please check DEEPGRAM_API_KEY in Vercel.' 
                });
            } else if (response.status === 429) {
                return res.status(429).json({ 
                    error: 'Rate limit exceeded. Please wait a moment and try again.' 
                });
            }
            
            return res.status(response.status).json({ 
                error: `Deepgram API error: ${response.status}`,
                details: errorText 
            });
        }

        const result = await response.json();
        console.log('Deepgram transcription received');

        // Extract transcript from Deepgram response
        const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence;

        if (!transcript) {
            console.error('No transcript in response');
            return res.status(500).json({ 
                error: 'Failed to extract transcript from Deepgram response' 
            });
        }

        console.log('SUCCESS!');
        console.log('Transcript length:', transcript.length, 'characters');
        console.log('Confidence:', confidence);
        console.log('Preview:', transcript.substring(0, 100));

        // Return in OpenAI-compatible format (so frontend doesn't need changes)
        return res.status(200).json({
            text: transcript,
            confidence: confidence,
            provider: 'deepgram',
            model: 'nova-2-medical'
        });

    } catch (error) {
        console.error('Transcription error:', error.message);
        console.error('Stack:', error.stack);
        return res.status(500).json({ 
            error: 'Transcription failed',
            message: error.message 
        });
    }
}
