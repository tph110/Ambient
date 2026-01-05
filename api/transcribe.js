// File: /api/transcribe.js
// OpenAI Whisper API endpoint - accepts WebM directly, no conversion needed!

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { audioBlob } = req.body;

        if (!audioBlob) {
            return res.status(400).json({ error: 'No audio provided' });
        }

        // Validate environment variable
        const apiKey = process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
            console.error('OpenAI API key not configured');
            return res.status(500).json({ 
                error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to environment variables.' 
            });
        }

        console.log('Whisper transcription request received');
        console.log('Audio data length:', audioBlob.length, 'characters (base64)');
        
        // Convert base64 to Buffer
        const audioBuffer = Buffer.from(audioBlob, 'base64');
        console.log('Audio buffer size:', audioBuffer.length, 'bytes =', (audioBuffer.length / 1024).toFixed(2), 'KB');

        // Create form data for OpenAI Whisper
        const FormData = require('form-data');
        const form = new FormData();
        
        // Add audio file (Whisper accepts webm directly!)
        form.append('file', audioBuffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        
        // Add model parameter
        form.append('model', 'whisper-1');
        
        // Add language (optional - remove for auto-detection)
        form.append('language', 'en');
        
        console.log('Sending to OpenAI Whisper API...');

        // Call OpenAI Whisper API
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...form.getHeaders()
            },
            body: form
        });

        console.log('Whisper API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Whisper API error:', response.status, errorText);
            return res.status(response.status).json({ 
                error: 'Whisper transcription failed',
                details: errorText
            });
        }

        const result = await response.json();
        console.log('Transcription successful, length:', result.text?.length || 0, 'characters');

        // Return transcript in consistent format
        return res.status(200).json({
            text: result.text || '',
            success: true
        });

    } catch (error) {
        console.error('Transcription error:', error);
        return res.status(500).json({ 
            error: 'Transcription failed',
            details: error.message 
        });
    }
}
