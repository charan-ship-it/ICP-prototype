# STT and TTS Pipeline Documentation

## Overview

This document explains the **Speech-to-Text (STT)** and **Text-to-Speech (TTS)** pipelines in the ICP Builder application. The system enables real-time voice conversations with AI, similar to ChatGPT Voice.

---

## 🎤 Speech-to-Text (STT) Pipeline

### Architecture

The STT pipeline uses a **two-stage approach**:

1. **Voice Activity Detection (VAD)** - Detects when user starts/stops speaking
2. **Audio Transcription** - Converts recorded audio to text

### Flow Diagram

```
User Speaks
    ↓
Microphone Capture (MediaRecorder)
    ↓
VAD Monitoring (Real-time energy analysis)
    ↓
Speech Detected → Start Recording
    ↓
Silence Detected (1.0s) → Stop Recording
    ↓
Audio Blob Created
    ↓
POST /api/stt/whisper
    ↓
OpenAI Whisper API
    ↓
Transcribed Text
    ↓
onTranscriptComplete callback
```

### Key Components

#### 1. **VAD (Voice Activity Detection)**
**File**: `lib/vad.ts` (legacy) + `hooks/useElevenLabsVoice.ts` (current)

**How it works**:
- Monitors audio energy in speech frequency range (300Hz - 3400Hz)
- Uses adaptive noise floor to handle varying environments
- Detects speech start when energy exceeds threshold for 120ms
- Detects speech end when silence exceeds 1000ms

**Configuration**:
```typescript
VAD_CONFIG = {
  energyThreshold: 0.06,        // Base energy threshold
  speechStartMs: 120,           // Confirm speech after 120ms
  silenceEndMs: 1000,           // End speech after 1s silence
  minRecordingMs: 300,          // Minimum recording duration
  minSpeechDurationMs: 400,     // Minimum speech to process
  noiseMultiplier: 2.2,         // Adaptive threshold multiplier
}
```

**Features**:
- Adaptive noise floor (adjusts to environment)
- Hysteresis (different thresholds for start vs end)
- Speech frequency filtering (focuses on human voice range)

#### 2. **Audio Recording**
**File**: `hooks/useElevenLabsVoice.ts` (lines 342-386)

**Process**:
1. Creates `MediaRecorder` from microphone stream
2. Records audio chunks every 100ms
3. Stops when VAD detects silence
4. Combines chunks into single `Blob`

**Format**: `audio/webm;codecs=opus` (or fallback to `audio/webm`)

#### 3. **Transcription API**
**File**: `app/api/stt/whisper/route.ts`

**Endpoint**: `POST /api/stt/whisper`

**Process**:
1. Receives audio `FormData`
2. Forwards to OpenAI Whisper API
3. Returns transcribed text

**API Details**:
- Model: `whisper-1`
- Language: `en` (English)
- Format: Audio file (webm/mp4)

**Alternative**: `app/api/stt/elevenlabs/route.ts` (ElevenLabs STT - not currently used)

### State Transitions

```
idle → listening → thinking → speaking → listening (loop)
```

- **listening**: VAD active, recording audio
- **thinking**: Audio sent for transcription
- **speaking**: AI response being played

---

## 🔊 Text-to-Speech (TTS) Pipeline

### Architecture

The TTS pipeline uses **ElevenLabs WebSocket API** for real-time streaming:

1. **Text Buffering** - Accumulates text chunks from OpenAI
2. **WebSocket Streaming** - Sends text to ElevenLabs in real-time
3. **Audio Playback** - Plays received audio chunks immediately

### Flow Diagram

```
OpenAI Stream (token by token)
    ↓
streamToTTS(text) called
    ↓
TextBuffer.add(text)
    ↓
Buffer checks: minChars (30) or sentence boundary
    ↓
Buffer.flush() → Text sent to ElevenLabs WebSocket
    ↓
ElevenLabs processes text → Audio chunks
    ↓
AudioPlayer.queueChunk(audio)
    ↓
Real-time playback
    ↓
onSpeakingComplete (when audio ends)
```

### Key Components

