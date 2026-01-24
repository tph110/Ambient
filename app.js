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
let sizeMonitorInterval = null;  // Monitor recording size
let currentRecordingSize = 0;  // Track current size
let hasShownSizeWarning = false;  // Track if warning shown

// Audio bars (3-bar compact indicator)
let audioContext = null;
let analyser = null;
let dataArray = null;
let visualizerStream = null;
let visualizerAnimationId = null;

// Size limits (in bytes)
const SIZE_WARNING_THRESHOLD = 3 * 1024 * 1024;  // 3MB - show warning
const SIZE_MAX_LIMIT = 4 * 1024 * 1024;  // 4MB - auto-stop
const SIZE_SAFE_LIMIT = 4.2 * 1024 * 1024;  // 4.2MB - absolute max before data loss

// ==========================================
// ANONYMIZATION FUNCTION
// ==========================================

function anonymizeTranscript(text) {
    let anonymized = text;
    const redactions = [];
    const detectedNames = new Set();
    
    const greetingPattern = /\b(Hi|Hello|Good morning|Good afternoon|Good evening|Hey|Morning|Evening)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi;
    anonymized = anonymized.replace(greetingPattern, (match, greeting, name) => {
        const firstName = name.split(' ')[0];
        if (name.length > 2 && !['Doctor', 'Dr', 'Nurse', 'The', 'There', 'This', 'That'].includes(firstName)) {
            detectedNames.add(name);
            detectedNames.add(firstName);
            redactions.push(`Name from greeting: ${name}`);
            return `${greeting} [PATIENT NAME]`;
        }
        return match;
    });
    
    const nameIntroPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+speaking\b/g;
    anonymized = anonymized.replace(nameIntroPattern, (match, name) => {
        if (name.length > 2) {
            detectedNames.add(name);
            const firstName = name.split(' ')[0];
            detectedNames.add(firstName);
            redactions.push(`Name from intro: ${name}`);
            return '[PATIENT NAME] speaking';
        }
        return match;
    });
    
    const doctorPattern = /\b(Dr\.?|Doctor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    anonymized = anonymized.replace(doctorPattern, (match, title, name) => {
        if (name.length > 2) {
            detectedNames.add(name);
            const firstName = name.split(' ')[0];
            detectedNames.add(firstName);
            redactions.push(`Doctor name: ${name}`);
            return `${title} [CLINICIAN NAME]`;
        }
        return match;
    });
    
    detectedNames.forEach(name => {
        if (name.length > 2) {
            const namePattern = new RegExp(`\\b${name}\\b`, 'gi');
            const matches = anonymized.match(namePattern);
            if (matches && matches.length > 0) {
                redactions.push(`Replaced "${name}" ${matches.length} time(s) throughout transcript`);
                anonymized = anonymized.replace(namePattern, '[PATIENT NAME]');
            }
        }
    });
    
    const postcodePattern = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/g;
    anonymized = anonymized.replace(postcodePattern, (match) => {
        redactions.push(`Postcode: ${match}`);
        return '[POSTCODE]';
    });
    
    const streetPattern = /\b(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Road|Lane|Avenue|Drive|Close|Way|Gardens|Court|Place|Square|Terrace|Hill|Green|Park))\b/g;
    anonymized = anonymized.replace(streetPattern, (match) => {
        redactions.push(`Address: ${match}`);
        return '[STREET ADDRESS]';
    });
    
    const phonePattern = /\b(?:\+44\s?|0)(?:\d\s?){9,10}\b/g;
    anonymized = anonymized.replace(phonePattern, (match) => {
        redactions.push(`Phone: ${match}`);
        return '[PHONE NUMBER]';
    });
    
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    anonymized = anonymized.replace(emailPattern, (match) => {
        redactions.push(`Email: ${match}`);
        return '[EMAIL ADDRESS]';
    });
    
    const nhsNumberPattern = /\b\d{3}\s?\d{3}\s?\d{4}\b/g;
    anonymized = anonymized.replace(nhsNumberPattern, (match) => {
        redactions.push(`NHS Number: ${match}`);
        return '[NHS NUMBER]';
    });
    
    const dobPattern = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})\b/gi;
    anonymized = anonymized.replace(dobPattern, (match) => {
        redactions.push(`DOB: ${match}`);
        return '[DATE OF BIRTH]';
    });
    
    return anonymized;
}

