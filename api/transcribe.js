// Vercel serverless function for Whisper API transcription via OpenRouter
// Place this in /api/transcribe.js

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get audio file from request
        const { audioBlob } = req.body;

        if (!audioBlob) {
            return res.status(400).json({ error: 'Audio data is required' });
        }

        // Get OpenRouter API key from environment variable (same one you already have!)
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'OpenRouter API key not configured' });
        }

        // Convert base64 audio to buffer
        const audioBuffer = Buffer.from(audioBlob, 'base64');

        // Create form data for Whisper API
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
        formData.append('model', 'openai/whisper-1');
        formData.append('language', 'en');
        formData.append('response_format', 'text');

        // Call OpenRouter Whisper endpoint
        const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': req.headers.referer || 'https://ambientdoc.vercel.app',
                'X-Title': 'AmbientDoc'
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Whisper transcription failed');
        }

        const transcript = await response.text();

        return res.status(200).json({ transcript });

    } catch (error) {
        console.error('Transcription error:', error);
        return res.status(500).json({ error: error.message });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // Allow up to 10MB audio files
        },
    },
};
