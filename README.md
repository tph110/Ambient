# Conversation Transcriber & Summarizer

A privacy-focused web application that records conversations, transcribes them in real-time, and generates AI-powered summaries using OpenRouter.

## Features

- 🎙️ **Real-time Transcription**: Uses Web Speech API for instant speech-to-text conversion
- 🤖 **AI Summaries**: Generates concise summaries using Claude 3.5 Sonnet via OpenRouter
- 🔒 **Privacy First**: All audio processing happens locally in your browser
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🚀 **Easy Deployment**: One-click deployment to Vercel

## Prerequisites

1. A GitHub account
2. A Vercel account (free tier works fine)
3. An OpenRouter API key ([Get one here](https://openrouter.ai/))

## Setup Instructions

### Step 1: Get Your OpenRouter API Key

1. Go to [OpenRouter](https://openrouter.ai/)
2. Sign up or log in
3. Navigate to Keys section
4. Create a new API key and copy it

### Step 2: Create GitHub Repository

1. Go to [GitHub](https://github.com/)
2. Click "New Repository"
3. Name it (e.g., "conversation-transcriber")
4. Make it Public or Private (your choice)
5. Don't initialize with README (we have these files already)
6. Click "Create Repository"

### Step 3: Upload Your Code to GitHub

You have two options:

**Option A: Using GitHub Web Interface (Easiest)**
1. On your new repository page, click "uploading an existing file"
2. Drag and drop all these files:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `vercel.json`
   - `README.md`
3. Click "Commit changes"

**Option B: Using Git Command Line**
```bash
# Navigate to the folder containing your files
cd /path/to/your/files

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 4: Deploy to Vercel

1. Go to [Vercel](https://vercel.com/)
2. Sign up or log in (use your GitHub account for easiest integration)
3. Click "Add New" → "Project"
4. Import your GitHub repository
5. Vercel will auto-detect the settings (no need to change anything)
6. Click "Deploy"
7. Wait for deployment to complete (usually under 1 minute)

### Step 5: Add Your API Key to Vercel

1. Once deployed, go to your project dashboard on Vercel
2. Click "Settings"
3. Click "Environment Variables"
4. Add a new variable:
   - **Name**: `OPENROUTER_API_KEY`
   - **Value**: Your OpenRouter API key (paste it here)
   - **Target**: Select all environments (Production, Preview, Development)
5. Click "Save"
6. Go back to "Deployments" and click "Redeploy" on your latest deployment

### Step 6: Test Your App

1. Click on your Vercel deployment URL (something like `your-app.vercel.app`)
2. Click "Allow" when prompted for microphone access
3. Click "Start Recording"
4. Have a conversation or speak into the microphone
5. Click "Stop Recording"
6. Click "Generate Summary" to get an AI summary

## How It Works

1. **Recording**: The Web Speech API captures audio from your microphone and transcribes it in real-time
2. **Transcription**: Text appears live as you speak, with final results shown in black and interim results in gray
3. **Summary**: When you click "Generate Summary", the transcript is sent to OpenRouter's API, which uses Claude 3.5 Sonnet to create a concise summary

## Browser Compatibility

- ✅ Chrome (Recommended)
- ✅ Edge
- ✅ Safari
- ❌ Firefox (does not support Web Speech API)

## Privacy & Security

- Audio is processed entirely in your browser
- No audio files are uploaded anywhere
- Only the text transcript is sent to OpenRouter for summarization
- Your API key is stored securely in Vercel's environment variables
- No conversation data is stored on any server

## Customization

### Change the AI Model

In `app.js`, find this line:
```javascript
model: 'anthropic/claude-3.5-sonnet',
```

You can change it to other models available on OpenRouter, such as:
- `openai/gpt-4-turbo`
- `anthropic/claude-3-opus`
- `google/gemini-pro`

### Change the Language

In `app.js`, find this line:
```javascript
recognition.lang = 'en-US';
```

Change to other language codes like:
- `en-GB` (British English)
- `es-ES` (Spanish)
- `fr-FR` (French)
- `de-DE` (German)

## Troubleshooting

**Microphone not working:**
- Ensure your browser has microphone permissions enabled
- HTTPS is required (Vercel provides this automatically)
- Check if another app is using your microphone

**API Key not working:**
- Make sure you've added it correctly in Vercel's Environment Variables
- Redeploy after adding the API key
- Check your OpenRouter account has credits

**No transcription appearing:**
- Speak clearly and at a moderate pace
- Check your internet connection (needed for Speech API)
- Try using Chrome browser

## Costs

- **Vercel**: Free tier includes 100GB bandwidth/month
- **OpenRouter**: Pay-per-use, typically $0.003-$0.015 per summary
- **Web Speech API**: Completely free (provided by browser)

## Future Enhancements

- Save transcripts as downloadable files
- Support for multiple languages in the UI
- Speaker identification for multi-person conversations
- Export summaries to PDF
- Integration with note-taking apps

## Support

If you encounter issues:
1. Check the browser console for errors (F12 → Console)
2. Verify your API key is correct
3. Ensure you're using a supported browser

## License

This project is open source and available for personal and commercial use.

---

Built with ❤️ for secure conversation analysis