// Audio Visualizer Functions
async function startAudioBars() {
    try {
        const audioBars = document.getElementById('audioBars');
        const bar1 = document.getElementById('audioBar1');
        const bar2 = document.getElementById('audioBar2');
        const bar3 = document.getElementById('audioBar3');
        if (!audioBars || !bar1 || !bar2 || !bar3) return;
        audioBars.style.display = 'flex';
        const constraints = { audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true };
        visualizerStream = await navigator.mediaDevices.getUserMedia(constraints);
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(visualizerStream);
        analyser.fftSize = 32;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        source.connect(analyser);
        updateAudioBars(bar1, bar2, bar3, analyser, dataArray);
    } catch (error) {
        console.error('Error starting audio bars:', error);
    }
}

function updateAudioBars(bar1, bar2, bar3, analyser, dataArray) {
    function update() {
        visualizerAnimationId = requestAnimationFrame(update);
        analyser.getByteFrequencyData(dataArray);
        const low = dataArray.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
        const mid = dataArray.slice(5, 10).reduce((a, b) => a + b, 0) / 5;
        const high = dataArray.slice(10, 16).reduce((a, b) => a + b, 0) / 6;
        bar1.className = 'audio-bar';
        if (low > 100) bar1.classList.add('active-high');
        else if (low > 50) bar1.classList.add('active-medium');
        else if (low > 20) bar1.classList.add('active-low');
        bar2.className = 'audio-bar';
        if (mid > 100) bar2.classList.add('active-high');
        else if (mid > 50) bar2.classList.add('active-medium');
        else if (mid > 20) bar2.classList.add('active-low');
        bar3.className = 'audio-bar';
        if (high > 100) bar3.classList.add('active-high');
        else if (high > 50) bar3.classList.add('active-medium');
        else if (high > 20) bar3.classList.add('active-low');
    }
    update();
}

function stopAudioBars() {
    if (visualizerAnimationId) { cancelAnimationFrame(visualizerAnimationId); visualizerAnimationId = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (visualizerStream) { visualizerStream.getTracks().forEach(track => track.stop()); visualizerStream = null; }
    const audioBars = document.getElementById('audioBars');
    if (audioBars) audioBars.style.display = 'none';
}

async function setupTelephoneRecording() {
    try {
        const micConstraints = { audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true };
        const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
        const systemStream = await navigator.mediaDevices.getDisplayMedia({
            video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);
        const audioTracks = systemStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const systemSource = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
            systemSource.connect(destination);
        }
        return { mixedStream: destination.stream, systemStream: systemStream, micStream: micStream, audioContext: audioContext };
    } catch (error) {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { mixedStream: micStream, systemStream: null, micStream: micStream, audioContext: null };
    }
}

function checkRecordingSize() {
    const sizeMB = (currentRecordingSize / (1024 * 1024)).toFixed(1);
    updateRecordingTimer();
    if (currentRecordingSize >= SIZE_WARNING_THRESHOLD && !hasShownSizeWarning) {
        hasShownSizeWarning = true;
        statusDiv.style.backgroundColor = '#fbbf24';
        statusDiv.textContent = `⚠️ Warning: Recording size ${sizeMB}MB. Approaching limit!`;
    }
    if (currentRecordingSize >= SIZE_MAX_LIMIT) {
        stopRecording();
        alert(`Recording auto-stopped at ${sizeMB}MB to prevent data loss.`);
    }
}

function updateRecordingTimer() {
    const timerDiv = document.getElementById('recordingTimer');
    if (!timerDiv || timerDiv.style.display === 'none') return;
    const now = Date.now();
    const elapsed = Math.floor((now - recordingStartTime - pausedDuration) / 1000);
    const sizeMB = (currentRecordingSize / (1024 * 1024)).toFixed(1);
    const percentage = Math.min((currentRecordingSize / SIZE_MAX_LIMIT) * 100, 100);
    document.getElementById('timerElapsed').textContent = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;
    document.getElementById('timerSize').textContent = `${sizeMB} MB`;
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${percentage}%`;
}

async function startRecording() {
    try {
        const telephoneModeCheckbox = document.getElementById('telephoneModeCheckbox');
        let finalStream;
        if (telephoneModeCheckbox.checked) {
            telephoneStreams = await setupTelephoneRecording();
            finalStream = telephoneStreams.mixedStream;
        } else {
            finalStream = await navigator.mediaDevices.getUserMedia({ audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true });
        }
        mediaRecorder = new MediaRecorder(finalStream, { audioBitsPerSecond: 12000 });
        audioChunks = [];
        currentRecordingSize = 0;
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
                currentRecordingSize += e.data.size;
                checkRecordingSize();
            }
        };
        mediaRecorder.onstop = async () => {
            finalStream.getTracks().forEach(track => track.stop());
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };
        mediaRecorder.start(1000);
        isRecording = true;
        recordingStartTime = Date.now();
        startAudioBars();
        document.getElementById('recordingTimer').style.display = 'block';
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime - pausedDuration) / 1000);
            statusDiv.textContent = `🔴 Recording... ${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;
        }, 1000);
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-flex';
        stopBtn.disabled = false;
        updateButtonColors();
    } catch (error) { console.error(error); }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        isRecording = false;
        clearInterval(recordingTimer);
        stopAudioBars();
        document.getElementById('recordingTimer').style.display = 'none';
        mediaRecorder.stop();
        statusDiv.textContent = 'Processing audio...';
    }
}

