// DOM Elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptDiv = document.getElementById('transcript');
const summaryDiv = document.getElementById('summary');
const referralLetterDiv = document.getElementById('referralLetter');
const patientSummaryDiv = document.getElementById('patientSummary');
const statusDiv = document.getElementById('status');
const getSummaryBtn = document.getElementById('getSummary');
const clearTranscriptBtn = document.getElementById('clearTranscript');
const copySummaryBtn = document.getElementById('copySummary');
const generateReferralBtn = document.getElementById('generateReferral');
const copyReferralBtn = document.getElementById('copyReferral');
const generatePatientSummaryBtn = document.getElementById('generatePatientSummary');
const copyPatientSummaryBtn = document.getElementById('copyPatientSummary');

// State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isPaused = false;
let finalTranscript = '';
let finalSummary = '';
let recordingStartTime = null;
let recordingTimer = null;
let pausedDuration = 0;
let pauseStartTime = null;
let selectedMicId = null;
let telephoneStreams = null;  // Store telephone mode streams for cleanup

// Setup Telephone Recording (Mix Microphone + System Audio)
async function setupTelephoneRecording() {
    try {
        console.log('Setting up telephone consultation recording...');
        
        // Step 1: Get microphone stream
        const micConstraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
        };
        const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
        console.log('✓ Microphone stream acquired');
        
        // Step 2: Get system audio (requires screen share with audio)
        console.log('Please select your telephony software window and enable "Share audio"...');
        const systemStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,  // Required by Chrome to access audio
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });
        console.log('✓ System audio stream acquired');
        
        // Step 3: Create audio context for mixing
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        
        // Step 4: Connect microphone to mixer
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);
        console.log('✓ Microphone connected to mixer');
        
        // Step 5: Connect system audio to mixer (if available)
        const audioTracks = systemStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const systemSource = audioContext.createMediaStreamSource(
                new MediaStream(audioTracks)
            );
            systemSource.connect(destination);
            console.log('✓ System audio connected to mixer');
        } else {
            console.warn('⚠️ No system audio track found. Make sure you checked "Share audio" in the screen share dialog.');
            alert('Warning: No system audio detected.\n\nMake sure you:\n1. Selected a window/tab (not entire screen)\n2. Checked "Share audio" checkbox\n\nRecording will continue with microphone only.');
        }
        
        // IMPORTANT: Keep video track alive! Stopping it will kill the audio in Chrome.
        // We keep a reference to the full systemStream so it stays active.
        // It will be stopped when the user clicks "Stop Recording"
        console.log('✓ Video track kept alive (required for audio capture)');
        
        console.log('✓ Telephone recording setup complete!');
        
        // Return both the mixed stream AND the original systemStream
        // We need to keep systemStream alive for audio to work
        return {
            mixedStream: destination.stream,
            systemStream: systemStream,  // Keep reference to stop later
            micStream: micStream,
            audioContext: audioContext
        };
        
    } catch (error) {
        console.error('Error setting up telephone recording:', error);
        
        if (error.name === 'NotAllowedError') {
            alert('Screen sharing was cancelled or denied.\n\nFalling back to microphone-only recording.');
        } else {
            alert('Failed to setup telephone recording: ' + error.message + '\n\nFalling back to microphone-only recording.');
        }
        
        // Fallback to microphone only
        const micConstraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
        };
        const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
        
        // Return consistent structure (no system stream in fallback mode)
        return {
            mixedStream: micStream,
            systemStream: null,
            micStream: micStream,
            audioContext: null
        };
    }
}