#### 1. **ElevenLabs WebSocket Manager**
**File**: `lib/elevenLabsWebSocket.ts`

**Connection**:
- URL: `wss://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream-input`
- Model: `eleven_flash_v2_5` (low latency)
- Authentication: API key sent in initial message

**Features**:
- Multi-context support (for barge-in)
- Keep-alive mechanism (prevents timeout)
- Automatic reconnection
- Real-time audio streaming

**Methods**:
- `connect()` - Establish WebSocket connection
- `createContext()` - Create new speech context
- `sendText(text, flush)` - Send text chunk
- `closeContext()` - Close context (for barge-in)

#### 2. **Text Buffer**
**File**: `lib/textBuffer.ts`

**Purpose**: Accumulates text chunks and flushes at optimal times

**Configuration**:
```typescript
{
  minChars: 30,        // Minimum before flushing
  maxChars: 60,        // Maximum before forced flush
  sentenceBoundaries: true  // Flush on sentence end
}
```

**Flush Conditions**:
1. Buffer reaches `maxChars` (60)
2. Buffer has `minChars` (30) + sentence boundary (`.`, `!`, `?`)
3. First chunk has 12+ chars (faster initial speech)

**Why Buffer?**:
- Better audio quality (full sentences)
- Lower latency (starts speaking sooner)
- Natural pauses (sentence boundaries)

#### 3. **Audio Player**
**File**: `lib/audioPlayer.ts`

**Purpose**: Plays audio chunks in real-time as they arrive

**Features**:
- Queues audio chunks
- Plays immediately when chunks arrive
- Handles audio context lifecycle
- Tracks playback state

#### 4. **Alternative Implementation**
**File**: `lib/voice/TextToSpeech.ts`

**Note**: Alternative implementation using ElevenLabs Multi-Context API. Currently, the main implementation uses `ElevenLabsWebSocketManager` from `lib/elevenLabsWebSocket.ts`.

---

## 🔄 Complete Voice Conversation Flow

### Full Pipeline

```
1. User clicks "Start Conversation"
   ↓
2. Initialize TTS WebSocket (ElevenLabs)
   ↓
3. Start Microphone + VAD
   ↓
4. State: listening
   ↓
5. User speaks → VAD detects speech
   ↓
6. MediaRecorder captures audio
   ↓
7. User stops → VAD detects silence (1s)
   ↓
8. Stop recording → Create audio Blob
   ↓
9. State: thinking
   ↓
10. POST /api/stt/whisper → OpenAI Whisper
    ↓
11. Receive transcribed text
    ↓
12. onTranscriptComplete(text) → Send to OpenAI Chat API
    ↓
13. OpenAI streams response (token by token)
    ↓
14. For each token → streamToTTS(token)
    ↓
15. TextBuffer accumulates tokens
    ↓
16. Buffer flushes → ElevenLabs WebSocket
    ↓
17. ElevenLabs generates audio chunks
    ↓
18. AudioPlayer plays chunks in real-time
    ↓
19. State: speaking
    ↓
20. Audio playback ends → onSpeakingComplete
    ↓
21. State: listening (loop back to step 5)
```

### Parallel Processing

**Key Optimization**: TTS starts speaking **while** OpenAI is still streaming:

```
OpenAI Stream: "Hello, how can I..."
                    ↓
TextBuffer: "Hello, " → flush → TTS starts speaking
                    ↓
OpenAI Stream: "... help you today?"
                    ↓
TextBuffer: "how can I help you today?" → flush → TTS continues
```

This reduces total latency from ~4-5s to ~2s.

---

## 🎯 Key Features

### 1. **Barge-In (Interruption)**
When user speaks while AI is speaking:

1. VAD detects speech during `speaking` state
2. `handleBargeIn()` called
3. Close current TTS context
4. Stop audio playback
5. Abort OpenAI stream
6. Clear text buffer
7. Return to `listening` state

### 2. **Low Latency Optimizations**

- **Smaller buffers**: 30-60 chars (vs 100+)
- **Flash model**: `eleven_flash_v2_5` (faster than standard)
- **Parallel processing**: TTS starts before OpenAI finishes
- **Fast VAD**: 120ms speech confirmation, 1000ms silence detection