function pauseRecording() {
    if (mediaRecorder && isRecording && !isPaused) {
        mediaRecorder.pause();
        isPaused = true;
        pauseStartTime = Date.now();
        statusDiv.textContent = 'Recording Paused';
    } else if (mediaRecorder && isPaused) {
        mediaRecorder.resume();
        isPaused = false;
        pausedDuration += Date.now() - pauseStartTime;
    }
}

async function transcribeAudio(audioBlob) {
    statusDiv.textContent = '⏳ Transcribing with AI...';
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
        finalTranscript = data.text;
        transcriptDiv.innerHTML = `<p>${finalTranscript}</p>`;
        statusDiv.textContent = 'Transcription complete!';
        startBtn.style.display = 'inline-flex';
        pauseBtn.style.display = 'none';
        getSummaryBtn.style.display = 'inline-flex';
    };
}

async function generateSummary() {
    if (!finalTranscript.trim()) return;
    getSummaryBtn.disabled = true;
    const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: anonymizeTranscript(finalTranscript) })
    });
    const data = await response.json();
    finalSummary = data.summary;
    summaryDiv.innerHTML = `<p>${finalSummary.replace(/\n/g, '<br>')}</p>`;
    copySummaryBtn.style.display = 'inline-flex';
    generateReferralBtn.style.display = 'inline-flex';
    generatePatientSummaryBtn.style.display = 'inline-flex';
    getSummaryBtn.disabled = false;
}

// ==========================================
// UPDATED REFERRAL & PATIENT FUNCTIONS
// ==========================================

async function generateReferralLetter() {
    const summaryContent = summaryDiv.innerText.trim();
    
    const isPlaceholder = 
        !summaryContent ||
        summaryContent === '' ||
        summaryContent === 'Type or paste consultation details here, or record audio to generate an AI summary' ||
        summaryContent === 'An AI-generated summary will appear here once you have finished recording' ||
        summaryContent.startsWith('Type or paste') ||
        summaryContent.startsWith('An AI-generated') ||
        summaryContent.length < 10;
    
    if (isPlaceholder) {
        alert('Please enter consultation details in the Clinical Summary box first.');
        return;
    }
    
    console.log('Generating referral letter from summary...');
    console.log('Summary content length:', summaryContent.length, 'characters');

    generateReferralBtn.disabled = true;
    generateReferralBtn.innerHTML = '<span class="loading-spinner"></span> Generating...';
    referralLetterDiv.innerHTML = '<p style="color: #667eea;"><span class="loading-spinner"></span>Generating referral letter...</p>';

    try {
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transcript: summaryContent,
                type: 'referral'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'API request failed: ' + response.status);
        }

        const data = await response.json();
        const referralLetter = data.summary;

        referralLetterDiv.innerHTML = '<p>' + referralLetter.replace(/\n/g, '<br>') + '</p>';
        
        copyReferralBtn.style.display = 'inline-flex';
        
        generateReferralBtn.disabled = false;
        generateReferralBtn.innerHTML = '✓ Referral Complete';
        
        console.log('Referral letter generated successfully');
        
    } catch (error) {
        console.error('Error generating referral letter:', error);
        referralLetterDiv.innerHTML = '<p style="color: #dc3545;">Error: ' + error.message + '</p>';
        
        generateReferralBtn.disabled = false;
        generateReferralBtn.innerHTML = 'Generate Referral Letter';
    }
}

