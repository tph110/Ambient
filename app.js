// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptDiv = document.getElementById('transcript');
const summaryDiv = document.getElementById('summary');
const statusDiv = document.getElementById('status');
const getSummaryBtn = document.getElementById('getSummary');
const clearTranscriptBtn = document.getElementById('clearTranscript');

// State
let recognition = null;
let isRecording = false;
let finalTranscript = '';

// Initialize Speech Recognition
function initializeSpeechRecognition() {
    // Check if browser supports Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert('Sorry, your browser does not support speech recognition. Please use Chrome, Edge, or Safari.');
        return null;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        console.log('Speech recognition started');
        isRecording = true;
        statusDiv.textContent = '🔴 Recording...';
        statusDiv.classList.add('recording');
        startBtn.disabled = true;
        stopBtn.disabled = false;
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        // Display transcript with interim results in gray
        transcriptDiv.innerHTML = `
            <p>${finalTranscript}</p>
            <p style="color: #999;">${interimTranscript}</p>
        `;
        
        // Auto-scroll to bottom
        transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
        
        // Show clear button if there's content
        if (finalTranscript.trim()) {
            clearTranscriptBtn.style.display = 'inline-block';
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        let errorMessage = 'An error occurred';
        switch(event.error) {
            case 'no-speech':
                errorMessage = 'No speech detected. Please try again.';
                break;
            case 'audio-capture':
                errorMessage = 'Microphone not accessible. Please check permissions.';
                break;
            case 'not-allowed':
                errorMessage = 'Microphone permission denied. Please enable it in browser settings.';
                break;
            case 'service-not-allowed':
                errorMessage = 'Speech recognition not allowed. Please ensure you are using HTTPS and using Chrome/Edge browser.';
                break;
            case 'network':
                errorMessage = 'Network error. Please check your internet connection.';
                break;
            default:
                errorMessage = `Error: ${event.error}`;
        }
        
        statusDiv.textContent = errorMessage;
        statusDiv.classList.remove('recording');
        stopRecording();
    };

    recognition.onend = () => {
        console.log('Speech recognition ended');
        if (isRecording) {
            // Restart if we're still supposed to be recording
            recognition.start();
        }
    };

    return recognition;
}

// Start Recording
function startRecording() {
    if (!recognition) {
        recognition = initializeSpeechRecognition();
        if (!recognition) return;
    }

    try {
        recognition.start();
        transcriptDiv.innerHTML = '<p class="placeholder">Listening...</p>';
        summaryDiv.innerHTML = '<p class="placeholder">Summary will appear after you stop recording...</p>';
        getSummaryBtn.style.display = 'none';
    } catch (error) {
        console.error('Error starting recognition:', error);
    }
}

// Stop Recording
function stopRecording() {
    if (recognition && isRecording) {
        isRecording = false;
        recognition.stop();
        statusDiv.textContent = 'Recording stopped';
        statusDiv.classList.remove('recording');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        if (finalTranscript.trim()) {
            getSummaryBtn.style.display = 'inline-block';
        }
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
    transcriptDiv.innerHTML = '<p class="placeholder">Transcript will appear here when you start recording...</p>';
    summaryDiv.innerHTML = '<p class="placeholder">Summary will appear here after you stop recording...</p>';
    clearTranscriptBtn.style.display = 'none';
    getSummaryBtn.style.display = 'none';
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
getSummaryBtn.addEventListener('click', generateSummary);
clearTranscriptBtn.addEventListener('click', clearTranscript);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Conversation Transcriber initialized');
    
    // Check for browser support
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        statusDiv.textContent = 'Browser not supported';
        statusDiv.style.color = '#dc3545';
        startBtn.disabled = true;
    }
});
