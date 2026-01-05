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

/**
 * Anonymize transcript by replacing names and addresses with placeholders
 * Uses regex patterns to detect common UK name and address formats
 */
function anonymizeTranscript(text) {
    let anonymized = text;
    
    // Track what was redacted for user awareness
    const redactions = [];
    
    // Store detected names to replace ALL occurrences (not just first)
    const detectedNames = new Set();
    
    // 1. Common greeting patterns that reveal names
    // "Hi [Name]", "Hello [Name]", "Good morning [Name]"
    const greetingPattern = /\b(Hi|Hello|Good morning|Good afternoon|Good evening|Hey|Morning|Evening)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi;
    anonymized = anonymized.replace(greetingPattern, (match, greeting, name) => {
        const firstName = name.split(' ')[0];
        if (name.length > 2 && !['Doctor', 'Dr', 'Nurse', 'The', 'There', 'This', 'That'].includes(firstName)) {
            detectedNames.add(name);
            detectedNames.add(firstName); // Also track first name alone
            redactions.push(`Name from greeting: ${name}`);
            return `${greeting} [PATIENT NAME]`;
        }
        return match;
    });
    
    // 2. "My name is [Name]" or "[Name] speaking"
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
    
    // 3. "I'm Dr [Name]" or "it's Dr [Name]" - preserve doctor titles but anonymize
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
    
    // 4. AGGRESSIVE: Now replace ALL occurrences of detected names throughout transcript
    // This catches "I consulted Jim", "Jim told me", etc.
    detectedNames.forEach(name => {
        if (name.length > 2) {
            // Create pattern that matches the name as a whole word
            const namePattern = new RegExp(`\\b${name}\\b`, 'gi');
            
            // Count how many times this name appears (for logging)
            const matches = anonymized.match(namePattern);
            if (matches && matches.length > 0) {
                redactions.push(`Replaced "${name}" ${matches.length} time(s) throughout transcript`);
                anonymized = anonymized.replace(namePattern, '[PATIENT NAME]');
            }
        }
    });
    
    // 5. UK Addresses - postcode patterns
    // Full UK postcodes: "OX1 1AB", "SW1A 1AA", etc.
    const postcodePattern = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/g;
    anonymized = anonymized.replace(postcodePattern, (match) => {
        redactions.push(`Postcode: ${match}`);
        return '[POSTCODE]';
    });
    
    // 6. Street addresses - common UK patterns
    // "123 High Street", "45 Park Road", "10 Downing Street"
    const streetPattern = /\b(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Road|Lane|Avenue|Drive|Close|Way|Gardens|Court|Place|Square|Terrace|Hill|Green|Park))\b/g;
    anonymized = anonymized.replace(streetPattern, (match) => {
        redactions.push(`Address: ${match}`);
        return '[STREET ADDRESS]';
    });
    
    // 7. Phone numbers - UK patterns
    // "07123456789", "020 1234 5678", "+44 7123 456789"
    const phonePattern = /\b(?:\+44\s?|0)(?:\d\s?){9,10}\b/g;
    anonymized = anonymized.replace(phonePattern, (match) => {
        redactions.push(`Phone: ${match}`);
        return '[PHONE NUMBER]';
    });
    
    // 8. Email addresses
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    anonymized = anonymized.replace(emailPattern, (match) => {
        redactions.push(`Email: ${match}`);
        return '[EMAIL ADDRESS]';
    });
    
    // 9. NHS number pattern (10 digits, often space-separated: "123 456 7890")
    const nhsNumberPattern = /\b\d{3}\s?\d{3}\s?\d{4}\b/g;
    anonymized = anonymized.replace(nhsNumberPattern, (match) => {
        redactions.push(`NHS Number: ${match}`);
        return '[NHS NUMBER]';
    });
    
    // 10. Date of birth patterns - various formats
    // "01/01/1990", "1st January 1990", "Jan 1, 1990"
    const dobPattern = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})\b/gi;
    anonymized = anonymized.replace(dobPattern, (match) => {
        redactions.push(`DOB: ${match}`);
        return '[DATE OF BIRTH]';
    });
    
    // Log what was anonymized (for debugging/transparency)
    if (redactions.length > 0) {
        console.log('🔒 Anonymization applied:', redactions.length, 'redactions');
        console.log('Detected names:', Array.from(detectedNames));
        console.log('Redaction details:', redactions);
    } else {
        console.log('🔒 No personally identifiable information detected');
    }
    
    return anonymized;
}

