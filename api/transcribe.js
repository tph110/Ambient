// File: /api/transcribe.js
// Azure Speech Services transcription endpoint (HIPAA compliant)

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { audioBlob } = req.body;

        if (!audioBlob) {
            return res.status(400).json({ error: 'Audio data required' });
        }

        // Get Azure credentials from environment variables
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION;

        if (!speechKey || !speechRegion) {
            console.error('Azure Speech credentials not configured');
            return res.status(500).json({ error: 'Azure Speech not configured' });
        }

        console.log('Converting base64 to audio buffer...');
        
        // Convert base64 to Buffer
        const audioBuffer = Buffer.from(audioBlob, 'base64');
        console.log('Audio buffer size:', audioBuffer.length, 'bytes');

        // Azure Speech API endpoint
        const endpoint = `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;
        
        // Build query parameters
        const params = new URLSearchParams({
            language: 'en-GB',  // British English (change to 'en-US' for American)
            format: 'detailed',  // Get detailed results
            profanity: 'raw'     // Don't filter profanity (medical context)
        });

        console.log('Calling Azure Speech API...');
        console.log('Endpoint:', `${endpoint}?${params}`);

        // Call Azure Speech API
        const response = await fetch(`${endpoint}?${params}`, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': speechKey,
                'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
                'Accept': 'application/json'
            },
            body: audioBuffer
        });

        console.log('Azure response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Azure Speech API error:', errorText);
            return res.status(response.status).json({ 
                error: `Azure Speech error: ${errorText}` 
            });
        }

        const data = await response.json();
        console.log('Azure response:', JSON.stringify(data, null, 2));

        // Extract transcript from Azure response
        let transcript = '';
        
        if (data.RecognitionStatus === 'Success') {
            // Use the best result
            transcript = data.DisplayText || data.NBest?.[0]?.Display || '';
        } else {
            console.error('Recognition failed:', data.RecognitionStatus);
            return res.status(400).json({ 
                error: `Speech recognition failed: ${data.RecognitionStatus}` 
            });
        }

        if (!transcript || transcript.trim() === '') {
            return res.status(400).json({ 
                error: 'No speech detected in audio' 
            });
        }

        console.log('Transcript extracted:', transcript.substring(0, 100) + '...');

        // Return transcript in same format as Whisper
        return res.status(200).json({ transcript });

    } catch (error) {
        console.error('Transcription error:', error);
        return res.status(500).json({ 
            error: error.message || 'Transcription failed' 
        });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};
