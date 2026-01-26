// Letter Dictation App - dictation.js

// DOM Elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptDiv = document.getElementById('transcript');
const formattedLetterDiv = document.getElementById('formattedLetter');
const statusDiv = document.getElementById('status');
const formatLetterBtn = document.getElementById('formatLetterBtn'); // FIXED: Changed from 'formatLetter' to 'formatLetterBtn'
const clearTranscriptBtn = document.getElementById('clearTranscript');
const copyLetterBtn = document.getElementById('copyLetter');
const downloadLetterBtn = document.getElementById('downloadLetter');
const letterTypeSelect = document.getElementById('letterType');

// State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isPaused = false;
let finalTranscript = '';
let formattedLetter = '';
let recordingStartTime = null;
let recordingTimer = null;
let selectedMicId = null;

// --- MICROPHONE MANAGEMENT ---

async function populateMicrophoneDropdown() {
    const dropdown = document.getElementById('microphoneDropdown');
    if (!dropdown) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter(device => device.kind === 'audioinput');
        
        dropdown.innerHTML = '';
        if (microphones.length === 0) {
            dropdown.innerHTML = '<option value="">No microphones detected</option>';
            dropdown.disabled = true;
            return;
        }
        
        microphones.forEach((mic, index) => {
            const option = document.createElement('option');
            option.value = mic.deviceId;
            option.textContent = mic.label || `Microphone ${index + 1}`;
            if (mic.deviceId === 'default' || index === 0) {
                option.selected = true;
                selectedMicId = mic.deviceId;
            }
            dropdown.appendChild(option);
        });
    } catch (error) {
        console.error('Error detecting microphones:', error);
    }
}

function handleMicrophoneSelection() {
    const dropdown = document.getElementById('microphoneDropdown');
    if (dropdown) selectedMicId = dropdown.value;
}

// --- RECORDING LOGIC ---

async function startRecording() {
    try {
        const constraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        let options;
        const preferredCodecs = [
            { mimeType: 'audio/webm;codecs=opus' },
            { mimeType: 'audio/ogg;codecs=opus' },
            { mimeType: 'audio/webm' }
        ];

        for (const codec of preferredCodecs) {
            if (MediaRecorder.isTypeSupported(codec.mimeType)) {
                options = codec;
                break;
            }
        }

        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = processRecording;
        mediaRecorder.start(1000);
        
        isRecording = true;
        isPaused = false;
        recordingStartTime = Date.now();
        
        // Reset button state for new session
        if (formatLetterBtn) {
            formatLetterBtn.disabled = true;
        }

        updateUI();
        startTimer();
        
    } catch (err) {
        console.error("Error starting recording:", err);
        statusDiv.textContent = "Error: " + err.message;
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        isPaused = false;
        clearInterval(recordingTimer);
        updateUI();
    }
}

async function processRecording() {
    statusDiv.textContent = "Processing medical dictation...";
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    
    try {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            const base64Audio = reader.result.split(',')[1];
            
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioBlob: base64Audio })
            });

            if (!response.ok) {
                throw new Error(`Transcription failed: ${response.status}`);
            }

            const data = await response.json();
            if (data.text) {
                finalTranscript = data.text.trim();
                
                // Update Transcript Text
                transcriptDiv.innerHTML = `<p>${finalTranscript}</p>`;
                
                // ENABLE the Generate button
                if (formatLetterBtn) {
                    formatLetterBtn.disabled = false;
                    statusDiv.textContent = "Transcription ready. Click 'Generate Letter'.";
                }
            } else {
                throw new Error('No transcript returned from API');
            }
        };
    } catch (err) {
        console.error('Transcription error:', err);
        statusDiv.textContent = "Transcription failed: " + err.message;
        alert("Transcription failed. Please check your connection and try again.");
    }
}

// --- AI FORMATTING ---

async function formatLetter() {
    // 1. Grab text directly from the transcription box
    const transcriptBox = document.getElementById('transcript');
    const rawText = transcriptBox ? transcriptBox.innerText.trim() : "";

    // 2. Safety check: Don't run if empty or placeholder
    if (!rawText || rawText.includes("Your dictation will appear")) {
        alert("Please dictate some text first!");
        return;
    }

    // 3. UI Feedback
    const btn = formatLetterBtn;
    const outputArea = document.getElementById('formattedLetter');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = "⏳ AI is formatting...";
    btn.disabled = true;
    outputArea.style.opacity = "0.5";
    statusDiv.textContent = "Generating formatted letter...";

    try {
        const response = await fetch('/api/format-letter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transcript: rawText,
                letterType: document.getElementById('letterType').value
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.letter) {
            // Success! Update the UI
            outputArea.innerHTML = data.letter.replace(/\n/g, '<br>');
            statusDiv.textContent = "Letter generated successfully.";
            btn.innerHTML = "🔄 Regenerate Letter";
        } else {
            throw new Error('No letter returned from API');
        }
    } catch (err) {
        console.error("Error:", err);
        statusDiv.textContent = "Letter generation failed.";
        alert("AI formatting failed: " + err.message + "\n\nPlease check your connection and try again.");
    } finally {
        // Reset button
        btn.disabled = false;
        outputArea.style.opacity = "1";
    }
}

// --- UI HELPERS & LISTENERS ---

function updateUI() {
    startBtn.style.display = isRecording ? 'none' : 'flex';
    pauseBtn.style.display = isRecording ? 'flex' : 'none';
    stopBtn.style.display = isRecording ? 'flex' : 'none';
    statusDiv.textContent = isRecording ? (isPaused ? "Paused" : "Recording...") : "Ready";
    
    if (isRecording) {
        statusDiv.classList.add('recording');
    } else {
        statusDiv.classList.remove('recording');
    }
}

function startTimer() {
    const timerDisplay = document.getElementById('timerElapsed');
    if (recordingTimer) clearInterval(recordingTimer);
    
    recordingTimer = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        if (timerDisplay) timerDisplay.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

function copyLetter() {
    const text = formattedLetterDiv.innerText;
    if (!text || text.includes("Formatted letter will appear")) {
        alert("No letter to copy yet!");
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        const originalText = copyLetterBtn.innerHTML;
        copyLetterBtn.innerHTML = '✅';
        setTimeout(() => copyLetterBtn.innerHTML = originalText, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    populateMicrophoneDropdown();
    
    startBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    
    // FIXED: Attach event listener to the correct button
    if (formatLetterBtn) {
        formatLetterBtn.addEventListener('click', formatLetter);
    }
    
    if (copyLetterBtn) {
        copyLetterBtn.addEventListener('click', copyLetter);
    }
    
    // Clear functionality
    if (clearTranscriptBtn) {
        clearTranscriptBtn.addEventListener('click', () => {
            if (confirm("Clear transcription?")) {
                transcriptDiv.innerHTML = '<p class="placeholder">Your dictation will appear here...</p>';
                finalTranscript = '';
                if (formatLetterBtn) {
                    formatLetterBtn.disabled = true;
                }
            }
        });
    }
    
    const micDropdown = document.getElementById('microphoneDropdown');
    if (micDropdown) micDropdown.addEventListener('change', handleMicrophoneSelection);
    
    updateUI();
});
