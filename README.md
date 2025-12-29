# ICP Builder - AI Voice Chat Application

> An intelligent voice-enabled chat application that helps users build their Ideal Customer Profile (ICP) through natural conversations with AI.

## 🎯 Overview

ICP Builder is a Next.js application that combines voice interaction, AI intelligence, and structured data collection to help businesses define their ideal customers. Users can have natural voice conversations with an AI assistant that guides them through understanding their target market, pain points, buying process, and more.

## ✨ Key Features

- **🎤 Voice Interaction**: Real-time voice conversations with live transcription
- **🤖 AI-Powered Guidance**: Context-aware AI that guides users through ICP building
- **📊 Progress Tracking**: Visual progress through 5 key ICP sections (0-100%)
- **💬 Chat History**: Persistent chat sessions with message history
- **🎨 Modern UI**: Clean, responsive interface built with Tailwind CSS
- **🔊 High-Quality TTS**: Natural voice synthesis using ElevenLabs
- **⚡ Fast Response**: Optimized for low latency (under 2 seconds total)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works)
- OpenAI API key
- ElevenLabs API key

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd final
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**

Create `.env.local` file:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o-mini

# ElevenLabs
# Get your API key from https://elevenlabs.io/app/settings/api-keys
# The API key is used server-side for secure WebSocket connections
ELEVENLABS_API_KEY=your-elevenlabs-api-key-here
# Voice ID can be found in ElevenLabs voice library (optional, has default)
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=GzE4TcXfh9rYCU9gVgPp
```

4. **Run database migrations**

In Supabase SQL Editor, run migrations in order:
- `supabase/migrations/001_create_sessions_table.sql`
- `supabase/migrations/002_create_chats_and_messages_tables.sql`
- `supabase/migrations/003_create_icp_data_table.sql`

5. **Start development server**
```bash
npm run dev
```

Visit `http://localhost:3000`

## 🎙️ Voice System

### How It Works

1. **Start Conversation** → Microphone access requested
2. **Speak** → Live transcription appears (Browser SpeechRecognition)
3. **Auto-send** → After 0.8s pause, message sent to AI
4. **AI Response** → OpenAI processes and responds
5. **Voice Output** → ElevenLabs TTS reads response
6. **Continuous** → Returns to listening, ready for next input

### Voice Features

- **Live Transcription**: See words as you speak
- **Auto-send**: Automatic message submission on pause
- **Barge-in**: Interrupt AI anytime
- **VAD (Voice Activity Detection)**: Smart speech detection
- **Background Noise Filtering**: Ignores non-speech sounds

### Timing Configuration

| Event | Threshold | Purpose |
|-------|-----------|---------|
| Speech Start | 150ms | Confirm user started speaking |
| Auto-send Pause | 800ms | Send message during speech |
| Speech End | 1200ms | End of complete utterance |

## 📊 ICP Sections

The application tracks progress through 5 ICP sections (20% each):

1. **Company Basics** (20%)
   - Company name, size, industry, location

2. **Target Customer** (20%)
   - Customer type, demographics, psychographics

3. **Problem & Pain** (20%)
   - Main problems, pain points, current solutions

4. **Buying Process** (20%)
   - Decision makers, process steps, evaluation criteria

5. **Budget & Decision Maker** (20%)
   - Budget range, decision maker role, approval process

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 15.1.4 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS 3.4.19, shadcn/ui components
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4o-mini
- **Voice**: 
  - STT: Browser SpeechRecognition API
  - TTS: ElevenLabs API
  - VAD: Custom AudioContext implementation

### Project Structure

```
final/
├── app/
│   ├── api/               # API routes
│   │   ├── ai/           # OpenAI chat endpoint
│   │   ├── chats/        # Chat CRUD
│   │   └── sessions/     # Session management
│   ├── layout.tsx
│   └── page.tsx          # Main application
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── ChatArea.tsx      # Message display
│   ├── ChatInput.tsx     # Text input
│   ├── Sidebar.tsx       # Chat history
│   └── VoicePanel.tsx    # Voice controls
├── hooks/
│   └── useElevenLabsVoice.ts  # Voice management
├── lib/
│   ├── vad.ts            # Voice Activity Detection
│   ├── liveTranscription.ts   # Speech-to-text
│   ├── elevenLabsWebSocket.ts # TTS streaming
│   ├── audioPlayer.ts    # Audio playback
│   ├── icp-analyzer.ts   # ICP data extraction
│   └── supabase.ts       # Database client
└── types/                # TypeScript definitions
```

