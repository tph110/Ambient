// File: /api/transcribe.js
// Deepgram Speech-to-Text API endpoint
// Replaces OpenAI Whisper with Deepgram for cost savings and medical accuracy

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

export default async function handler(req, res) {
    console.log('=== Transcribe API Called (Deepgram) ===');
    console.log('Method:', req.method);

    if (req.method !== 'POST') {
        console.log('Error: Method not allowed');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { audio, format = 'webm' } = req.body;
        console.log('Request received');
        console.log('Audio format:', format);
        console.log('Audio data length:', audio?.length || 0);

        if (!audio) {
            console.log('Error: No audio data provided');
            return res.status(400).json({ error: 'Audio data is required' });
        }

        const apiKey = process.env.DEEPGRAM_API_KEY;
        
        if (!apiKey) {
            console.error('Error: Deepgram API key not configured');
            return res.status(500).json({ 
                error: 'Deepgram API key not configured. Please add DEEPGRAM_API_KEY to Vercel environment variables.' 
            });
        }

        console.log('Deepgram API key found');

        // Convert base64 to buffer
        const audioBuffer = Buffer.from(audio, 'base64');
        console.log('Audio buffer size:', audioBuffer.length, 'bytes');
        console.log('Audio buffer size:', (audioBuffer.length / 1024).toFixed(2), 'KB');

        // Check file size (Vercel limit is 4.5MB)
        if (audioBuffer.length > 4.5 * 1024 * 1024) {
            console.error('Error: Audio file too large:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
            return res.status(413).json({ 
                error: 'Audio file too large. Maximum size is 4.5MB.' 
            });
        }

        // Determine MIME type based on format
        let mimeType;
        switch (format.toLowerCase()) {
            case 'webm':
            case 'opus':
                mimeType = 'audio/webm';
                break;
            case 'ogg':
                mimeType = 'audio/ogg';
                break;
            case 'mp3':
                mimeType = 'audio/mpeg';
                break;
            case 'wav':
                mimeType = 'audio/wav';
                break;
            default:
                mimeType = 'audio/webm'; // Default to WebM
        }

        console.log('MIME type:', mimeType);

        // Build Deepgram API URL with parameters
        const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
        
        // Add query parameters for transcription options
        deepgramUrl.searchParams.append('model', 'nova-2-medical'); // Medical-specific model
        deepgramUrl.searchParams.append('language', 'en-GB'); // British English
        deepgramUrl.searchParams.append('punctuate', 'true'); // Auto-punctuation
        deepgramUrl.searchParams.append('paragraphs', 'true'); // Paragraph breaks
        deepgramUrl.searchParams.append('smart_format', 'true'); // Smart formatting
        deepgramUrl.searchParams.append('diarize', 'false'); // Speaker diarization (off for now)

        console.log('Sending to Deepgram API...');
        console.log('Using medical model: nova-2-medical');
        console.log('Language: en-GB (British English)');

        // Send to Deepgram
        const response = await fetch(deepgramUrl.toString(), {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': mimeType,
            },
            body: audioBuffer,
        });

        console.log('Deepgram response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Deepgram API error:', response.status, errorText);
            
            // Handle specific error codes
            if (response.status === 401) {
                return res.status(401).json({ 
                    error: 'Invalid Deepgram API key. Please check your DEEPGRAM_API_KEY in Vercel.' 
                });
            } else if (response.status === 429) {
                return res.status(429).json({ 
                    error: 'Rate limit exceeded. Please wait a moment and try again.' 
                });
            } else if (response.status === 413) {
                return res.status(413).json({ 
                    error: 'Audio file too large for Deepgram API.' 
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
        // Deepgram response format:
        // {
        //   results: {
        //     channels: [{
        //       alternatives: [{
        //         transcript: "the transcribed text...",
        //         confidence: 0.95,
        //         words: [...]
        //       }]
        //     }]
        //   }
        // }

        const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence;

        if (!transcript) {
            console.error('No transcript in Deepgram response');
            return res.status(500).json({ 
                error: 'Failed to extract transcript from Deepgram response',
                response: result 
            });
        }

        console.log('Transcript length:', transcript.length, 'characters');
        console.log('Confidence score:', confidence);
        console.log('First 100 chars:', transcript.substring(0, 100));

        // Return in OpenAI-compatible format for easy frontend integration
        return res.status(200).json({
            text: transcript,
            confidence: confidence,
            provider: 'deepgram',
            model: 'nova-2-medical',
            language: 'en-GB'
        });

    } catch (error) {
        console.error('Transcription error:', error);
        return res.status(500).json({ 
            error: 'Transcription failed',
            message: error.message 
        });
    }
}
