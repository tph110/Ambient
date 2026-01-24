// Letter Dictation App - dictation.js

// DOM Elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptDiv = document.getElementById('transcript');
const formattedLetterDiv = document.getElementById('formattedLetter');
const statusDiv = document.getElementById('status');
const formatLetterBtn = document.getElementById('formatLetter');
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
        // PERMISSION HANDSHAKE: Request access briefly to unlock device labels (names)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop tracks immediately so the recording light turns off
        stream.getTracks().forEach(track => track.stop());

        // Now that permission is granted, enumerateDevices will return real names
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
            // Use the real label if available, otherwise fallback to "Microphone X"
            option.textContent = mic.label || `Microphone ${index + 1}`;
            
            if (mic.deviceId === 'default' || index === 0) {
                option.selected = true;
                selectedMicId = mic.deviceId;
            }
            dropdown.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error detecting microphones:', error);
        dropdown.innerHTML = '<option value="">Permission denied</option>';
        dropdown.disabled = true;
    }
}

function handleMicrophoneSelection() {
    const dropdown = document.getElementById('microphoneDropdown');
    if (dropdown) {
        selectedMicId = dropdown.value;
        console.log('Microphone selected:', dropdown.options[dropdown.selectedIndex].textContent);
    }
}

// --- RECORDING LOGIC ---

async function startRecording() {
    try {
        const constraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Refresh names again just in case a new device was plugged in
        await populateMicrophoneDropdown();
        
        // Use same medical-grade codec settings as main scribe
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
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = processRecording;

        mediaRecorder.start(1000); // Collect data every second
        isRecording = true;
        isPaused = false;
        recordingStartTime = Date.now();
        updateUI();
        startTimer();
        
    } catch (err) {
        console.error("Error starting recording:", err);
        statusDiv.textContent = "Error: " + err.message;
    }
}

function pauseRecording() {
    if (mediaRecorder && isRecording) {
        if (!isPaused) {
            mediaRecorder.pause();
            isPaused = true;
            clearInterval(recordingTimer);
            statusDiv.textContent = "Recording paused";
        } else {
            mediaRecorder.resume();
            isPaused = false;
            startTimer();
            statusDiv.textContent = "Recording...";
        }
        updateUI();
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
    statusDiv.textContent = "Processing audio...";
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

            const data = await response.json();
            if (data.text) {
                // Prepend or append new transcription to existing content
                const newText = data.text.trim();
                finalTranscript = finalTranscript ? finalTranscript + " " + newText : newText;
                
                // Keep the placeholder logic intact
                const placeholder = transcriptDiv.querySelector('.placeholder');
                if (placeholder) placeholder.remove();
                
                transcriptDiv.innerHTML = `<p>${finalTranscript}</p>`;
                statusDiv.textContent = "Transcription complete";
            }
        };
    } catch (err) {
        console.error("Transcription error:", err);
        statusDiv.textContent = "Transcription failed";
    }
}

// --- AI FORMATTING ---

async function formatLetter() {
    if (!finalTranscript) {
        alert("Please record some dictation first.");
        return;
    }

    const originalBtnText = formatLetterBtn.innerHTML;
    formatLetterBtn.innerHTML = '<span>Formatting...</span>';
    formatLetterBtn.disabled = true;
    statusDiv.textContent = "AI is formatting your letter...";

    try {
        const response = await fetch('/api/format-letter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transcript: finalTranscript,
                letterType: letterTypeSelect.value
            })
        });

        const data = await response.json();
        
        if (data.formattedLetter) {
            formattedLetter = data.formattedLetter;
            
            // Clean up placeholder
            const placeholder = formattedLetterDiv.querySelector('.placeholder');
            if (placeholder) placeholder.remove();
            
            formattedLetterDiv.innerHTML = `<div class="letter-content">${formattedLetter.replace(/\n/g, '<br>')}</div>`;
            statusDiv.textContent = "Letter formatted successfully";
        } else {
            throw new Error(data.error || "Failed to format letter");
        }
    } catch (err) {
        console.error("Formatting error:", err);
        statusDiv.textContent = "Formatting failed";
        alert("Error: " + err.message);
    } finally {
        formatLetterBtn.innerHTML = originalBtnText;
        formatLetterBtn.disabled = false;
    }
}

// --- UI HELPERS ---

function updateUI() {
    startBtn.style.display = isRecording ? 'none' : 'flex';
    pauseBtn.style.display = isRecording ? 'flex' : 'none';
    stopBtn.style.display = isRecording ? 'flex' : 'none';
    
    pauseBtn.innerHTML = isPaused ? 
        '<span class="btn-icon">▶</span><span>Resume</span>' : 
        '<span class="btn-icon">⏸</span><span>Pause</span>';
    
    statusDiv.textContent = isRecording ? (isPaused ? "Recording paused" : "Recording...") : "Ready";
}

function startTimer() {
    const startTime = recordingStartTime || Date.now();
    recordingTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        const timerDisplay = document.getElementById('timerElapsed');
        if (timerDisplay) {
            timerDisplay.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

function clearTranscript() {
    if (confirm("Are you sure you want to clear the transcript?")) {
        finalTranscript = '';
        transcriptDiv.innerHTML = '<p class="placeholder">Your dictated text will appear here...</p>';
        formattedLetterDiv.innerHTML = '<p class="placeholder">Your formatted letter will appear here...</p>';
        statusDiv.textContent = "Cleared";
    }
}

function copyLetter() {
    const text = formattedLetterDiv.innerText;
    if (!text || text.includes("Your formatted letter")) return;
    
    navigator.clipboard.writeText(text).then(() => {
        const originalText = copyLetterBtn.innerHTML;
        copyLetterBtn.innerHTML = '<span>Copied!</span>';
        setTimeout(() => copyLetterBtn.innerHTML = originalText, 2000);
    });
}

function downloadLetter() {
    const text = formattedLetterDiv.innerText;
    if (!text || text.includes("Your formatted letter")) return;
    
    const element = document.createElement('a');
    const file = new Blob([text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `Medical_Letter_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    console.log('Letter Dictation initialized');
    
    // Populate microphone dropdown immediately
    populateMicrophoneDropdown();
    
    // Event Listeners
    startBtn.addEventListener('click', startRecording);
    pauseBtn.addEventListener('click', pauseRecording);
    stopBtn.addEventListener('click', stopRecording);
    formatLetterBtn.addEventListener('click', formatLetter);
    clearTranscriptBtn.addEventListener('click', clearTranscript);
    copyLetterBtn.addEventListener('click', copyLetter);
    downloadLetterBtn.addEventListener('click', downloadLetter);

    const micDropdown = document.getElementById('microphoneDropdown');
    if (micDropdown) {
        micDropdown.addEventListener('change', handleMicrophoneSelection);
    }
});