async function generatePatientSummary() {
    const summaryContent = summaryDiv.innerText.trim();
    
    const isPlaceholder = 
        !summaryContent ||
        summaryContent === '' ||
        summaryContent === 'Type or paste consultation details here, or record audio to generate an AI summary' ||
        summaryContent === 'An AI-generated summary will appear here once you have finished recording' ||
        summaryContent.startsWith('Type or paste') ||
        summaryContent.startsWith('An AI-generated') ||
        summaryContent.length < 10;
    
    if (isPlaceholder) {
        alert('Please enter consultation details in the Clinical Summary box first.');
        return;
    }
    
    console.log('Generating patient summary from clinical summary...');
    console.log('Summary content length:', summaryContent.length, 'characters');

    generatePatientSummaryBtn.disabled = true;
    generatePatientSummaryBtn.innerHTML = '<span class="loading-spinner"></span> Generating...';
    patientSummaryDiv.innerHTML = '<p style="color: #667eea;"><span class="loading-spinner"></span>Generating patient-friendly summary...</p>';

    try {
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transcript: summaryContent,
                type: 'patient'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'API request failed: ' + response.status);
        }

        const data = await response.json();
        const patientSummary = data.summary;

        patientSummaryDiv.innerHTML = '<p>' + patientSummary.replace(/\n/g, '<br>') + '</p>';
        
        copyPatientSummaryBtn.style.display = 'inline-flex';
        
        generatePatientSummaryBtn.disabled = false;
        generatePatientSummaryBtn.innerHTML = '✓ Patient Summary Complete';
        
        console.log('Patient summary generated successfully');
        
    } catch (error) {
        console.error('Error generating patient summary:', error);
        patientSummaryDiv.innerHTML = '<p style="color: #dc3545;">Error: ' + error.message + '</p>';
        
        generatePatientSummaryBtn.disabled = false;
        generatePatientSummaryBtn.innerHTML = 'Generate Patient Summary';
    }
}

// ==========================================
// PLACEHOLDER REMOVAL LOGIC
// ==========================================

function setupSummaryBoxPlaceholderRemoval() {
    summaryDiv.addEventListener('input', function() {
        const placeholder = this.querySelector('.placeholder');
        if (placeholder) {
            const textContent = this.innerText.trim();
            if (textContent && textContent.length > 0) {
                placeholder.remove();
                console.log('Placeholder removed - user is typing');
            }
        }
    });
    
    summaryDiv.addEventListener('paste', function(e) {
        setTimeout(function() {
            const placeholder = document.getElementById('summary').querySelector('.placeholder');
            if (placeholder) {
                placeholder.remove();
                console.log('Placeholder removed - user pasted content');
            }
        }, 10);
    });
}

function clearTranscript() {
    finalTranscript = ''; finalSummary = '';
    transcriptDiv.innerHTML = '<p class="placeholder">Transcription will appear here...</p>';
    summaryDiv.innerHTML = '<p class="placeholder">An AI-generated summary will appear here...</p>';
}

async function copyToClipboard(div, btn) {
    await navigator.clipboard.writeText(div.innerText);
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
pauseBtn.addEventListener('click', pauseRecording);
stopBtn.addEventListener('click', stopRecording);
getSummaryBtn.addEventListener('click', generateSummary);
generateReferralBtn.addEventListener('click', generateReferralLetter);
generatePatientSummaryBtn.addEventListener('click', generatePatientSummary);
copySummaryBtn.addEventListener('click', () => copyToClipboard(summaryDiv, copySummaryBtn));
copyReferralBtn.addEventListener('click', () => copyToClipboard(referralLetterDiv, copyReferralBtn));
copyPatientSummaryBtn.addEventListener('click', () => copyToClipboard(patientSummaryDiv, copyPatientSummaryBtn));

function updateButtonColors() { /* Visual Updates */ }

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('EchoDoc initialized');
    
    // Populate microphone dropdown
    populateMicrophoneDropdown();
    
    setupEditableContent();
    setupSummaryBoxPlaceholderRemoval();
    
    // Setup microphone dropdown listener
    const micDropdown = document.getElementById('microphoneDropdown');
    if (micDropdown) {
        micDropdown.addEventListener('change', handleMicrophoneSelection);
    }
});

function setupEditableContent() {
    [transcriptDiv, summaryDiv, referralLetterDiv, patientSummaryDiv].forEach(box => {
        box.addEventListener('input', function() {
            const p = this.querySelector('.placeholder');
            if (p && this.textContent.trim() !== p.textContent.trim()) p.remove();
        });
    });
}

function initializeDarkMode() {
    const btn = document.getElementById('darkModeCheckbox');
    if (!btn) return;
    if (localStorage.getItem('darkMode') === 'enabled') document.body.classList.add('dark-mode');
    btn.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'enabled' : 'disabled');
    });
}
initializeDarkMode();