## 🔧 Recent Fixes (Dec 29, 2025)

### Issues Resolved

1. **Multiple VAD Initializations** ✅
   - Fixed duplicate VAD listeners
   - Added proper AudioContext cleanup
   - Single initialization per conversation

2. **Slow Response Times** ✅
   - Reduced auto-send from 1.5s → 0.8s (47% faster)
   - Reduced speech end from 2.5s → 1.2s (52% faster)

3. **Transcript Not Being Sent** ✅
   - Enhanced `handlePauseDuringSpeech` callback
   - Added proper state transitions
   - Improved logging for debugging

### Files Modified

- `lib/vad.ts` - Reduced timeouts, added debug logging
- `components/VoicePanel.tsx` - Fixed VAD cleanup
- `hooks/useElevenLabsVoice.ts` - Enhanced transcript handling

## 🧪 Testing

### Voice System Test

1. Click "Start Conversation"
2. Say "hello" and pause 1 second
3. **Expected**: Message auto-sends after ~0.8s
4. **Verify**: Message appears in chat, AI responds with voice

### Console Logs (Expected)

```
[VoicePanel] VAD initialized once with faster response times
[Voice] [VAD] Speech start detected (user started speaking)
[Voice] [VAD] Pause during speech - sending transcript: "hello"
[Voice] [OpenAI] Starting stream
[Voice] [TTS] WebSocket connected
```

### Debug Mode

Enable verbose VAD logging in `components/VoicePanel.tsx`:
```typescript
debugLogging: true, // Line 87
```

## 🌐 Browser Support

| Browser | Voice Support | Notes |
|---------|---------------|-------|
| Chrome | ✅ Full | Recommended |
| Edge | ✅ Full | Chromium-based |
| Safari | ✅ Full | webkit prefix |
| Firefox | ⚠️ Partial | No SpeechRecognition |

## 📈 Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Speech-to-Text | < 500ms | ~100-300ms |
| OpenAI First Token | < 3s | ~500-1000ms |
| TTS First Audio | < 1.5s | ~200-500ms |
| **Total Latency** | **< 5s** | **~1-2s** ✅ |

## 🚀 Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Environment Variables Checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `OPENAI_API_KEY`
- [ ] `ELEVENLABS_API_KEY`
- [ ] `NEXT_PUBLIC_ELEVENLABS_VOICE_ID` (optional)

## 🐛 Troubleshooting

### No Live Transcription?
- Use Chrome/Edge (best support)
- Grant microphone permissions
- Check HTTPS (required for SpeechRecognition)

### No Audio Output?
- Verify ElevenLabs API key
- Check browser volume
- Interact with page first (autoplay policy)

### Messages Not Sending?
- Check console for errors
- Verify OpenAI API key
- Ensure stable internet connection

### VAD Issues?
- Enable debug mode (see Testing section)
- Check microphone input levels
- Reduce background noise

## 📝 API Endpoints

### Chat Management
- `GET /api/chats?session_id=xxx` - List chats
- `POST /api/chats` - Create chat
- `DELETE /api/chats/[chatId]` - Delete chat
- `GET /api/chats/[chatId]/messages` - Get messages
- `POST /api/chats/[chatId]/messages` - Add message

### ICP Data
- `GET /api/chats/[chatId]/icp` - Get ICP data
- `PATCH /api/chats/[chatId]/icp` - Update ICP data

### AI & Voice
- `POST /api/ai/chat` - Stream AI response (SSE)
- `POST /api/voice/speak` - Text-to-speech

## 🔒 Security

- API keys stored server-side only
- Environment variables not exposed to client
- Database access via Supabase RLS (when configured)
- No authentication required (session-based)

## 📄 License

[Your License Here]

## 🤝 Contributing

Contributions welcome! Please read contributing guidelines first.

## 📧 Support

For issues or questions:
- Check console logs (F12)
- Review troubleshooting section
- Open GitHub issue

---

**Built with ❤️ using Next.js, OpenAI, and ElevenLabs**
