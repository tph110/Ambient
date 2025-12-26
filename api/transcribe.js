// Vercel serverless function for OpenAI Whisper API transcription
import fetch from 'node-fetch';
import FormData from 'form-data';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { audioBlob } = req.body;

        if (!audioBlob) {
            return res.status(400).json({ error: 'Audio data required' });
        }

        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            console.error('OPENAI_API_KEY not found');
            return res.status(500).json({ error: 'API key not configured' });
        }

        console.log('Converting audio...');
        const audioBuffer = Buffer.from(audioBlob, 'base64');
        console.log('Audio size:', audioBuffer.length, 'bytes');

        // Create FormData
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        console.log('Calling OpenAI Whisper...');

        // Call OpenAI
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        console.log('OpenAI status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI error:', errorText);
            return res.status(500).json({ error: `OpenAI error: ${errorText}` });
        }

        const data = await response.json();
        console.log('Success! Transcript length:', data.text?.length || 0);

        return res.status(200).json({ transcript: data.text });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: error.message });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};