// Start Recording with MediaRecorder
async function startRecording() {
    try {
        // Check if telephone mode is enabled via checkbox
        const telephoneModeCheckbox = document.getElementById('telephoneModeCheckbox');
        const recordTelephone = telephoneModeCheckbox.checked;
        
        let finalStream;
        
        if (recordTelephone) {
            // TELEPHONE MODE: Capture both microphone and system audio
            telephoneStreams = await setupTelephoneRecording();
            finalStream = telephoneStreams.mixedStream;
        } else {
            // STANDARD MODE: Just microphone
            telephoneStreams = null;  // Clear any previous telephone streams
            const constraints = {
                audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
            };
            finalStream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        // Try to find the best supported codec with compression
        let options;
        const preferredCodecs = [
            { mimeType: 'audio/webm;codecs=opus', bitrate: 12000 },
            { mimeType: 'audio/ogg;codecs=opus', bitrate: 12000 },
            { mimeType: 'audio/webm', bitrate: 12000 },
            { mimeType: 'audio/mp4', bitrate: 12000 }
        ];
        
        // Find first supported codec
        for (const codec of preferredCodecs) {
            if (MediaRecorder.isTypeSupported(codec.mimeType)) {
                options = {
                    mimeType: codec.mimeType,
                    audioBitsPerSecond: codec.bitrate
                };
                console.log('Selected codec:', codec.mimeType);
                break;
            }
        }
        
        // Fallback to default if none supported
        if (!options) {
            options = { audioBitsPerSecond: 12000 };
            console.warn('No preferred codec supported, using browser default (may not compress well)');
        }
        
        // Create MediaRecorder with best available options
        mediaRecorder = new MediaRecorder(finalStream, options);
        audioChunks = [];
        
        console.log('Recording with:', options.mimeType || 'default', 'at', options.audioBitsPerSecond/1000, 'kbps (requested)');
        
        // Collect audio data
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        // Handle recording stop
        mediaRecorder.onstop = async () => {
            // Stop all tracks from the mixed stream
            finalStream.getTracks().forEach(track => track.stop());
            
            // If in telephone mode, clean up all the streams properly
            if (telephoneStreams) {
                console.log('Cleaning up telephone mode streams...');
                
                // Stop microphone stream
                if (telephoneStreams.micStream) {
                    telephoneStreams.micStream.getTracks().forEach(track => track.stop());
                }
                
                // Stop system stream (this includes video track - safe to stop now)
                if (telephoneStreams.systemStream) {
                    telephoneStreams.systemStream.getTracks().forEach(track => track.stop());
                    console.log('✓ System stream stopped (video + audio)');
                }
                
                // Close audio context
                if (telephoneStreams.audioContext) {
                    telephoneStreams.audioContext.close();
                    console.log('✓ Audio context closed');
                }
                
                // Clear the reference
                telephoneStreams = null;
            }
            
            // Create audio blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Calculate actual bitrate achieved
            const durationSeconds = (Date.now() - recordingStartTime - pausedDuration) / 1000;
            const actualBitrate = (audioBlob.size * 8) / durationSeconds;
            
            console.log('Recording duration:', Math.floor(durationSeconds), 'seconds');
            console.log('File size:', audioBlob.size, 'bytes');
            console.log('Actual bitrate achieved:', Math.floor(actualBitrate), 'bps (', Math.floor(actualBitrate/1000), 'kbps)');
            
            // Warn if compression didn't work
            if (actualBitrate > 20000) {
                console.warn('⚠️ Compression may not be working! Actual bitrate', Math.floor(actualBitrate/1000), 'kbps exceeds requested 12 kbps');
                console.warn('Your browser may not support bitrate control. Consider using Chrome for better compression.');
            }
            
            // Transcribe the audio
            await transcribeAudio(audioBlob);
        };
        
        // Start recording
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Start timer display
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            statusDiv.textContent = `🔴 Recording... ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
        
        statusDiv.classList.add('recording');
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        
        console.log('Recording started with Whisper API');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        
        let errorMessage = 'Failed to start recording';
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Microphone permission denied. Please enable it in browser settings.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'No microphone found. Please connect a microphone.';
        }
        
        alert(errorMessage);
    }
}

// Stop Recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        isRecording = false;
        isPaused = false;
        
        // Stop timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // Reset pause tracking
        pausedDuration = 0;
        pauseStartTime = null;
        
        // Stop recording
        mediaRecorder.stop();
        
        // Update UI
        statusDiv.textContent = 'Processing audio...';
        statusDiv.classList.remove('recording');
        startBtn.disabled = true; // Keep disabled while processing
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        
        console.log('Recording stopped, sending to Whisper API');
    }
}

// Pause Recording
function pauseRecording() {
    if (mediaRecorder && isRecording && !isPaused) {
        mediaRecorder.pause();
        isPaused = true;
        pauseStartTime = Date.now();
        
        // Stop timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        statusDiv.textContent = '⏸️ Recording Paused';
        statusDiv.classList.remove('recording');
        pauseBtn.innerHTML = '<span class="icon">▶️</span> Resume';
        
        console.log('Recording paused');
    } else if (mediaRecorder && isPaused) {
        // Resume
        mediaRecorder.resume();
        isPaused = false;
        
        // Track total paused time
        if (pauseStartTime) {
            pausedDuration += Date.now() - pauseStartTime;
            pauseStartTime = null;
        }
        
        // Restart timer
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime - pausedDuration) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            statusDiv.textContent = `🔴 Recording... ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
        
        statusDiv.classList.add('recording');
        pauseBtn.innerHTML = '<span class="icon">⏸️</span> Pause';
        
        console.log('Recording resumed');
    }
}

// Transcribe Audio using Whisper API
async function transcribeAudio(audioBlob) {
    try {
        // Check file size before uploading (Vercel limit is ~4.5MB for request body)
        const maxSize = 4 * 1024 * 1024; // 4MB to be safe
        if (audioBlob.size > maxSize) {
            const minutes = Math.floor(audioBlob.size / (12000 / 8) / 60); // Estimate duration
            throw new Error(`Recording too long (approximately ${minutes} minutes). Please keep consultations under 10-15 minutes, or stop and restart recording for longer sessions.`);
        }
        
        statusDiv.textContent = '⏳ Transcribing with AI...';
        transcriptDiv.innerHTML = '<p class="placeholder">Transcribing your consultation...</p>';
        
        console.log('Audio blob size:', audioBlob.size, 'bytes');
        console.log('Audio blob type:', audioBlob.type);
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        
        reader.onloadend = async () => {
            const base64Audio = reader.result.split(',')[1];
            console.log('Base64 audio length:', base64Audio.length);
            
            // Call our Whisper API endpoint
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audioBlob: base64Audio
                })
            });
            
            console.log('API response status:', response.status);
            
            if (!response.ok) {
                let errorMessage = 'Transcription failed';
                
                // Handle specific error codes
                if (response.status === 413) {
                    errorMessage = 'Recording too long. Please keep consultations under 15 minutes, or stop and restart recording for longer sessions.';
                    console.error('413 Payload Too Large - Audio size:', audioBlob.size, 'bytes');
                    throw new Error(errorMessage);
                }
                
                // Try to get error details
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                    console.error('API error:', errorData);
                } catch (e) {
                    // If JSON parsing fails, don't try to read body again
                    console.error('Could not parse error response');
                }
                
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            console.log('Transcription response:', data);
            
            finalTranscript = data.transcript;
            
            if (!finalTranscript || finalTranscript.trim() === '') {
                throw new Error('Received empty transcript from API');
            }
            
            // Display transcript
            transcriptDiv.innerHTML = `<p>${finalTranscript}</p>`;
            
            // Update UI
            statusDiv.textContent = 'Transcription complete!';
            statusDiv.classList.remove('recording');
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            pauseBtn.innerHTML = '<span class="icon">⏸️</span> Pause';
            stopBtn.disabled = true;
            
            // Show buttons
            if (finalTranscript.trim()) {
                clearTranscriptBtn.style.display = 'inline-block';
                getSummaryBtn.style.display = 'inline-flex';
            }
            
            console.log('Transcription complete, length:', finalTranscript.length, 'characters');
        };
        
        reader.onerror = (error) => {
            console.error('FileReader error:', error);
            throw new Error('Failed to read audio file');
        };
        
    } catch (error) {
        console.error('Transcription error:', error);
        statusDiv.textContent = 'Transcription failed';
        transcriptDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        pauseBtn.innerHTML = '<span class="icon">⏸️</span> Pause';
        stopBtn.disabled = true;
    }
}