// ==========================================
// HALLUCINATION DETECTION FUNCTION
// ==========================================

/**
 * Detect if Whisper API has hallucinated (stuck in repetitive loop)
 * This happens when audio quality is poor or recording is mostly silence
 */
// Continue with existing Audio Visualizer Functions...
// [Rest of the file remains the same]

// Audio Visualizer Functions
// Audio Bars - Compact 3-bar indicator
async function startAudioBars() {
    try {
        const audioBars = document.getElementById('audioBars');
        const bar1 = document.getElementById('audioBar1');
        const bar2 = document.getElementById('audioBar2');
        const bar3 = document.getElementById('audioBar3');
        
        if (!audioBars || !bar1 || !bar2 || !bar3) return;
        
        // Show the bars
        audioBars.style.display = 'flex';
        
        // Get microphone stream for visualization
        const constraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
        };
        visualizerStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Create audio context and analyser
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(visualizerStream);
        
        analyser.fftSize = 32; // Small FFT for 3 bars
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        source.connect(analyser);
        
        // Start updating bars
        updateAudioBars(bar1, bar2, bar3, analyser, dataArray);
        
    } catch (error) {
        console.error('Error starting audio bars:', error);
    }
}

function updateAudioBars(bar1, bar2, bar3, analyser, dataArray) {
    function update() {
        visualizerAnimationId = requestAnimationFrame(update);
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average levels for 3 frequency ranges
        const low = dataArray.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
        const mid = dataArray.slice(5, 10).reduce((a, b) => a + b, 0) / 5;
        const high = dataArray.slice(10, 16).reduce((a, b) => a + b, 0) / 6;
        
        // Update bar 1 (low frequencies)
        bar1.className = 'audio-bar';
        if (low > 100) bar1.classList.add('active-high');
        else if (low > 50) bar1.classList.add('active-medium');
        else if (low > 20) bar1.classList.add('active-low');
        
        // Update bar 2 (mid frequencies)
        bar2.className = 'audio-bar';
        if (mid > 100) bar2.classList.add('active-high');
        else if (mid > 50) bar2.classList.add('active-medium');
        else if (mid > 20) bar2.classList.add('active-low');
        
        // Update bar 3 (high frequencies)
        bar3.className = 'audio-bar';
        if (high > 100) bar3.classList.add('active-high');
        else if (high > 50) bar3.classList.add('active-medium');
        else if (high > 20) bar3.classList.add('active-low');
    }
    
    update();
}

