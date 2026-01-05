// File: /api/transcribe.js
// OpenAI Whisper API endpoint - Using node-fetch for proper FormData handling

const FormData = require('form-data');
const fetch = require('node-fetch');

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

        // Create form data
        const form = new FormData();
        
        // Append audio file with proper options
        form.append('file', audioBuffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        
        // Add required model parameter
        form.append('model', 'whisper-1');
        
        console.log('Sending to OpenAI Whisper API...');

        // Use node-fetch (v2) which handles FormData correctly
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
            console.error('Whisper API error:', response.status);
            console.error('Error response:', errorText);
            
            // Try to parse error details
            let errorDetails = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson.error?.message || errorJson.error || errorText;
            } catch (e) {
                // Keep as text if not JSON
            }
            
            return res.status(response.status).json({ 
                error: 'Whisper transcription failed',
                details: errorDetails
            });
        }

        const result = await response.json();
        console.log('Transcription successful!');
        console.log('Text length:', result.text?.length || 0, 'characters');

        // Return transcript
        return res.status(200).json({
            text: result.text || '',
            success: true
        });

    } catch (error) {
        console.error('Transcription error:', error);
        console.error('Error details:', error.message);
        return res.status(500).json({ 
            error: 'Transcription failed',
            details: error.message 
        });
    }
}
