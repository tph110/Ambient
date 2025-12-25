// Vercel serverless function for Whisper API transcription via OpenRouter
// Place this in /api/transcribe.js

import fetch from 'node-fetch';
import FormData from 'form-data';

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

        // Get OpenRouter API key from environment variable
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'OpenRouter API key not configured' });
        }

        console.log('Received audio blob, length:', audioBlob.length);

        // Convert base64 audio to buffer
        const audioBuffer = Buffer.from(audioBlob, 'base64');
        console.log('Audio buffer size:', audioBuffer.length, 'bytes');

        // Create form data for Whisper API
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        formData.append('model', 'openai/whisper-1');
        formData.append('language', 'en');

        console.log('Calling OpenRouter Whisper API...');

        // Call OpenRouter Whisper endpoint
        const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://ambientdoc.vercel.app',
                'X-Title': 'AmbientDoc',
                ...formData.getHeaders()
            },
            body: formData
        });

        console.log('OpenRouter response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter error:', errorText);
            throw new Error(`Whisper transcription failed: ${errorText}`);
        }

        const data = await response.json();
        console.log('Transcription successful');
        
        // Extract transcript from response
        const transcript = data.text || data.transcript || data;

        return res.status(200).json({ transcript: transcript });

    } catch (error) {
        console.error('Transcription error:', error);
        return res.status(500).json({ error: error.message || 'Transcription failed' });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '25mb',
        },
    },
};