// Generate AI Summary using secure API endpoint
async function generateSummary() {
    if (!finalTranscript.trim()) {
        alert('No transcript available to summarize');
        return;
    }

    // Show loading state
    getSummaryBtn.disabled = true;
    getSummaryBtn.innerHTML = '<span class="loading"></span> Generating...';
    summaryDiv.innerHTML = '<p style="color: #667eea;">Generating summary...</p>';

    try {
        // Call our secure API endpoint
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transcript: finalTranscript
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API request failed: ${response.status}`);
        }

        const data = await response.json();
        const summary = data.summary;

        // Store summary for referral letter generation
        finalSummary = summary;

        // Display summary
        summaryDiv.innerHTML = `<p>${summary.replace(/\n/g, '<br>')}</p>`;
        
        // Show copy button
        copySummaryBtn.style.display = 'inline-flex';
        
        // Show referral letter button
        generateReferralBtn.style.display = 'inline-flex';
        
        // Show patient summary button
        generatePatientSummaryBtn.style.display = 'inline-flex';
        
    } catch (error) {
        console.error('Error generating summary:', error);
        summaryDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
    } finally {
        getSummaryBtn.disabled = false;
        getSummaryBtn.innerHTML = '<span class="icon">✨</span> Generate Summary';
    }
}

// Generate Referral Letter
async function generateReferralLetter() {
    if (!finalSummary || finalSummary.trim() === '') {
        alert('Please generate a clinical summary first');
        return;
    }

    // Show loading state
    generateReferralBtn.disabled = true;
    generateReferralBtn.innerHTML = '<span class="loading"></span> Generating...';
    referralLetterDiv.innerHTML = '<p style="color: #667eea;">Generating referral letter...</p>';

    try {
        // Call our secure API endpoint with referral letter prompt
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transcript: finalSummary,
                isReferral: true  // Flag to use different prompt
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API request failed: ${response.status}`);
        }

        const data = await response.json();
        const referralLetter = data.summary;

        // Display referral letter
        referralLetterDiv.innerHTML = `<p>${referralLetter.replace(/\n/g, '<br>')}</p>`;
        
        // Show copy button
        copyReferralBtn.style.display = 'inline-flex';
        
    } catch (error) {
        console.error('Error generating referral letter:', error);
        referralLetterDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
    } finally {
        generateReferralBtn.disabled = false;
        generateReferralBtn.innerHTML = '<span class="icon">📄</span> Generate Referral Letter';
    }
}

