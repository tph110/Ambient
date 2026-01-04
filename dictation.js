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

// Start Recording
async function startRecording() {
    try {
        const constraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Now that we have permission, refresh the microphone list
        await populateMicrophoneDropdown();
        
        // Use same codec as clinical scribe for consistency
        let options;
        const preferredCodecs = [
            { mimeType: 'audio/webm;codecs=opus', bitrate: 12000 },
            { mimeType: 'audio/ogg;codecs=opus', bitrate: 12000 },
            { mimeType: 'audio/webm', bitrate: 12000 }
        ];
        
        for (const codec of preferredCodecs) {
            if (MediaRecorder.isTypeSupported(codec.mimeType)) {
                options = {
                    mimeType: codec.mimeType,
                    audioBitsPerSecond: codec.bitrate
                };
                break;
            }
        }
        
        if (!options) {
            options = { audioBitsPerSecond: 12000 };
        }
        
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };
        
        mediaRecorder.start(1000);
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Update UI
        statusDiv.textContent = '🔴 Dictating...';
        statusDiv.classList.add('recording');
        startBtn.disabled = true;
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-flex';
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        
        // Start timer
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            statusDiv.textContent = `🔴 Dictating... ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
        
        console.log('Dictation started');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording. Please check microphone permissions.');
    }
}

// Stop Recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        isRecording = false;
        isPaused = false;
        
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        mediaRecorder.stop();
        
        statusDiv.textContent = 'Processing dictation...';
        statusDiv.classList.remove('recording');
        startBtn.disabled = true;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        
        console.log('Dictation stopped');
    }
}

// Pause/Resume Recording
function pauseRecording() {
    if (mediaRecorder && isRecording && !isPaused) {
        mediaRecorder.pause();
        isPaused = true;
        
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        statusDiv.textContent = 'Dictation Paused';
        statusDiv.classList.remove('recording');
        pauseBtn.innerHTML = '<span class="resume-icon"></span><span>Resume</span>';
        
    } else if (mediaRecorder && isPaused) {
        mediaRecorder.resume();
        isPaused = false;
        
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            statusDiv.textContent = `🔴 Dictating... ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
        
        statusDiv.classList.add('recording');
        pauseBtn.innerHTML = '<span class="pause-icon"></span><span>Pause</span>';
    }
}