function stopAudioBars() {
    // Stop animation
    if (visualizerAnimationId) {
        cancelAnimationFrame(visualizerAnimationId);
        visualizerAnimationId = null;
    }
    
    // Close audio context
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    // Stop visualizer stream
    if (visualizerStream) {
        visualizerStream.getTracks().forEach(track => track.stop());
        visualizerStream = null;
    }
    
    // Hide audio bars
    const audioBars = document.getElementById('audioBars');
    if (audioBars) {
        audioBars.style.display = 'none';
    }
    
    // Reset bars to default state
    const bar1 = document.getElementById('audioBar1');
    const bar2 = document.getElementById('audioBar2');
    const bar3 = document.getElementById('audioBar3');
    if (bar1) bar1.className = 'audio-bar';
    if (bar2) bar2.className = 'audio-bar';
    if (bar3) bar3.className = 'audio-bar';
}


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
// Check Recording Size and Show Warnings
function checkRecordingSize() {
    const sizeMB = (currentRecordingSize / (1024 * 1024)).toFixed(1);
    const estimatedMinutes = Math.floor(currentRecordingSize / (12000 / 8) / 60);
    
    // Update visual timer display
    updateRecordingTimer();
    
    // Show warning at 3MB
    if (currentRecordingSize >= SIZE_WARNING_THRESHOLD && !hasShownSizeWarning) {
        hasShownSizeWarning = true;
        statusDiv.style.backgroundColor = '#fbbf24';  // Amber warning
        statusDiv.style.color = '#78350f';
        statusDiv.textContent = `⚠️ Warning: Recording size ${sizeMB}MB (~${estimatedMinutes} min). Approaching limit!`;
        
        // Show browser notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('EchoDoc - File Size Warning', {
                body: `Recording is ${sizeMB}MB. Please stop soon to avoid data loss.`,
                icon: '/favicon.ico'
            });
        }
        
        console.warn(`⚠️ Recording size warning: ${sizeMB}MB`);
    }
    
    // Auto-stop at 4MB to prevent data loss
    if (currentRecordingSize >= SIZE_MAX_LIMIT) {
        console.error(`🛑 Auto-stopping recording at ${sizeMB}MB to prevent data loss`);
        
        statusDiv.style.backgroundColor = '#ef4444';  // Red alert
        statusDiv.style.color = 'white';
        statusDiv.textContent = `🛑 Recording auto-stopped at ${sizeMB}MB to prevent data loss`;
        
        // Show alert to user
        alert(`Recording automatically stopped at ${sizeMB}MB to prevent data loss.\n\nThe recording will now be transcribed safely.\n\nTip: For longer consultations, stop and restart recording every 10-15 minutes.`);
        
        // Auto-stop the recording
        stopRecording();
    }
}