// Generate Patient Summary
async function generatePatientSummary() {
    if (!finalSummary || finalSummary.trim() === '') {
        alert('Please generate a clinical summary first');
        return;
    }

    // Show loading state
    generatePatientSummaryBtn.disabled = true;
    generatePatientSummaryBtn.innerHTML = '<span class="loading"></span> Generating...';
    patientSummaryDiv.innerHTML = '<p style="color: #667eea;">Generating patient-friendly summary...</p>';

    try {
        // Call our secure API endpoint with patient summary prompt
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transcript: finalSummary,
                isPatientSummary: true  // Flag to use patient-friendly prompt
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API request failed: ${response.status}`);
        }

        const data = await response.json();
        const patientSummary = data.summary;

        // Display patient summary
        patientSummaryDiv.innerHTML = `<p>${patientSummary.replace(/\n/g, '<br>')}</p>`;
        
        // Show copy button
        copyPatientSummaryBtn.style.display = 'inline-flex';
        
    } catch (error) {
        console.error('Error generating patient summary:', error);
        patientSummaryDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
    } finally {
        generatePatientSummaryBtn.disabled = false;
        generatePatientSummaryBtn.innerHTML = '<span class="icon">👤</span> Generate Patient Summary';
    }
}

// Clear Transcript
function clearTranscript() {
    finalTranscript = '';
    finalSummary = '';
    audioChunks = [];
    isPaused = false;
    pausedDuration = 0;
    pauseStartTime = null;
    
    transcriptDiv.innerHTML = '<p class="placeholder">Transcription will appear here once you have finished recording</p>';
    summaryDiv.innerHTML = '<p class="placeholder">An AI-generated summary will appear here once you have finished recording</p>';
    referralLetterDiv.innerHTML = '<p class="placeholder">Generate a clinical summary first, then create a referral letter for secondary care specialists</p>';
    patientSummaryDiv.innerHTML = '<p class="placeholder">Generate a clinical summary first, then create a patient-friendly summary to share</p>';
    
    clearTranscriptBtn.style.display = 'none';
    getSummaryBtn.style.display = 'none';
    copySummaryBtn.style.display = 'none';
    generateReferralBtn.style.display = 'none';
    copyReferralBtn.style.display = 'none';
    generatePatientSummaryBtn.style.display = 'none';
    copyPatientSummaryBtn.style.display = 'none';
    
    // Reset pause button
    pauseBtn.innerHTML = '<span class="icon">⏸️</span> Pause';
}

// Toggle Transcript Section
function toggleTranscript() {
    const transcriptContent = document.getElementById('transcriptContent');
    const collapseBtn = document.getElementById('transcriptCollapseBtn');
    
    if (transcriptContent.classList.contains('collapsed')) {
        transcriptContent.classList.remove('collapsed');
        collapseBtn.classList.add('expanded');
    } else {
        transcriptContent.classList.add('collapsed');
        collapseBtn.classList.remove('expanded');
    }
}

// Copy Summary to Clipboard
async function copySummaryToClipboard() {
    const summaryText = summaryDiv.innerText;
    
    // Check if there's actual content (not just placeholder)
    if (!summaryText || summaryText.includes('Summary will appear here')) {
        alert('No summary to copy. Please generate a summary first.');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(summaryText);
        
        // Visual feedback
        const originalText = copySummaryBtn.innerHTML;
        copySummaryBtn.innerHTML = '<span class="icon">✓</span> Copied!';
        copySummaryBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        
        // Reset after 2 seconds
        setTimeout(() => {
            copySummaryBtn.innerHTML = originalText;
            copySummaryBtn.style.background = '';
        }, 2000);
        
    } catch (error) {
        console.error('Failed to copy:', error);
        alert('Failed to copy to clipboard. Please try selecting and copying manually.');
    }
}

// Copy Referral Letter to Clipboard
async function copyReferralToClipboard() {
    const referralText = referralLetterDiv.innerText;
    
    // Check if there's actual content (not just placeholder)
    if (!referralText || referralText.includes('Generate a clinical summary first')) {
        alert('No referral letter to copy. Please generate a referral letter first.');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(referralText);
        
        // Visual feedback
        const originalText = copyReferralBtn.innerHTML;
        copyReferralBtn.innerHTML = '<span class="icon">✓</span> Copied!';
        copyReferralBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        
        // Reset after 2 seconds
        setTimeout(() => {
            copyReferralBtn.innerHTML = originalText;
            copyReferralBtn.style.background = '';
        }, 2000);
        
    } catch (error) {
        console.error('Failed to copy:', error);
        alert('Failed to copy to clipboard. Please try selecting and copying manually.');
    }
}

// Copy Patient Summary to Clipboard
async function copyPatientSummaryToClipboard() {
    const patientText = patientSummaryDiv.innerText;
    
    // Check if there's actual content (not just placeholder)
    if (!patientText || patientText.includes('Generate a clinical summary first')) {
        alert('No patient summary to copy. Please generate a patient summary first.');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(patientText);
        
        // Visual feedback
        const originalText = copyPatientSummaryBtn.innerHTML;
        copyPatientSummaryBtn.innerHTML = '<span class="icon">✓</span> Copied!';
        copyPatientSummaryBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        
        // Reset after 2 seconds
        setTimeout(() => {
            copyPatientSummaryBtn.innerHTML = originalText;
            copyPatientSummaryBtn.style.background = '';
        }, 2000);
        
    } catch (error) {
        console.error('Failed to copy:', error);
        alert('Failed to copy to clipboard. Please try selecting and copying manually.');
    }
}

// Detect and Populate Microphone Dropdown
async function populateMicrophoneDropdown() {
    const dropdown = document.getElementById('microphoneDropdown');
    
    try {
        // Request microphone permission first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Stop the stream immediately - we just needed permission
        stream.getTracks().forEach(track => track.stop());
        
        // Get list of all media devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Filter for audio input devices
        const microphones = devices.filter(device => device.kind === 'audioinput');
        
        console.log('Found microphones:', microphones.length);
        
        // Clear dropdown
        dropdown.innerHTML = '';
        
        if (microphones.length === 0) {
            dropdown.innerHTML = '<option value="">No microphones found</option>';
            dropdown.disabled = true;
            return;
        }
        
        // Add each microphone to dropdown
        microphones.forEach((mic, index) => {
            const option = document.createElement('option');
            option.value = mic.deviceId;
            
            // Use device label or fallback to generic name
            const label = mic.label || `Microphone ${index + 1}`;
            option.textContent = label;
            
            // Select the default device
            if (mic.deviceId === 'default' || index === 0) {
                option.selected = true;
                selectedMicId = mic.deviceId;
            }
            
            dropdown.appendChild(option);
        });
        
        console.log('Microphone dropdown populated with', microphones.length, 'devices');
        
    } catch (error) {
        console.error('Error detecting microphones:', error);
        dropdown.innerHTML = '<option value="">Permission denied</option>';
        dropdown.disabled = true;
        
        if (error.name === 'NotAllowedError') {
            console.warn('Microphone permission denied');
        }
    }
}

// Handle Microphone Selection from Dropdown
function handleMicrophoneSelection() {
    const dropdown = document.getElementById('microphoneDropdown');
    selectedMicId = dropdown.value;
    
    const selectedOption = dropdown.options[dropdown.selectedIndex];
    console.log('Microphone selected:', selectedOption.textContent);
    
    // Show confirmation to user
    if (isRecording) {
        alert('Microphone changed! Please stop and restart recording to use the new microphone.');
    }
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
pauseBtn.addEventListener('click', pauseRecording);
stopBtn.addEventListener('click', stopRecording);
getSummaryBtn.addEventListener('click', generateSummary);
clearTranscriptBtn.addEventListener('click', clearTranscript);
copySummaryBtn.addEventListener('click', copySummaryToClipboard);
generateReferralBtn.addEventListener('click', generateReferralLetter);
copyReferralBtn.addEventListener('click', copyReferralToClipboard);
generatePatientSummaryBtn.addEventListener('click', generatePatientSummary);
copyPatientSummaryBtn.addEventListener('click', copyPatientSummaryToClipboard);

// Add microphone dropdown change listener
document.addEventListener('DOMContentLoaded', () => {
    const micDropdown = document.getElementById('microphoneDropdown');
    if (micDropdown) {
        micDropdown.addEventListener('change', handleMicrophoneSelection);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('AmbientDoc initialized with Whisper API');
    
    // Check for browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusDiv.textContent = 'Browser not supported';
        statusDiv.style.color = '#dc3545';
        startBtn.disabled = true;
    }
    
    // Check browser compression support
    checkBrowserCompression();
    
    // Populate microphone dropdown
    populateMicrophoneDropdown();
    
    // Setup editable content boxes
    setupEditableContent();
});

// Check if browser supports audio compression
function checkBrowserCompression() {
    const hasOpusSupport = MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
    const userAgent = navigator.userAgent;
    
    console.log('Opus codec support:', hasOpusSupport);
    
    // Detect Safari
    const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
    const isChrome = /chrome/i.test(userAgent) && !/edge/i.test(userAgent);
    const isFirefox = /firefox/i.test(userAgent);
    
    console.log('Browser:', isSafari ? 'Safari' : isChrome ? 'Chrome' : isFirefox ? 'Firefox' : 'Other');
    
    if (isSafari) {
        console.warn('⚠️ Safari detected: May not compress audio properly. Recording time may be limited to ~10 minutes.');
        console.warn('💡 For longer recordings, use Chrome, Edge, or Firefox.');
    }
    
    if (!hasOpusSupport) {
        console.warn('⚠️ Opus codec not supported. Audio compression may not work effectively.');
    }
}

// Setup editable content boxes
function setupEditableContent() {
    const editableBoxes = [transcriptDiv, summaryDiv, referralLetterDiv, patientSummaryDiv];
    
    editableBoxes.forEach(box => {
        // Remove placeholder text when user starts typing
        box.addEventListener('focus', function() {
            if (this.querySelector('.placeholder')) {
                // Don't remove placeholder, just let user type over it
            }
        });
        
        // Prevent editing placeholder text
        box.addEventListener('input', function() {
            const placeholder = this.querySelector('.placeholder');
            if (placeholder && this.textContent.trim() !== placeholder.textContent.trim()) {
                placeholder.remove();
            }
        });
    });
}
