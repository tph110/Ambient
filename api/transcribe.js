// File: /api/transcribe.js
// Deepgram Speech-to-Text API endpoint - V3 with detailed logging

export const config = {
    api: {
        bodyParser: false, // Disable body parser to handle raw data
    },
};

export default async function handler(req, res) {
    console.log('=== Transcribe API Called (Deepgram V3) ===');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('All headers:', JSON.stringify(req.headers, null, 2));

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
        console.log('Reading raw body...');
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks);
        console.log('Raw body size:', rawBody.length, 'bytes');
        console.log('First 200 chars of body:', rawBody.toString().substring(0, 200));

        let audioBuffer;
        let mimeType = 'audio/webm';

        const contentType = req.headers['content-type'] || '';
        console.log('Detected content-type:', contentType);

        // Try to parse as JSON first
        try {
            console.log('Attempting JSON parse...');
            const bodyString = rawBody.toString('utf-8');
            console.log('Body string length:', bodyString.length);
            console.log('First 100 chars:', bodyString.substring(0, 100));
            
            const body = JSON.parse(bodyString);
            console.log('JSON parsed successfully!');
            console.log('Body keys:', Object.keys(body));
            console.log('Has audio field?', 'audio' in body);
            console.log('Has file field?', 'file' in body);
            console.log('Has data field?', 'data' in body);
            
            // Check for different possible field names
            let base64Audio = null;
            if (body.audio) {
                console.log('Found audio field');
                console.log('Audio field type:', typeof body.audio);
                console.log('Audio field length:', body.audio.length);
                base64Audio = body.audio;
            } else if (body.file) {
                console.log('Found file field');
                base64Audio = body.file;
            } else if (body.data) {
                console.log('Found data field');
                base64Audio = body.data;
            } else {
                console.error('No audio field found in JSON body');
                console.error('Full body:', JSON.stringify(body, null, 2));
                return res.status(400).json({ 
                    error: 'Audio data is required. Body keys: ' + Object.keys(body).join(', ')
                });
            }

            console.log('Converting base64 to buffer...');
            audioBuffer = Buffer.from(base64Audio, 'base64');
            console.log('Converted successfully. Buffer size:', audioBuffer.length);
            
            // Get format if provided
            if (body.format) {
                console.log('Format specified:', body.format);
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
            
        } catch (jsonError) {
            console.log('JSON parse failed:', jsonError.message);
            console.log('Trying FormData parse...');
            
            // Try FormData
            if (contentType.includes('multipart/form-data')) {
                const boundary = contentType.split('boundary=')[1];
                console.log('Boundary:', boundary);
                
                if (!boundary) {
                    return res.status(400).json({ error: 'Invalid multipart/form-data: no boundary' });
                }

                const parts = rawBody.toString('binary').split(`--${boundary}`);
                console.log('Found', parts.length, 'parts in FormData');
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    console.log(`Part ${i} length:`, part.length);
                    console.log(`Part ${i} preview:`, part.substring(0, 100));
                    
                    if (part.includes('Content-Disposition') && part.includes('filename')) {
                        console.log('Found file part!');
                        const contentStart = part.indexOf('\r\n\r\n') + 4;
                        const contentEnd = part.lastIndexOf('\r\n');
                        
                        if (contentStart > 3 && contentEnd > contentStart) {
                            const audioData = part.substring(contentStart, contentEnd);
                            audioBuffer = Buffer.from(audioData, 'binary');
                            console.log('Extracted audio from FormData. Size:', audioBuffer.length);
                            
                            if (part.includes('.webm') || part.includes('audio/webm')) {
                                mimeType = 'audio/webm';
                            } else if (part.includes('.ogg')) {
                                mimeType = 'audio/ogg';
                            }
                            break;
                        }
                    }
                }

                if (!audioBuffer) {
                    console.error('Could not extract audio from FormData');
                    return res.status(400).json({ error: 'Could not extract audio from FormData' });
                }
            } else {
                // Treat as raw audio
                console.log('Treating as raw audio data');
                audioBuffer = rawBody;
            }
        }

        if (!audioBuffer) {
            console.error('No audio buffer created');
            return res.status(400).json({ error: 'Failed to extract audio data' });
        }

        console.log('Final audio buffer size:', audioBuffer.length, 'bytes');
        console.log('Final audio buffer size:', (audioBuffer.length / 1024).toFixed(2), 'KB');
        console.log('MIME type:', mimeType);

        // Check file size
        if (audioBuffer.length > 4.5 * 1024 * 1024) {
            console.error('Error: Audio file too large:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
            return res.status(413).json({ 
                error: 'Audio file too large. Maximum size is 4.5MB.' 
            });
        }

        // Build Deepgram API URL
        const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
        deepgramUrl.searchParams.append('model', 'nova-2-medical');
        deepgramUrl.searchParams.append('language', 'en-GB');
        deepgramUrl.searchParams.append('punctuate', 'true');
        deepgramUrl.searchParams.append('paragraphs', 'true');
        deepgramUrl.searchParams.append('smart_format', 'true');
        deepgramUrl.searchParams.append('diarize', 'false');

        console.log('Sending to Deepgram API...');
        console.log('URL:', deepgramUrl.toString());

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
            console.error('Deepgram API error:', response.status);
            console.error('Error details:', errorText);
            
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

        // Extract transcript
        const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence;

        if (!transcript) {
            console.error('No transcript in Deepgram response');
            console.error('Full response:', JSON.stringify(result, null, 2));
            return res.status(500).json({ 
                error: 'Failed to extract transcript from Deepgram response',
                response: result 
            });
        }

        console.log('SUCCESS! Transcript length:', transcript.length, 'characters');
        console.log('Confidence score:', confidence);
        console.log('Transcript preview:', transcript.substring(0, 100));

        // Return in OpenAI-compatible format
        return res.status(200).json({
            text: transcript,
            confidence: confidence,
            provider: 'deepgram',
            model: 'nova-2-medical',
            language: 'en-GB'
        });

    } catch (error) {
        console.error('=== CRITICAL ERROR ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        return res.status(500).json({ 
            error: 'Transcription failed',
            message: error.message,
            type: error.constructor.name
        });
    }
}
