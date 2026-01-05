// File: /api/transcribe.js
// Updated Azure Speech Services endpoint with OGG Opus support

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { audioBlob, format } = req.body;

        if (!audioBlob) {
            return res.status(400).json({ error: 'No audio provided' });
        }

        // Validate environment variables
        const apiKey = process.env.AZURE_SPEECH_KEY;
        const region = process.env.AZURE_SPEECH_REGION;
        
        if (!apiKey || !region) {
            console.error('Azure Speech not configured');
            console.error('AZURE_SPEECH_KEY exists:', !!apiKey);
            console.error('AZURE_SPEECH_REGION exists:', !!region);
            return res.status(500).json({ 
                error: 'Azure Speech not configured. Please add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION to environment variables.' 
            });
        }

        console.log('Transcription request received');
        console.log('Format:', format || 'wav');
        console.log('Audio data length:', audioBlob.length, 'characters (base64)');
        
        // Convert base64 to Buffer
        const audioBuffer = Buffer.from(audioBlob, 'base64');
        console.log('Audio buffer size:', audioBuffer.length, 'bytes');
        console.log('Audio buffer size:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');

        // Determine content type based on format
        const contentType = format === 'webm'
            ? 'audio/webm; codecs=opus'  // WebM with Opus codec (Azure supports this!)
            : format === 'ogg'
            ? 'audio/ogg; codecs=opus'   // OGG Opus
            : 'audio/wav; codec=audio/pcm; samplerate=16000';  // WAV (fallback)
        
        console.log('Using content type:', contentType);

        // Azure Speech API endpoint
        const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;
        
        // Query parameters
        const params = new URLSearchParams({
            language: 'en-GB',  // British English
            format: 'detailed',
            profanity: 'raw'    // Don't censor medical terms
        });

        const url = `${endpoint}?${params}`;
        console.log('Calling Azure Speech API...');

        // Call Azure Speech API
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': apiKey,
                'Content-Type': contentType,
                'Accept': 'application/json'
            },
            body: audioBuffer
        });

        console.log('Azure response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Azure error response:', errorText);
            return res.status(response.status).json({ 
                error: `Azure Speech API error: ${errorText}` 
            });
        }

        const data = await response.json();
        console.log('Azure response received');
        console.log('Recognition status:', data.RecognitionStatus);

        // Extract transcript
        if (data.RecognitionStatus === 'Success' && data.DisplayText) {
            const transcript = data.DisplayText;
            console.log('Transcript length:', transcript.length, 'characters');
            return res.status(200).json({ transcript });
        } else {
            console.error('No transcript in response:', data);
            return res.status(500).json({ 
                error: `No speech detected or recognition failed: ${data.RecognitionStatus}` 
            });
        }

    } catch (error) {
        console.error('Transcription error:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({ 
            error: error.message || 'Transcription failed' 
        });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // OGG files are small (~500KB for 5 min), so 10MB is plenty
        },
    },
    maxDuration: 60, // 60 seconds max execution time
};
