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
let recognition = null;
let isRecording = false;
let finalTranscript = '';
let recordingStartTime = null;
let recordingTimer = null;

// Medical terminology correction dictionary
const medicalCorrections = {
    // === Red flag / Emergency conditions ===
    'quarter aquinas': 'cauda equina',
    'quarter aquin a syndrome': 'cauda equina syndrome',
    'quarter aquinas syndrome': 'cauda equina syndrome',
    'corder equina': 'cauda equina',
    'corda equina': 'cauda equina',
    'cauda equine': 'cauda equina',
    'cauda aquina': 'cauda equina',
    'corder akina': 'cauda equina',
    'myocardial infarction': 'myocardial infarction',
    'my oh cardial infarction': 'myocardial infarction',
    'heart attack': 'myocardial infarction',  // Common patient phrase
    'pulmonary embolism': 'pulmonary embolism',
    'pull monary embolism': 'pulmonary embolism',
    'pe': 'PE',  // Pulmonary embolism
    'tia': 'TIA',
    'subarachnoid haemorrhage': 'subarachnoid haemorrhage',
    'sub arachnoid hemorrhage': 'subarachnoid haemorrhage',
    'subarachnoid hemorrhage': 'subarachnoid haemorrhage',

    // === Common medications (expanded with UK/NHS favourites) ===
    // Statins
    'atorvastatin': 'atorvastatin',
    'at or vast at in': 'atorvastatin',
    'a torva statin': 'atorvastatin',
    'a tour of a statin': 'atorvastatin',
    'lipitor': 'atorvastatin',  // Brand name often spoken
    'simvastatin': 'simvastatin',
    'sim vast at in': 'simvastatin',
    'zocor': 'simvastatin',  // Brand

    // PPIs & Gastro
    'lansoprazole': 'lansoprazole',
    'lan so pra zole': 'lansoprazole',
    'omeprazole': 'omeprazole',
    'oh map razal': 'omeprazole',
    'oh mep raz ole': 'omeprazole',

    // Antidepressants
    'sertraline': 'sertraline',
    'sir tra lean': 'sertraline',
    'sir truh line': 'sertraline',
    'fluoxetine': 'fluoxetine',
    'flew ox a teen': 'fluoxetine',
    'prozac': 'fluoxetine',  // Brand
    'citalopram': 'citalopram',
    'sigh tal oh pram': 'citalopram',
    'amitriptyline': 'amitriptyline',
    'a mitt trip till een': 'amitriptyline',

    // Antihypertensives & Diuretics
    'bendroflumethiazide': 'bendroflumethiazide',
    'ben dro flu meth eye a zide': 'bendroflumethiazide',
    'lisinopril': 'lisinopril',
    'lie sin oh pril': 'lisinopril',
    'amlodipine': 'amlodipine',
    'am low dip een': 'amlodipine',
    'i am not a pain': 'amlodipine',
    'am not a peen': 'amlodipine',
    'losartan': 'losartan',
    'low sar tan': 'losartan',
    'bisoprolol': 'bisoprolol',
    'by soprolol': 'bisoprolol',
    'bye so pro lol': 'bisoprolol',

    // Antibiotics (additional)
    'co-amoxiclav': 'co-amoxiclav',
    'coamoxiclav': 'co-amoxiclav',
    'augmentin': 'co-amoxiclav',  // Common brand spoken in UK
    'nitrofurantoin': 'nitrofurantoin',
    'night row fur an toy in': 'nitrofurantoin',
    'trimethoprim': 'trimethoprim',
    'try meth oh prim': 'trimethoprim',

    // Analgesics & Others
    'codeine': 'codeine',
    'co deen': 'codeine',
    'paracetamol': 'paracetamol',
    'para set a mol': 'paracetamol',
    'ibuprofen': 'ibuprofen',
    'eye bew pro fen': 'ibuprofen',

    // Inhalers & Respiratory
    'beclometasone': 'beclometasone',
    'that clomettazone': 'beclometasone',
    'beck low met a zone': 'beclometasone',
    'salbutamol': 'salbutamol',
    'sal but a mol': 'salbutamol',
    'ventolin': 'salbutamol',
    
    // Herbal/OTC
    'st john\'s wort': 'St John\'s Wort',
    'saint john\'s wort': 'St John\'s Wort',
    'john\'s ward': 'St John\'s Wort',
    'john\'s wart': 'St John\'s Wort',
    'saint johns wort': 'St John\'s Wort',

    // Original common misheard medications
    'met form in': 'metformin',
    'met foreman': 'metformin',
    'ram a drill': 'ramipril',
    'ram april': 'ramipril',
    'a mox a silly': 'amoxicillin',
    'a mock silly': 'amoxicillin',
    'amoxicillin': 'amoxicillin',
    'docks he cycling': 'doxycycline',
    'docks cycling': 'doxycycline',
    'doxycycline': 'doxycycline',
    'clarify through my sin': 'clarithromycin',
    'clarithromycin': 'clarithromycin',
    'prednisolone': 'prednisolone',
    'pred nissan alone': 'prednisolone',
    'aspirin': 'aspirin',
    'ass prin': 'aspirin',
    'warfarin': 'warfarin',
    'war for in': 'warfarin',

    // === Common conditions (expanded) ===
    'diabetes': 'diabetes',
    'die a beet ease': 'diabetes',
    'hypertension': 'hypertension',
    'high per tension': 'hypertension',
    'asthma': 'asthma',
    'as ma': 'asthma',
    'copd': 'COPD',
    'chronic obstructive pulmonary disease': 'COPD',
    'see oh pee dee': 'COPD',
    'pneumonia': 'pneumonia',
    'new moaner': 'pneumonia',
    'eczema': 'eczema',
    'ex uhma': 'eczema',
    'arthritis': 'arthritis',
    'arth right us': 'arthritis',
    'cellulitis': 'cellulitis',
    'sell you light us': 'cellulitis',
    'gout': 'gout',
    'gowt': 'gout',
    'urti': 'URTI',
    'upper respiratory tract infection': 'URTI',

    // === Symptoms & Examination (expanded) ===
    'dyspnea': 'dyspnoea',
    'dis nee uh': 'dyspnoea',
    'dyspnoea': 'dyspnoea',
    'nausea': 'nausea',
    'nor see uh': 'nausea',
    'diarrhea': 'diarrhoea',
    'die uh ree uh': 'diarrhoea',
    'diarrhoea': 'diarrhoea',
    'pyrexia': 'pyrexia',
    'pie rex ee uh': 'pyrexia',
    'auscultation': 'auscultation',
    'oz cult a shun': 'auscultation',
    'palpation': 'palpation',
    'pal pay shun': 'palpation',
    'percussion': 'percussion',
    'per cush un': 'percussion',
    'crackles': 'crackles',
    'crack alls': 'crackles',
    'crepitations': 'crepitations',
    'crep it a shuns': 'crepitations',
    'wheeze': 'wheeze',
    'weez': 'wheeze',
    'rales': 'rales',
    'rails': 'rales',
    'bibasal crepitations': 'bibasal crepitations',
    'by basal creps': 'bibasal crepitations',
    'reduced air entry': 'reduced air entry',

    // === Anatomical terms ===
    'glenohumeral joint': 'glenohumeral joint',
    'glen o humeral joint': 'glenohumeral joint',
    'sternocleidomastoid': 'sternocleidomastoid',
    'nasal turbinates': 'nasal turbinates',
    'nasal turbines': 'nasal turbinates',

    // === Microbiology ===
    'campylobacter': 'Campylobacter',
    'camilla bacter': 'Campylobacter',
    'cam pee low bacter': 'Campylobacter',

    // === Units, measurements & abbreviations ===
    'milligrams': 'mg',
    'mill ee grams': 'mg',
    'micrograms': 'mcg',
    'mike row grams': 'mcg',
    'milliliters': 'ml',
    'mill ee leet ers': 'ml',
    'millilitres': 'ml',
    'degrees celsius': '°C',
    'degrees c': '°C',
    'percent': '%',
    'per cent': '%',
    'bee dee': 'BD',
    'twice daily': 'BD',
    'oh dee': 'OD',
    'once daily': 'OD',
    'tee dee ess': 'TDS',
    'three times daily': 'TDS',
    'pee are en': 'PRN',
    'as needed': 'PRN',
    'eye em': 'IM',
    'eye vee': 'IV',
    'pee oh': 'PO',
    'stat': 'stat',
    'immediately': 'stat'
};