// Update Recording Timer Display
function updateRecordingTimer() {
    const timerDiv = document.getElementById('recordingTimer');
    if (!timerDiv || timerDiv.style.display === 'none') return;
    
    // Calculate elapsed time
    const now = Date.now();
    const elapsed = Math.floor((now - recordingStartTime - pausedDuration) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const elapsedDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Calculate size and progress
    const sizeMB = (currentRecordingSize / (1024 * 1024)).toFixed(1);
    const percentage = Math.min((currentRecordingSize / SIZE_MAX_LIMIT) * 100, 100);
    
    // Estimate time remaining (based on current rate)
    const bytesPerSecond = elapsed > 0 ? currentRecordingSize / elapsed : 12000 / 8;
    const remainingBytes = SIZE_MAX_LIMIT - currentRecordingSize;
    const remainingSeconds = remainingBytes / bytesPerSecond;
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    
    let remainingDisplay;
    if (remainingMinutes < 1) {
        remainingDisplay = '<1 min';
    } else if (remainingMinutes > 60) {
        remainingDisplay = '>60 min';
    } else {
        remainingDisplay = `~${remainingMinutes} min`;
    }
    
    // Update timer displays
    document.getElementById('timerElapsed').textContent = elapsedDisplay;
    document.getElementById('timerRemaining').textContent = remainingDisplay;
    document.getElementById('timerSize').textContent = `${sizeMB} MB`;
    
    // Update progress bar
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    
    progressBar.style.width = `${percentage}%`;
    progressPercentage.textContent = `${percentage.toFixed(0)}%`;
    
    // Change progress bar color based on percentage
    progressBar.classList.remove('warning', 'danger');
    if (percentage >= 90) {
        progressBar.classList.add('danger');
    } else if (percentage >= 75) {
        progressBar.classList.add('warning');
    }
    
    // Update remaining time color
    const timerRemainingValue = document.getElementById('timerRemaining');
    if (remainingMinutes < 5) {
        timerRemainingValue.style.color = '#ef4444'; // Red
    } else if (remainingMinutes < 15) {
        timerRemainingValue.style.color = '#f59e0b'; // Amber
    } else {
        timerRemainingValue.style.color = '#10b981'; // Green
    }
}

// Start Recording
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
            
            // Now that we have permission, refresh the microphone list with proper labels
            await populateMicrophoneDropdown();
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
        currentRecordingSize = 0;  // Reset size tracking
        hasShownSizeWarning = false;  // Reset warning flag
        
        console.log('Recording with:', options.mimeType || 'default', 'at', options.audioBitsPerSecond/1000, 'kbps (requested)');
        
        // Collect audio data
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                currentRecordingSize += event.data.size;
                
                console.log('Audio chunk received:', event.data.size, 'bytes. Total:', currentRecordingSize, 'bytes');
                
                // Check size in real-time
                checkRecordingSize();
            }
        };
        
        // Start size monitoring (check every 5 seconds)
        sizeMonitorInterval = setInterval(() => {
            if (isRecording && !isPaused) {
                checkRecordingSize();
            }
        }, 5000);
        
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
        
        // Start recording with 1 second timeslice to get regular size updates
        mediaRecorder.start(1000);
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Start audio bars
        startAudioBars();
        
        // Show recording timer display
        const timerDiv = document.getElementById('recordingTimer');
        if (timerDiv) {
            timerDiv.style.display = 'block';
            // Initialize timer display
            updateRecordingTimer();
        }
        
        // Start timer display
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime - pausedDuration) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            statusDiv.textContent = `🔴 Recording... ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
        
        statusDiv.classList.add('recording');
        startBtn.disabled = true;
        
        // Swap Start button to Pause button with animation
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-flex';
        pauseBtn.disabled = false;
        
        stopBtn.disabled = false;
        
        // Update button colors based on new state
        updateButtonColors();
        
        // Animate status div (no continuous pulse)
        anime({
            targets: '#status',
            scale: [1.1, 1],
            duration: 300,
            easing: 'easeOutElastic(1, .5)'
        });
        
        console.log('Recording started with Azure Speech API');
        
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
        
        // Stop size monitor
        if (sizeMonitorInterval) {
            clearInterval(sizeMonitorInterval);
            sizeMonitorInterval = null;
        }
        
        // Stop audio bars
        stopAudioBars();
        
        // Hide recording timer display
        const timerDiv = document.getElementById('recordingTimer');
        if (timerDiv) {
            timerDiv.style.display = 'none';
        }
        
        // Reset pause tracking
        pausedDuration = 0;
        pauseStartTime = null;
        
        // Reset status bar colors
        statusDiv.style.backgroundColor = '';
        statusDiv.style.color = '';
        
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
        
        statusDiv.textContent = 'Recording Paused';
        statusDiv.classList.remove('recording');
        pauseBtn.innerHTML = '<span class="resume-icon"></span><span>Resume</span>';
        
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
        pauseBtn.innerHTML = '<span class="pause-icon"></span><span>Pause</span>';
        
        console.log('Recording resumed');
    }
}

// ==========================================
// OGG OPUS CONVERSION FOR AZURE SPEECH
// ==========================================

// Transcribe Audio using OpenAI Whisper API
async function transcribeAudio(audioBlob) {
    try {
        // Final safety check before uploading
        const maxSize = 4 * 1024 * 1024; // 4MB to be safe
        if (audioBlob.size > maxSize) {
            const sizeMB = (audioBlob.size / (1024 * 1024)).toFixed(1);
            const minutes = Math.floor(audioBlob.size / (12000 / 8) / 60);
            
            // Show error with download option to save the audio
            const shouldDownload = confirm(
                `⚠️ RECORDING TOO LARGE\n\n` +
                `Size: ${sizeMB}MB (limit: 4MB)\n` +
                `Duration: ~${minutes} minutes\n\n` +
                `The recording cannot be transcribed due to file size limits.\n\n` +
                `Click OK to download the audio file so you don't lose your recording.\n` +
                `Click Cancel to discard it.\n\n` +
                `💡 Tip: For longer consultations, stop and restart recording every 10-15 minutes.`
            );
            
            if (shouldDownload) {
                // Download the audio file as backup
                const url = URL.createObjectURL(audioBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `consultation-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.webm`;
                a.click();
                URL.revokeObjectURL(url);
                
                statusDiv.textContent = `✓ Audio saved! Recording was ${sizeMB}MB (~${minutes} min). Please record in shorter segments.`;
                statusDiv.style.backgroundColor = '#10b981';
                statusDiv.style.color = 'white';
            } else {
                statusDiv.textContent = 'Recording discarded. Keep recordings under 15 minutes.';
            }
            
            throw new Error(`Recording too large: ${sizeMB}MB (approximately ${minutes} minutes). Maximum is 4MB (~40 minutes at 12kbps).`);
        }
        
        statusDiv.textContent = '⏳ Transcribing with AI...';
        transcriptDiv.innerHTML = '<p class="placeholder">Transcribing your consultation...</p>';
        
        console.log('Original audio blob size:', audioBlob.size, 'bytes =', (audioBlob.size / 1024).toFixed(2), 'KB');
        console.log('Original audio blob type:', audioBlob.type);
        
        // OpenAI Whisper accepts WebM directly - no conversion needed!
        console.log('Sending WebM directly to OpenAI Whisper...');
        
        // Convert WebM blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        
        reader.onloadend = async () => {
            const base64Audio = reader.result.split(',')[1];
            console.log('Base64 audio length:', base64Audio.length, 'characters');
            console.log('Estimated size:', (base64Audio.length * 0.75 / 1024).toFixed(2), 'KB');
            
            // Call our Whisper API endpoint
            console.log('Sending to OpenAI Whisper API...');
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
                    const audioSizeMB = (audioBlob.size / 1024 / 1024).toFixed(2);
                    errorMessage = `Recording too large to transcribe.\n\nAudio size: ${audioSizeMB} MB\n\nPlease keep recordings under 15 minutes.`;
                    console.error('413 Payload Too Large - Audio size:', audioBlob.size, 'bytes');
                    throw new Error(errorMessage);
                }
                
                if (response.status === 504) {
                    const durationMinutes = Math.floor(audioBlob.size / (12000 / 8) / 60);
                    errorMessage = `Transcription timed out. Your recording was approximately ${durationMinutes} minutes long.\n\nPlease keep recordings under 15 minutes for reliable transcription.\n\nFor longer consultations:\n1. Stop recording every 10-15 minutes\n2. Generate summary for each segment\n3. Combine summaries manually`;
                    console.error('504 Gateway Timeout - Recording too long:', durationMinutes, 'minutes');
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
            
            // OpenAI Whisper returns 'text' field
            finalTranscript = data.text;
            
            if (!finalTranscript || finalTranscript.trim() === '') {
                throw new Error('Received empty transcript from API');
            }
            
            // Display transcript directly - no quality checks
            transcriptDiv.innerHTML = `<p>${finalTranscript}</p>`;
            
            // Update UI
            statusDiv.textContent = 'Transcription complete!';
            statusDiv.classList.remove('recording');
            
            // Swap Pause button back to Start button
            pauseBtn.style.display = 'none';
            pauseBtn.disabled = true;
            startBtn.style.display = 'inline-flex';
            startBtn.disabled = false;
            
            stopBtn.disabled = true;
            
            // Update button colors based on new state
            updateButtonColors();
            
            // Show buttons
            if (finalTranscript.trim()) {
                clearTranscriptBtn.style.display = 'inline-block';
                getSummaryBtn.style.display = 'inline-flex';
                
                // Animate buttons appearing
                setTimeout(() => {
                    anime({
                        targets: [clearTranscriptBtn, getSummaryBtn],
                        scale: [0, 1],
                        opacity: [0, 1],
                        duration: 400,
                        delay: anime.stagger(100),
                        easing: 'easeOutBack'
                    });
                }, 100);
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
        pauseBtn.innerHTML = '<span class="pause-icon"></span><span>Pause</span>';
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
    getSummaryBtn.innerHTML = '<span class="loading-spinner"></span> Generating...';
    summaryDiv.innerHTML = '<p style="color: #667eea;"><span class="loading-spinner"></span>Generating summary...</p>';
    
    // Update button color to show loading state
    updateButtonColors();

    try {
        // Check if anonymization is enabled
        const anonymizeCheckbox = document.getElementById('anonymizeCheckbox');
        const shouldAnonymize = anonymizeCheckbox.checked;
        
        // Prepare transcript (anonymize if enabled)
        let transcriptToSend = finalTranscript;
        if (shouldAnonymize) {
            console.log('🔒 Anonymizing transcript before sending to AI...');
            transcriptToSend = anonymizeTranscript(finalTranscript);
            console.log('Original length:', finalTranscript.length, 'chars');
            console.log('Anonymized length:', transcriptToSend.length, 'chars');
        } else {
            console.log('⚠️ Anonymization disabled - sending raw transcript to AI');
        }
        
        // Call our secure API endpoint
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transcript: transcriptToSend
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
        
        // Animate summary appearance
        anime({
            targets: '#summary',
            opacity: [0, 1],
            translateY: [30, 0],
            duration: 700,
            easing: 'easeOutCubic'
        });
        
        // Show copy button
        copySummaryBtn.style.display = 'inline-flex';
        
        // Show referral letter button
        generateReferralBtn.style.display = 'inline-flex';
        
        // Show patient summary button
        generatePatientSummaryBtn.style.display = 'inline-flex';
        
        // Animate buttons appearing with stagger
        setTimeout(() => {
            anime({
                targets: [copySummaryBtn, generateReferralBtn, generatePatientSummaryBtn],
                scale: [0, 1],
                opacity: [0, 1],
                duration: 400,
                delay: anime.stagger(100, {start: 200}),
                easing: 'easeOutBack'
            });
        }, 100);
        
        // Change button text to indicate completion
        getSummaryBtn.disabled = false;
        getSummaryBtn.innerHTML = '✓ Summary Complete';
        
        // Update button color to show completed state
        updateButtonColors();
        
    } catch (error) {
        console.error('Error generating summary:', error);
        summaryDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
        
        // Reset button on error
        getSummaryBtn.disabled = false;
        getSummaryBtn.innerHTML = 'Generate Summary';
        updateButtonColors();
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
    generateReferralBtn.innerHTML = '<span class="loading-spinner"></span> Generating...';
    referralLetterDiv.innerHTML = '<p style="color: #667eea;"><span class="loading-spinner"></span>Generating referral letter...</p>';

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
        
        // Change button text to indicate completion
        generateReferralBtn.disabled = false;
        generateReferralBtn.innerHTML = '✓ Referral Complete';
        
    } catch (error) {
        console.error('Error generating referral letter:', error);
        referralLetterDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
        
        // Reset button on error
        generateReferralBtn.disabled = false;
        generateReferralBtn.innerHTML = 'Generate Referral Letter';
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
    generatePatientSummaryBtn.innerHTML = '<span class="loading-spinner"></span> Generating...';
    patientSummaryDiv.innerHTML = '<p style="color: #667eea;"><span class="loading-spinner"></span>Generating patient-friendly summary...</p>';

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
        
        // Change button text to indicate completion
        generatePatientSummaryBtn.disabled = false;
        generatePatientSummaryBtn.innerHTML = '✓ Patient Summary Complete';
        
    } catch (error) {
        console.error('Error generating patient summary:', error);
        patientSummaryDiv.innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
        
        // Reset button on error
        generatePatientSummaryBtn.disabled = false;
        generatePatientSummaryBtn.innerHTML = 'Generate Patient Summary';
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
    
    // Reset button visibility - show Start, hide Pause
    pauseBtn.style.display = 'none';
    startBtn.style.display = 'inline-flex';
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
        // Try to enumerate devices without permission first
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Filter for audio input devices
        const microphones = devices.filter(device => device.kind === 'audioinput');
        
        console.log('Found microphones:', microphones.length);
        
        // Clear dropdown
        dropdown.innerHTML = '';
        
        if (microphones.length === 0) {
            dropdown.innerHTML = '<option value="">No microphones detected</option>';
            dropdown.disabled = true;
            return;
        }
        
        // Add each microphone to dropdown
        microphones.forEach((mic, index) => {
            const option = document.createElement('option');
            option.value = mic.deviceId;
            
            // If no permission yet, device labels will be empty
            // Use generic names or actual labels if available
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

// Add button hover animations
function addButtonHoverEffects() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('mouseenter', () => {
            if (!button.disabled) {
                anime({
                    targets: button,
                    scale: 1.05,
                    duration: 200,
                    easing: 'easeOutQuad'
                });
            }
        });
        
        button.addEventListener('mouseleave', () => {
            anime({
                targets: button,
                scale: 1,
                duration: 200,
                easing: 'easeOutQuad'
            });
        });
        
        button.addEventListener('mousedown', () => {
            if (!button.disabled) {
                anime({
                    targets: button,
                    scale: 0.95,
                    duration: 100,
                    easing: 'easeOutQuad'
                });
            }
        });
        
        button.addEventListener('mouseup', () => {
            if (!button.disabled) {
                anime({
                    targets: button,
                    scale: 1.05,
                    duration: 100,
                    easing: 'easeOutQuad'
                });
            }
        });
    });
}

// Animate button color changes based on state
function animateButtonState(button, targetColor, targetBackground) {
    anime({
        targets: button,
        backgroundColor: targetBackground,
        color: targetColor,
        duration: 400,
        easing: 'easeInOutQuad'
    });
}

// Update button colors when state changes
function updateButtonColors() {
    // Start button - changes based on recording state
    if (startBtn.disabled) {
        animateButtonState(startBtn, '#94a3b8', 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)');
    } else {
        animateButtonState(startBtn, '#ffffff', 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)');
    }
    
    // Pause button - active during recording
    if (!pauseBtn.disabled) {
        animateButtonState(pauseBtn, '#1e293b', 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)');
    }
    
    // Stop button - active during recording
    if (!stopBtn.disabled) {
        animateButtonState(stopBtn, '#ffffff', 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)');
    }
    
    // Generate Summary button - changes when clicked
    if (getSummaryBtn.disabled) {
        animateButtonState(getSummaryBtn, '#94a3b8', 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)');
    } else if (getSummaryBtn.style.display !== 'none') {
        animateButtonState(getSummaryBtn, '#ffffff', 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)');
    }
}

// Initialize hover effects
addButtonHoverEffects();

// Add microphone dropdown change listener
document.addEventListener('DOMContentLoaded', () => {
    const micDropdown = document.getElementById('microphoneDropdown');
    if (micDropdown) {
        micDropdown.addEventListener('change', handleMicrophoneSelection);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('EchoDoc initialized with Whisper API');
    
    // Initialize page animations
    initializeAnimations();
    
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

// Initialize Anime.js animations
function initializeAnimations() {
    // Animate header on load
    anime({
        targets: '.header',
        translateY: [-50, 0],
        opacity: [0, 1],
        duration: 800,
        easing: 'easeOutExpo'
    });
    
    // Animate cards with stagger effect
    anime({
        targets: '.card',
        translateY: [30, 0],
        opacity: [0, 1],
        duration: 600,
        delay: anime.stagger(100, {start: 200}),
        easing: 'easeOutQuad'
    });
    
    // Animate buttons
    anime({
        targets: '.btn',
        scale: [0.9, 1],
        opacity: [0, 1],
        duration: 400,
        delay: anime.stagger(50, {start: 600}),
        easing: 'easeOutBack'
    });
}

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