### 3. **Error Handling**

- Automatic WebSocket reconnection
- Graceful degradation (falls back to text if voice fails)
- Error logging via `voiceLogger`
- State recovery on errors

---

## 📊 Performance Metrics

### Target Latencies

| Stage | Target | Typical |
|-------|--------|---------|
| STT (Whisper) | < 500ms | ~100-300ms |
| TTS First Audio | < 1.5s | ~200-500ms |
| Total Response | < 2s | ~1-2s |

### Current Performance

- **STT**: ~200-400ms (OpenAI Whisper)
- **TTS First Chunk**: ~300-600ms (ElevenLabs Flash)
- **Total**: ~1.5-2.5s (end-to-end)

---

## 🔧 Configuration

### Environment Variables

```env
# ElevenLabs
ELEVENLABS_API_KEY=your-key-here
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=GzE4TcXfh9rYCU9gVgPp

# OpenAI
OPENAI_API_KEY=sk-your-key-here
```

### Voice Settings

```typescript
{
  voiceId: 'GzE4TcXfh9rYCU9gVgPp',
  modelId: 'eleven_flash_v2_5',
  voiceSettings: {
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.0,
    useSpeakerBoost: true,
    speed: 1.0,
  }
}
```

---

## 📁 File Structure

```
lib/
├── liveTranscription.ts          # Browser SpeechRecognition (legacy)
├── elevenLabsWebSocket.ts       # TTS WebSocket manager (main)
├── textBuffer.ts                 # Text buffering for TTS
├── audioPlayer.ts                # Audio playback
├── vad.ts                        # VAD implementation (legacy)
└── voice/
    ├── SpeechToText.ts           # Alternative STT implementation
    └── TextToSpeech.ts           # Alternative TTS implementation

hooks/
└── useElevenLabsVoice.ts        # Main voice hook (orchestrates everything)

app/api/stt/
├── whisper/route.ts             # OpenAI Whisper STT endpoint
└── elevenlabs/route.ts          # ElevenLabs STT endpoint (unused)
```

---

## 🐛 Debugging

### Enable VAD Debug Logging

In `hooks/useElevenLabsVoice.ts`:
```typescript
const VAD_CONFIG = {
  debugLogging: true,  // Enable detailed logs
  // ...
}
```

### Voice Logger

All voice events are logged via `voiceLogger`:
- State transitions
- Timing metrics
- Error events
- Conversation context

Check browser console for `[Voice]` and `[VAD]` logs.

---

## 🔄 State Machine

```
┌─────┐
│idle │
└──┬──┘
   │ startConversation()
   ↓
┌──────────┐
│listening │ ←──────────────────┐
└────┬─────┘                     │
     │ VAD detects speech        │
     ↓                           │
┌──────────┐                     │
│thinking  │                     │
└────┬─────┘                     │
     │ Transcription complete    │
     │ OpenAI starts streaming   │
     ↓                           │
┌──────────┐                     │
│speaking  │                     │
└────┬─────┘                     │
     │ Audio playback ends       │
     └───────────────────────────┘
```

**Error State**: Any state can transition to `error` on failure.

---

## 📝 Notes

1. **No Live Transcription**: Unlike ChatGPT, this implementation doesn't show live transcription while user speaks. It waits for complete utterance.

2. **Whisper vs ElevenLabs STT**: Currently uses OpenAI Whisper for STT (more reliable). ElevenLabs STT endpoint exists but is not used.

3. **Browser Compatibility**: 
   - VAD: All modern browsers (Web Audio API)
   - MediaRecorder: All modern browsers
   - WebSocket TTS: All modern browsers

4. **Alternative Implementations**: There are alternative STT/TTS implementations in `lib/voice/` but the main implementation uses the files listed above.

---

## 🚀 Future Improvements

- [ ] Add live transcription preview (like ChatGPT)
- [ ] Support multiple languages
- [ ] Voice cloning customization
- [ ] Better barge-in detection
- [ ] Offline STT fallback