// Function to correct medical terminology
function correctMedicalTerms(text) {
    let corrected = text.toLowerCase();
    
    // Apply corrections from dictionary
    for (const [wrong, right] of Object.entries(medicalCorrections)) {
        const regex = new RegExp('\\b' + wrong + '\\b', 'gi');
        corrected = corrected.replace(regex, right);
    }
    
    return corrected;
}

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
    recognition.lang = 'en-GB';

    recognition.onstart = () => {
        console.log('Speech recognition started');
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
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                // Apply medical terminology corrections
                const corrected = correctMedicalTerms(transcript);
                finalTranscript += corrected + ' ';
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
        
        // Handle 'no-speech' error by auto-restarting (silence timeout)
        if (event.error === 'no-speech' && isRecording) {
            console.log('No speech detected - auto-restarting...');
            statusDiv.textContent = '🔴 Recording... (brief pause detected)';
            // The onend handler will restart it automatically
            return;
        }
        
        // Handle 'network' error by auto-restarting (connection issue)
        if (event.error === 'network' && isRecording) {
            console.log('Network error - attempting to reconnect...');
            statusDiv.textContent = '🔴 Recording... (reconnecting)';
            // The onend handler will restart it automatically
            return;
        }
        
        let errorMessage = 'An error occurred';
        switch(event.error) {
            case 'no-speech':
                errorMessage = 'No speech detected - restarting...';
                break;
            case 'network':
                errorMessage = 'Network error - reconnecting...';
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
            default:
                errorMessage = `Error: ${event.error}`;
        }
        
        // Only stop recording for serious errors (not 'no-speech' or 'network')
        if (event.error !== 'no-speech' && event.error !== 'network') {
            statusDiv.textContent = errorMessage;
            statusDiv.classList.remove('recording');
            
            // Stop timer
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
            
            stopRecording();
        }
    };

    recognition.onend = () => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Speech recognition ended. isRecording: ${isRecording}`);
        
        if (isRecording) {
            console.log(`[${timestamp}] Attempting auto-restart...`);
            
            // Try to restart immediately first
            try {
                recognition.start();
                console.log(`[${timestamp}] Successfully restarted`);
                // Don't update status - let the timer keep running
            } catch (error) {
                console.warn(`[${timestamp}] Immediate restart failed:`, error.message);
                
                // If immediate restart fails, try with delay
                setTimeout(() => {
                    if (isRecording) {
                        try {
                            recognition.start();
                            console.log(`[${timestamp}] Successfully restarted after delay`);
                            // Don't update status - let the timer keep running
                        } catch (delayedError) {
                            console.error(`[${timestamp}] Restart failed:`, delayedError);
                            statusDiv.textContent = '⚠️ Recording paused - Click Start to resume';
                            statusDiv.classList.remove('recording');
                            statusDiv.style.background = '#fef3c7';
                            statusDiv.style.color = '#92400e';
                            statusDiv.style.borderColor = '#fbbf24';
                            
                            // Stop timer on permanent failure
                            if (recordingTimer) {
                                clearInterval(recordingTimer);
                                recordingTimer = null;
                            }
                            // Don't call stopRecording() - keep transcript
                        }
                    }
                }, 200);
            }
        } else {
            console.log(`[${timestamp}] Recording stopped by user, not restarting`);
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
        // Set flag first to prevent auto-restart
        isRecording = false;
        
        // Stop timer immediately
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // Stop recognition
        recognition.stop();
        
        // Update UI
        statusDiv.textContent = 'Recording stopped';
        statusDiv.classList.remove('recording');
        statusDiv.style.background = '';
        statusDiv.style.color = '';
        statusDiv.style.borderColor = '';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        if (finalTranscript.trim()) {
            getSummaryBtn.style.display = 'inline-block';
        }
        
        console.log('Recording stopped by user');
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

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
getSummaryBtn.addEventListener('click', generateSummary);
clearTranscriptBtn.addEventListener('click', clearTranscript);
copySummaryBtn.addEventListener('click', copySummaryToClipboard);

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