// Transcribe Audio using Azure Speech
async function transcribeAudio(audioBlob) {
    try {
        statusDiv.textContent = '⏳ Transcribing dictation...';
        transcriptDiv.innerHTML = '<p class="placeholder">Transcribing...</p>';
        
        console.log('Converting to WAV...');
        const wavBlob = await convertToWav(audioBlob);
        
        // Convert WAV to base64
        const reader = new FileReader();
        reader.readAsDataURL(wavBlob);
        
        reader.onloadend = async () => {
            const base64Audio = reader.result.split(',')[1];
            
            // Call transcription API
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
            
            if (!finalTranscript || finalTranscript.trim() === '') {
                throw new Error('Empty transcript received');
            }
            
            // Display transcript
            transcriptDiv.innerHTML = `<p>${finalTranscript}</p>`;
            
            // Update UI
            statusDiv.textContent = 'Transcription complete! Click "Format as Letter" to continue.';
            statusDiv.classList.remove('recording');
            
            startBtn.style.display = 'inline-flex';
            startBtn.disabled = false;
            pauseBtn.style.display = 'none';
            stopBtn.disabled = true;
            
            // Show buttons
            clearTranscriptBtn.style.display = 'inline-block';
            formatLetterBtn.style.display = 'inline-flex';
            
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

// Format Letter using AI
async function formatLetter() {
    if (!finalTranscript.trim()) {
        alert('No transcript available to format');
        return;
    }
    
    formatLetterBtn.disabled = true;
    formatLetterBtn.innerHTML = '<span class="loading-spinner"></span> Formatting...';
    formattedLetterDiv.innerHTML = '<p style="color: #667eea;">Formatting letter...</p>';
    
    try {
        const letterType = letterTypeSelect.value;
        
        // Call formatting API
        const response = await fetch('/api/format-letter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transcript: finalTranscript,
                letterType: letterType
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Formatting failed');
        }
        
        const data = await response.json();
        formattedLetter = data.letter;
        
        // Display formatted letter
        formattedLetterDiv.innerHTML = `<div>${formattedLetter.replace(/\n/g, '<br>')}</div>`;
        
        // Show copy and download buttons
        copyLetterBtn.style.display = 'inline-flex';
        downloadLetterBtn.style.display = 'inline-flex';
        
        formatLetterBtn.disabled = false;
        formatLetterBtn.innerHTML = '✓ Letter Formatted';
        
        console.log('Letter formatted successfully');
        
    } catch (error) {
        console.error('Formatting error:', error);
        formattedLetterDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
        formatLetterBtn.disabled = false;
        formatLetterBtn.innerHTML = 'Format as Letter';
    }
}

// Copy Letter to Clipboard
async function copyLetter() {
    const letterText = formattedLetterDiv.innerText;
    
    if (!letterText || letterText.includes('Formatted letter will appear')) {
        alert('No letter to copy');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(letterText);
        
        const originalText = copyLetterBtn.innerHTML;
        copyLetterBtn.innerHTML = '✓ Copied!';
        copyLetterBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        
        setTimeout(() => {
            copyLetterBtn.innerHTML = originalText;
            copyLetterBtn.style.background = '';
        }, 2000);
        
    } catch (error) {
        console.error('Copy failed:', error);
        alert('Failed to copy. Please select and copy manually.');
    }
}

// Download Letter as Word Document
async function downloadLetter() {
    const letterText = formattedLetterDiv.innerText;
    
    if (!letterText || letterText.includes('Formatted letter will appear')) {
        alert('No letter to download');
        return;
    }
    
    try {
        // Create simple .docx format
        // For now, download as .txt (you can enhance to proper Word format later)
        const blob = new Blob([letterText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `letter-${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('Letter downloaded');
        
    } catch (error) {
        console.error('Download failed:', error);
        alert('Failed to download letter');
    }
}

// Clear Transcript
function clearTranscript() {
    finalTranscript = '';
    formattedLetter = '';
    audioChunks = [];
    
    transcriptDiv.innerHTML = '<p class="placeholder">Your dictation will appear here as raw text...</p>';
    formattedLetterDiv.innerHTML = '<p class="placeholder">Formatted letter will appear here...</p>';
    
    clearTranscriptBtn.style.display = 'none';
    formatLetterBtn.style.display = 'none';
    copyLetterBtn.style.display = 'none';
    downloadLetterBtn.style.display = 'none';
    
    statusDiv.textContent = 'Ready to dictate';
}

// WAV Conversion Functions (copied from main app)
async function convertToWav(webmBlob) {
    return new Promise((resolve, reject) => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000
        });
        
        const reader = new FileReader();
        reader.readAsArrayBuffer(webmBlob);
        
        reader.onload = async () => {
            try {
                const audioBuffer = await audioContext.decodeAudioData(reader.result);
                const channelData = audioBuffer.getChannelData(0);
                const wavData = encodeWav(channelData, audioBuffer.sampleRate);
                const wavBlob = new Blob([wavData], { type: 'audio/wav' });
                resolve(wavBlob);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Failed to read audio'));
    });
}

function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }
    
    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Populate Microphone Dropdown
async function populateMicrophoneDropdown() {
    const dropdown = document.getElementById('microphoneDropdown');
    
    try {
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
        dropdown.disabled = true;
    }
}

// Handle Microphone Selection
function handleMicrophoneSelection() {
    const dropdown = document.getElementById('microphoneDropdown');
    selectedMicId = dropdown.value;
    console.log('Microphone selected:', dropdown.options[dropdown.selectedIndex].textContent);
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
pauseBtn.addEventListener('click', pauseRecording);
stopBtn.addEventListener('click', stopRecording);
formatLetterBtn.addEventListener('click', formatLetter);
clearTranscriptBtn.addEventListener('click', clearTranscript);
copyLetterBtn.addEventListener('click', copyLetter);
downloadLetterBtn.addEventListener('click', downloadLetter);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Letter Dictation initialized');
    
    // Populate microphone dropdown
    populateMicrophoneDropdown();
    
    // Add microphone change listener
    const micDropdown = document.getElementById('microphoneDropdown');
    if (micDropdown) {
        micDropdown.addEventListener('change', handleMicrophoneSelection);
    }
});
