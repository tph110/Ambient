// DOM Elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptDiv = document.getElementById('transcript');
const summaryDiv = document.getElementById('summary');
const referralLetterDiv = document.getElementById('referralLetter');
const statusDiv = document.getElementById('status');
const getSummaryBtn = document.getElementById('getSummary');
const clearTranscriptBtn = document.getElementById('clearTranscript');
const copySummaryBtn = document.getElementById('copySummary');
const generateReferralBtn = document.getElementById('generateReferral');
const copyReferralBtn = document.getElementById('copyReferral');

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

// Start Recording with MediaRecorder
async function startRecording() {
    try {
        // Request microphone access
        const constraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        // Collect audio data
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        // Handle recording stop
        mediaRecorder.onstop = async () => {
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Create audio blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
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
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                    console.error('API error:', errorData);
                } catch (e) {
                    const errorText = await response.text();
                    console.error('API error (text):', errorText);
                    errorMessage = errorText || errorMessage;
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
    
    clearTranscriptBtn.style.display = 'none';
    getSummaryBtn.style.display = 'none';
    copySummaryBtn.style.display = 'none';
    generateReferralBtn.style.display = 'none';
    copyReferralBtn.style.display = 'none';
    
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
    
    // Populate microphone dropdown
    populateMicrophoneDropdown();
});
