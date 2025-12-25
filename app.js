// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptDiv = document.getElementById('transcript');
const summaryDiv = document.getElementById('summary');
const statusDiv = document.getElementById('status');
const getSummaryBtn = document.getElementById('getSummary');
const clearTranscriptBtn = document.getElementById('clearTranscript');
const copySummaryBtn = document.getElementById('copySummary');

// State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let finalTranscript = '';
let recordingStartTime = null;
let recordingTimer = null;
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
        
        // Stop timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // Stop recording
        mediaRecorder.stop();
        
        // Update UI
        statusDiv.textContent = 'Processing audio...';
        statusDiv.classList.remove('recording');
        startBtn.disabled = true; // Keep disabled while processing
        stopBtn.disabled = true;
        
        console.log('Recording stopped, sending to Whisper API');
    }
}

// Transcribe Audio using Whisper API
async function transcribeAudio(audioBlob) {
    try {
        statusDiv.textContent = '⏳ Transcribing with AI...';
        transcriptDiv.innerHTML = '<p class="placeholder">Transcribing your consultation...</p>';
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        
        reader.onloadend = async () => {
            const base64Audio = reader.result.split(',')[1];
            
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
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Transcription failed');
            }
            
            const data = await response.json();
            finalTranscript = data.transcript;
            
            // Display transcript
            transcriptDiv.innerHTML = `<p>${finalTranscript}</p>`;
            
            // Update UI
            statusDiv.textContent = 'Transcription complete!';
            statusDiv.classList.remove('recording');
            startBtn.disabled = false;
            stopBtn.disabled = true;
            
            // Show buttons
            if (finalTranscript.trim()) {
                clearTranscriptBtn.style.display = 'inline-block';
                getSummaryBtn.style.display = 'inline-flex';
            }
            
            console.log('Transcription complete');
        };
        
    } catch (error) {
        console.error('Transcription error:', error);
        statusDiv.textContent = 'Transcription failed';
        transcriptDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
        startBtn.disabled = false;
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

        // Display summary
        summaryDiv.innerHTML = `<p>${summary.replace(/\n/g, '<br>')}</p>`;
        
        // Show copy button
        copySummaryBtn.style.display = 'inline-flex';
        
    } catch (error) {
        console.error('Error generating summary:', error);
        summaryDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
    } finally {
        getSummaryBtn.disabled = false;
        getSummaryBtn.innerHTML = '<span class="icon">✨</span> Generate Summary';
    }
}

// Clear Transcript
function clearTranscript() {
    finalTranscript = '';
    audioChunks = [];
    transcriptDiv.innerHTML = '<p class="placeholder">Transcript will appear here when you start recording...</p>';
    summaryDiv.innerHTML = '<p class="placeholder">Summary will appear here after you stop recording...</p>';
    clearTranscriptBtn.style.display = 'none';
    getSummaryBtn.style.display = 'none';
    copySummaryBtn.style.display = 'none';
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

// Detect and Display Active Microphone
async function detectActiveMicrophone() {
    try {
        // Request microphone permission first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Stop the stream immediately - we just needed permission
        stream.getTracks().forEach(track => track.stop());
        
        // Get list of all media devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Filter for audio input devices
        const microphones = devices.filter(device => device.kind === 'audioinput');
        
        // Find the default/active device
        const activeDevice = microphones.find(d => d.deviceId === 'default') || microphones[0];
        
        // Update the label in the header
        const micLabel = document.getElementById('currentMicLabel');
        if (activeDevice && activeDevice.label) {
            micLabel.textContent = activeDevice.label;
        } else {
            micLabel.textContent = 'System Default';
        }
        
        console.log(`Active microphone: ${activeDevice?.label || 'Default'}`);
        console.log(`Total microphones found: ${microphones.length}`);
        
        return microphones;
        
    } catch (error) {
        console.error('Error detecting microphone:', error);
        const micLabel = document.getElementById('currentMicLabel');
        micLabel.textContent = 'Permission needed';
        return [];
    }
}

// Show Microphone Help Modal
async function showMicrophoneHelp() {
    const modal = document.getElementById('microphoneHelpModal');
    const modalMicLabel = document.getElementById('modalMicLabel');
    const availableMicsList = document.getElementById('availableMicsList');
    
    // Get current microphone info
    const microphones = await detectActiveMicrophone();
    
    // Update modal with current active mic
    const currentMicLabel = document.getElementById('currentMicLabel');
    modalMicLabel.textContent = currentMicLabel.textContent;
    
    // Populate available microphones list
    availableMicsList.innerHTML = '';
    if (microphones.length > 0) {
        microphones.forEach((mic, index) => {
            const li = document.createElement('li');
            li.textContent = mic.label || `Microphone ${index + 1}`;
            
            // Add click handler to select this mic
            li.style.cursor = 'pointer';
            li.onclick = () => {
                selectedMicId = mic.deviceId;
                alert(`Microphone selected: ${mic.label}.\n\nClick "Start Recording" to use this microphone.`);
                closeMicrophoneHelp();
            };
            
            availableMicsList.appendChild(li);
        });
    } else {
        availableMicsList.innerHTML = '<li>Unable to list devices. Grant microphone permission first.</li>';
    }
    
    // Show modal
    modal.classList.add('show');
}

// Close Microphone Help Modal
function closeMicrophoneHelp(event) {
    const modal = document.getElementById('microphoneHelpModal');
    modal.classList.remove('show');
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
getSummaryBtn.addEventListener('click', generateSummary);
clearTranscriptBtn.addEventListener('click', clearTranscript);
copySummaryBtn.addEventListener('click', copySummaryToClipboard);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('AmbientDoc initialized with Whisper API');
    
    // Check for browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusDiv.textContent = 'Browser not supported';
        statusDiv.style.color = '#dc3545';
        startBtn.disabled = true;
    }
    
    // Detect active microphone on page load
    detectActiveMicrophone();
});
