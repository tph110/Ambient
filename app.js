// File: app.js
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
let recordingStartTime = null;
let recordingTimer = null;
let pausedDuration = 0;
let pauseStartTime = null;
let selectedMicId = null;
let telephoneStreams = null;
let sizeMonitorInterval = null;
let hasShownSizeWarning = false;

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
        dropdown.innerHTML = '<option value="">Permission denied</option>';
    }
}

function handleMicrophoneSelection() {
    const dropdown = document.getElementById('microphoneDropdown');
    if (dropdown) selectedMicId = dropdown.value;
}

// --- RECORDING LOGIC ---

async function startRecording() {
    try {
        audioChunks = [];
        const telephoneMode = document.getElementById('telephoneModeCheckbox')?.checked;

        let stream;
        if (telephoneMode) {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true, 
                audio: { echoCancellation: true, noiseSuppression: true } 
            });
            const micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true 
            });
            
            const audioContext = new AudioContext();
            const destination = audioContext.createMediaStreamDestination();
            audioContext.createMediaStreamSource(micStream).connect(destination);
            if (screenStream.getAudioTracks().length > 0) {
                audioContext.createMediaStreamSource(screenStream).connect(destination);
            }
            stream = destination.stream;
            telephoneStreams = [screenStream, micStream];
        } else {
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true 
            });
        }

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = processRecording;
        mediaRecorder.start();
        
        isRecording = true;
        isPaused = false;
        recordingStartTime = Date.now();
        pausedDuration = 0;
        
        // CRITICAL FIX: Ensure buttons are enabled and visible
        enableControlButtons();
        updateUI();
        startTimer();
        startSizeMonitor();
    } catch (err) {
        console.error("Error starting recording:", err);
        alert("Could not start recording. Please check permissions.");
    }
}

function enableControlButtons() {
    // Explicitly remove disabled state and forbidden cursor
    [pauseBtn, stopBtn].forEach(btn => {
        if (btn) {
            btn.disabled = false;
            btn.style.pointerEvents = "auto";
            btn.style.opacity = "1";
        }
    });
}

function pauseRecording() {
    if (!mediaRecorder || !isRecording) return;

    if (!isPaused) {
        mediaRecorder.pause();
        isPaused = true;
        pauseStartTime = Date.now();
        clearInterval(recordingTimer);
    } else {
        mediaRecorder.resume();
        isPaused = false;
        pausedDuration += (Date.now() - pauseStartTime);
        startTimer();
    }
    updateUI();
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        isPaused = false;
        clearInterval(recordingTimer);
        clearInterval(sizeMonitorInterval);
        
        if (telephoneStreams) {
            telephoneStreams.forEach(s => s.getTracks().forEach(t => t.stop()));
            telephoneStreams = null;
        }
        updateUI();
    }
}

// --- TRANSCRIPTION & AI ---

async function processRecording() {
    statusDiv.textContent = "Transcribing medical audio...";
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
                finalTranscript = data.text;
                transcriptDiv.innerHTML = `<p>${finalTranscript}</p>`;
                statusDiv.textContent = "Transcription complete";
                getSummaryBtn.style.display = 'inline-block';
                clearTranscriptBtn.style.display = 'inline-block';
            }
        };
    } catch (err) {
        statusDiv.textContent = "Transcription failed";
        console.error(err);
    }
}

async function generateAIContent(type, targetDiv, button) {
    const originalText = button.innerText;
    button.innerText = "Processing...";
    button.disabled = true;

    const anonymize = document.getElementById('anonymizeCheckbox').checked;
    const contentToProcess = anonymize ? anonymizeTranscript(transcriptDiv.innerText) : transcriptDiv.innerText;

    try {
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: contentToProcess, type: type })
        });
        const data = await response.json();
        targetDiv.innerHTML = `<p>${data.summary.replace(/\n/g, '<br>')}</p>`;
    } catch (err) {
        console.error(err);
    } finally {
        button.innerText = originalText;
        button.disabled = false;
    }
}

function anonymizeTranscript(text) {
    return text
        .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, '[POSTCODE]')
        .replace(/\b\d{3}\s*\d{3}\s*\d{4}\b/g, '[NHS NUMBER]')
        .replace(/\b07\d{9}\b/g, '[PHONE]');
}

// --- UI HELPERS ---

function updateUI() {
    // Show/Hide buttons based on recording state
    startBtn.style.display = isRecording ? 'none' : 'inline-block';
    pauseBtn.style.display = isRecording ? 'inline-block' : 'none';
    stopBtn.style.display = isRecording ? 'inline-block' : 'none';
    
    // Toggle Pause/Resume text
    pauseBtn.innerText = isPaused ? "Resume" : "Pause";
    
    // Update Status text
    if (isRecording) {
        statusDiv.textContent = isPaused ? "Paused" : "Recording...";
    } else {
        statusDiv.textContent = "Ready";
    }
}

function startTimer() {
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime - pausedDuration;
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        const timerLabel = document.getElementById('timerElapsed');
        if (timerLabel) {
            timerLabel.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

function startSizeMonitor() {
    sizeMonitorInterval = setInterval(() => {
        if (audioChunks.length === 0) return;
        const size = new Blob(audioChunks).size / (1024 * 1024);
        const sizeLabel = document.getElementById('timerSize');
        if (sizeLabel) sizeLabel.innerText = `${size.toFixed(1)} MB`;
        
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            const percent = Math.min((size / 4) * 100, 100);
            progressBar.style.width = `${percent}%`;
        }
    }, 2000);
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    populateMicrophoneDropdown();
    initializeDarkMode();

    // Attach core listeners
    startBtn.addEventListener('click', startRecording);
    pauseBtn.addEventListener('click', pauseRecording);
    stopBtn.addEventListener('click', stopRecording);
    
    // AI Listeners
    getSummaryBtn.addEventListener('click', () => generateAIContent('clinical', summaryDiv, getSummaryBtn));
    generateReferralBtn.addEventListener('click', () => generateAIContent('referral', referralLetterDiv, generateReferralBtn));
    generatePatientSummaryBtn.addEventListener('click', () => generateAIContent('patient', patientSummaryDiv, generatePatientSummaryBtn));
    
    // Mic selection
    const micDropdown = document.getElementById('microphoneDropdown');
    if (micDropdown) {
        micDropdown.addEventListener('change', handleMicrophoneSelection);
    }
    
    // Initial UI state
    updateUI();
});

function initializeDarkMode() {
    const btn = document.getElementById('darkModeCheckbox');
    if (!btn) return;
    if (localStorage.getItem('darkMode') === 'enabled') document.body.classList.add('dark-mode');
    btn.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'enabled' : 'disabled');
    });
}
