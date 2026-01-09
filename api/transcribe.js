// File: /api/transcribe.js
// Deepgram Speech-to-Text API endpoint
// Accepts audio data in multiple formats for compatibility

export const config = {
    api: {
        bodyParser: false, // Disable body parser to handle FormData
    },
};

export default async function handler(req, res) {
    console.log('=== Transcribe API Called (Deepgram) ===');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);

    if (req.method !== 'POST') {
        console.log('Error: Method not allowed');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const apiKey = process.env.DEEPGRAM_API_KEY;
        
        if (!apiKey) {
            console.error('Error: Deepgram API key not configured');
            return res.status(500).json({ 
                error: 'Deepgram API key not configured. Please add DEEPGRAM_API_KEY to Vercel environment variables.' 
            });
        }

        console.log('Deepgram API key found');

        // Read the raw body
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks);
        console.log('Raw body size:', rawBody.length, 'bytes');

        // Parse based on content type
        let audioBuffer;
        let mimeType = 'audio/webm';

        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('application/json')) {
            // JSON format: { audio: "base64string", format: "webm" }
            console.log('Parsing JSON body...');
            const body = JSON.parse(rawBody.toString());
            
            if (!body.audio) {
                console.log('Error: No audio field in JSON body');
                return res.status(400).json({ error: 'Audio data is required' });
            }

            audioBuffer = Buffer.from(body.audio, 'base64');
            
            // Determine MIME type
            if (body.format) {
                switch (body.format.toLowerCase()) {
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
                }
            }
        } else if (contentType.includes('multipart/form-data')) {
            // FormData format (like OpenAI API)
            console.log('Parsing FormData body...');
            
            // Simple FormData parser for audio file
            const boundary = contentType.split('boundary=')[1];
            if (!boundary) {
                return res.status(400).json({ error: 'Invalid multipart/form-data' });
            }

            const parts = rawBody.toString('binary').split(`--${boundary}`);
            
            for (const part of parts) {
                if (part.includes('Content-Disposition') && part.includes('filename')) {
                    // Extract the audio data
                    const contentStart = part.indexOf('\r\n\r\n') + 4;
                    const contentEnd = part.lastIndexOf('\r\n');
                    
                    if (contentStart > 3 && contentEnd > contentStart) {
                        const audioData = part.substring(contentStart, contentEnd);
                        audioBuffer = Buffer.from(audioData, 'binary');
                        
                        // Determine MIME type from filename
                        if (part.includes('.webm') || part.includes('audio/webm')) {
                            mimeType = 'audio/webm';
                        } else if (part.includes('.ogg')) {
                            mimeType = 'audio/ogg';
                        } else if (part.includes('.mp3')) {
                            mimeType = 'audio/mpeg';
                        } else if (part.includes('.wav')) {
                            mimeType = 'audio/wav';
                        }
                        break;
                    }
                }
            }

            if (!audioBuffer) {
                console.log('Error: Could not extract audio from FormData');
                return res.status(400).json({ error: 'Could not extract audio from FormData' });
            }
        } else {
            // Assume raw audio data
            console.log('Treating as raw audio data...');
            audioBuffer = rawBody;
        }

        console.log('Audio buffer size:', audioBuffer.length, 'bytes');
        console.log('Audio buffer size:', (audioBuffer.length / 1024).toFixed(2), 'KB');
        console.log('MIME type:', mimeType);

        // Check file size (Vercel limit is 4.5MB)
        if (audioBuffer.length > 4.5 * 1024 * 1024) {
            console.error('Error: Audio file too large:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
            return res.status(413).json({ 
                error: 'Audio file too large. Maximum size is 4.5MB.' 
            });
        }

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
            console.error('Deepgram response:', JSON.stringify(result, null, 2));
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
        console.error('Error stack:', error.stack);
        return res.status(500).json({ 
            error: 'Transcription failed',
            message: error.message 
        });
    }
}
