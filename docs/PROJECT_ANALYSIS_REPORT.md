# ICP Builder - Project Analysis Report

**Generated:** 2025-01-27  
**Analyst:** Codebase Archaeologist  
**Purpose:** Deep understanding of current implementation, bugs, and incremental fixes

---

## 1. Project Summary

### What the App Does

**ICP Builder** is a Next.js-based voice conversational AI application designed to help users build their Ideal Customer Profile (ICP) through natural voice conversations. The app guides users through 5 structured sections:

1. **Company Basics** - Company name, size, industry, location
2. **Target Customer** - Customer type (B2B/B2C), demographics, psychographics
3. **Problem & Pain** - Main problems, pain points, current solutions
4. **Buying Process** - Decision makers, buying process steps, evaluation criteria
5. **Budget & Decision Maker** - Budget range, decision maker role, approval process

The AI assistant (named "Alex") extracts ICP information from conversations, tracks progress (0-100%), and provides contextual guidance based on what's already been gathered.

### Who It's For

Inferred from UI and flows:
- **Target Users:** Business professionals, entrepreneurs, sales/marketing teams building customer profiles
- **Use Case:** Interactive discovery session to systematically build ICP documentation
- **Access Pattern:** Session-based (no authentication), persistent across page refreshes via localStorage

### Key Features Implemented

✅ **Session Management**
- Session creation and persistence (localStorage)
- Session validation via API
- Multiple chats per session

✅ **Chat Infrastructure**
- Chat creation, listing, deletion
- Message storage and retrieval (Supabase)
- Chat history with last message preview
- Automatic title generation from first message

✅ **AI Integration**
- OpenAI GPT-4o-mini for conversational responses
- Streaming responses (Server-Sent Events)
- Context-aware conversations with chat history
- System prompt for ICP guidance

✅ **ICP Intelligence**
- Automatic ICP data extraction from messages
- Progress tracking (0-100% based on completed sections)
- 5-section ICP structure
- Contextual AI guidance based on progress

✅ **Voice System**
- Voice Activity Detection (VAD) using AudioContext + AnalyserNode
- Speech-to-Text via ElevenLabs STT API (batch/recording-based)
- Text-to-Speech via ElevenLabs WebSocket (streaming)
- Barge-in detection (user interrupts AI)
- State machine: idle → listening → thinking → speaking → error
- Pause/resume functionality

### What's Incomplete / Stubbed / Experimental

⚠️ **Live Transcription**
- `lib/liveTranscription.ts` exists but is **not actively used** in the voice hook
- Live transcription would show real-time text as user speaks (like ChatGPT Voice)
- Currently only shows transcript after speech ends

⚠️ **ChatId Stability**
- ChatId is created per message if none exists (line 215-239 in `app/page.tsx`)
- Should be stable across conversation turns but currently creates new chat on first message
- No explicit "conversation session" concept - chatId should persist for entire voice conversation

⚠️ **Error Handling**
- Inconsistent error handling across async operations
- Some errors are logged but not shown to user
- WebSocket reconnection has retry limit but no user feedback

⚠️ **Testing**
- No unit tests
- No integration tests
- No E2E tests
- Manual testing only

---

## 2. How to Run

### Local Run Steps

```bash
# Install dependencies
npm install

# Set up environment variables (create .env.local)
# See Environment Variables section below

# Run development server
npm run dev

# Open browser to http://localhost:3000
```

### Key Environment Variables

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `OPENAI_API_KEY` - OpenAI API key
- `ELEVENLABS_API_KEY` - ElevenLabs API key

**Optional:**
- `OPENAI_MODEL` - Default: `gpt-4o-mini`
- `ELEVENLABS_VOICE_ID` - Default: `JBFqnCBsd6RMkjVDRZzb` (or `GzE4TcXfh9rYCU9gVgPp` based on code)
- `NEXT_PUBLIC_ELEVENLABS_VOICE_ID` - Client-side voice ID override

### Where Config is Defined

- **Environment Variables:** `.env.local` (not in repo, must create)
- **Next.js Config:** `next.config.js` (minimal, no special config)
- **Tailwind Config:** `tailwind.config.ts`
- **TypeScript Config:** `tsconfig.json`
- **Package Config:** `package.json`

### Known Setup Pitfalls

1. **Missing .env.local** - App will fail silently or show cryptic errors
2. **Supabase Migrations** - Must run 3 migrations in order:
   - `001_create_sessions_table.sql`
   - `002_create_chats_and_messages_tables.sql`
   - `003_create_icp_data_table.sql`
3. **Browser Permissions** - Microphone access required (HTTPS or localhost)
4. **ElevenLabs API Key** - Must be valid and have STT + TTS access
5. **Audio Context** - Browser may suspend AudioContext on first user interaction (handled in code)

---

## 3. Architecture Overview

### Main Services/Modules

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                       │
├─────────────────────────────────────────────────────────────┤
│  app/page.tsx (Main orchestrator)                            │
│    ├─ ChatArea (Message display)                             │
│    ├─ ChatInput (Text input fallback)                        │
│    ├─ VoicePanel (Voice controls + VAD)                      │
│    └─ Sidebar (Chat list)                                    │
│                                                              │
│  hooks/useElevenLabsVoice.ts (Voice state machine)          │
│    ├─ VAD (lib/vad.ts) - Speech detection                    │
│    ├─ MediaRecorder - Audio capture                          │
│    ├─ ElevenLabsWebSocket (lib/elevenLabsWebSocket.ts) - TTS │
│    ├─ AudioPlayer (lib/audioPlayer.ts) - Audio playback      │
│    └─ TextBuffer (lib/textBuffer.ts) - TTS buffering         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Next.js API)                      │
├─────────────────────────────────────────────────────────────┤
│  /api/sessions - Session management                           │
│  /api/chats - Chat CRUD                                      │
│  /api/chats/[chatId]/messages - Message storage              │
│  /api/chats/[chatId]/icp - ICP data                          │
│  /api/ai/chat - OpenAI streaming (SSE)                       │
│  /api/stt/elevenlabs - ElevenLabs STT (batch)                │
│  /api/voice/websocket-key - TTS API key (security)           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                          │
├─────────────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL) - Data persistence                     │
│  OpenAI API - LLM (GPT-4o-mini)                              │
│  ElevenLabs API - STT (batch) + TTS (WebSocket streaming)    │
└─────────────────────────────────────────────────────────────┘
```

### Entry Points

**Frontend Entry:**
- `app/page.tsx` - Main page component, orchestrates all UI and voice interactions
- `app/layout.tsx` - Root layout with global styles

**Backend Entry:**
- `app/api/*/route.ts` - Next.js App Router API routes (serverless functions)

### Key Folders and Responsibilities

```
final/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (backend)
│   ├── page.tsx            # Main page (orchestrator)
│   └── layout.tsx          # Root layout
│
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   ├── ChatArea.tsx        # Message display
│   ├── ChatHeader.tsx      # Header with progress
│   ├── ChatInput.tsx       # Text input
│   ├── Sidebar.tsx         # Chat list
│   └── VoicePanel.tsx      # Voice controls + VAD
│
├── hooks/                  # Custom React hooks
│   └── useElevenLabsVoice.ts  # Voice state machine
│
├── lib/                    # Utility libraries
│   ├── supabase.ts         # Supabase client
│   ├── session.ts          # Session management
│   ├── icp-analyzer.ts     # ICP extraction
│   ├── vad.ts              # Voice Activity Detection
│   ├── elevenLabsWebSocket.ts  # TTS WebSocket
│   ├── audioPlayer.ts      # Audio playback
│   ├── textBuffer.ts       # TTS buffering
│   └── liveTranscription.ts  # Live STT (unused)
│
├── types/                  # TypeScript types
│   ├── chat.ts             # Chat/Message types
│   ├── icp.ts              # ICP data types
│   └── session.ts          # Session types
│
└── supabase/               # Database migrations
    └── migrations/         # SQL migration files
```

### Data Models / State Management

**State Management:** React hooks (useState, useRef, useCallback) - no external state library

**Data Models:**

1. **Session** (`types/session.ts`)
   - `id: UUID` - Unique session identifier
   - `created_at: TIMESTAMPTZ`
   - `updated_at: TIMESTAMPTZ`
   - Persisted in localStorage + Supabase

2. **Chat** (`types/chat.ts`)
   - `id: UUID` - Chat identifier
   - `session_id: UUID` - Foreign key to sessions
   - `title: TEXT` - Chat title (auto-generated)
   - `created_at: TIMESTAMPTZ`
   - `updated_at: TIMESTAMPTZ` - Auto-updated on message insert

3. **Message** (`types/chat.ts`)
   - `id: UUID`
   - `chat_id: UUID` - Foreign key to chats
   - `role: 'user' | 'assistant'`
   - `content: TEXT`
   - `created_at: TIMESTAMPTZ`

4. **ICPData** (`types/icp.ts`)
   - `id: UUID`
   - `chat_id: UUID` - Foreign key to chats
   - 5 sections with completion flags
   - Progress calculated as: `(completed_sections / 5) * 100`

**State Flow:**
```
User Action → Voice Hook → State Update → API Call → Database → State Update → UI Update
```

---

## 4. Voice System Reality Check

### Complete Voice Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    VOICE CONVERSATION PIPELINE                           │
└─────────────────────────────────────────────────────────────────────────┘

1. MIC CAPTURE
   Location: hooks/useElevenLabsVoice.ts:172-193 (startMic)
   Protocol: getUserMedia API
   Format: MediaStream (browser-native)
   Sample Rate: Browser default (typically 44100Hz or 48000Hz)
   Codec: Browser handles encoding
   Preprocessing: echoCancellation, noiseSuppression, autoGainControl enabled

2. VAD (Voice Activity Detection)
   Location: lib/vad.ts (createVAD function)
   Method: AudioContext + AnalyserNode → RMS energy calculation
   Frequency Focus: 300Hz - 3400Hz (human speech range)
   Threshold: 0.03 (configurable, higher = less sensitive)
   Timing:
     - Speech Start: 150ms of speech energy
     - Pause During Speech: 1500ms silence → auto-send
     - Speech End: 2500ms silence → complete end
   Callbacks: onSpeechStart, onPauseDuringSpeech, onSpeechEnd

3. AUDIO RECORDING
   Location: hooks/useElevenLabsVoice.ts:209-247 (startRecording)
   Method: MediaRecorder API
   Format: audio/webm;codecs=opus (preferred) or audio/webm or audio/mp4
   Chunk Size: 100ms intervals (mediaRecorder.start(100))
   Storage: recordingChunksRef.current (Blob array)
   ⚠️ BATCH MODE: Records entire utterance, then stops

4. STT (Speech-to-Text)
   Location: hooks/useElevenLabsVoice.ts:366-439 (stopRecordingAndTranscribe)
   Service: ElevenLabs STT API
   Endpoint: /api/stt/elevenlabs → https://api.elevenlabs.io/v1/speech-to-text
   Protocol: HTTP POST (FormData)
   Format: Audio Blob (webm/mp4)
   ⚠️ NOT STREAMING: Waits for speech end → creates blob → sends → waits for response
   Latency: ~3-5 seconds minimum (2.5s silence + blob creation + network + processing)
   Code Location: app/api/stt/elevenlabs/route.ts

5. LLM CALL
   Location: app/page.tsx:352-501 (handleSendMessage)
   Service: OpenAI API
   Endpoint: /api/ai/chat → https://api.openai.com/v1/chat/completions
   Protocol: HTTP POST with Server-Sent Events (SSE) streaming
   Model: gpt-4o-mini (default)
   Streaming: ✅ YES (chunks arrive incrementally)
   Abort Support: ✅ YES (AbortController for barge-in)
   Code Location: app/api/ai/chat/route.ts

6. TTS (Text-to-Speech)
   Location: lib/elevenLabsWebSocket.ts (ElevenLabsWebSocketManager)
   Service: ElevenLabs TTS API
   Endpoint: wss://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream-input
   Protocol: WebSocket (streaming)
   Format: PCM audio chunks (ArrayBuffer)
   Voice ID: JBFqnCBsd6RMkjVDRZzb (default, or from env)
   Model: eleven_multilingual_v2
   Streaming: ✅ YES (chunks stream as generated)
   Buffering: TextBuffer (lib/textBuffer.ts) - buffers 50-100 chars or sentence boundaries
   Code Location: hooks/useElevenLabsVoice.ts:479-492 (streamToTTS)

7. AUDIO PLAYBACK
   Location: lib/audioPlayer.ts (AudioPlayer class)
   Method: AudioContext + AudioBufferSourceNode
   Format: Decoded PCM from ArrayBuffer chunks
   Queue: audioQueue array (FIFO)
   Strategy: Sequential playback (chunk ends → play next chunk)
   ⚠️ NOT TRUE STREAMING: Decodes each chunk fully before playing
   Interruption: ✅ YES (stop() clears queue and stops current playback)

8. INTERRUPTION BEHAVIOR (Barge-in)
   Location: hooks/useElevenLabsVoice.ts:444-474 (handleBargeIn)
   Detection: VAD detects speech during 'speaking' state
   Actions:
     - Close ElevenLabs WebSocket context (flush with empty text)
     - Stop AudioPlayer (clears queue)
     - Clear TextBuffer
     - Abort OpenAI stream (via AbortController)
     - Transition to 'listening' state
   ⚠️ RACE CONDITIONS: Multiple async operations, timing issues possible

9. CONCURRENCY MODEL
   - Single-threaded JavaScript (event loop)
   - Async/await for I/O operations
   - WebSocket for TTS (persistent connection)
   - MediaRecorder for audio capture (browser API)
   - AudioContext for VAD and playback (browser API)
   - No Web Workers (all on main thread)
   - State managed via React hooks (useState, useRef)
```

### Network Protocols

- **STT:** HTTP POST (FormData) - batch mode
- **LLM:** HTTP POST with SSE (Server-Sent Events) - streaming
- **TTS:** WebSocket (WSS) - streaming
- **Data:** HTTP REST API (Supabase client)

### Audio Formats

- **Capture:** MediaStream → MediaRecorder → Blob (webm/opus or mp4)
- **STT Input:** Blob (webm/mp4) sent as FormData
- **TTS Output:** PCM audio chunks (ArrayBuffer) via WebSocket
- **Playback:** Decoded PCM via AudioContext

### Exact Code Locations

| Stage | File | Function/Class | Lines |
|-------|------|----------------|-------|
| Mic Capture | `hooks/useElevenLabsVoice.ts` | `startMic()` | 172-193 |
| VAD | `lib/vad.ts` | `createVAD()` | 16-163 |
| Recording | `hooks/useElevenLabsVoice.ts` | `startRecording()` | 209-247 |
| STT | `hooks/useElevenLabsVoice.ts` | `stopRecordingAndTranscribe()` | 366-439 |
| STT API | `app/api/stt/elevenlabs/route.ts` | `POST()` | 4-67 |
| LLM | `app/page.tsx` | `handleSendMessage()` | 352-501 |
| LLM API | `app/api/ai/chat/route.ts` | `POST()` | 5-217 |
| TTS | `lib/elevenLabsWebSocket.ts` | `ElevenLabsWebSocketManager` | 23-332 |
| TTS Stream | `hooks/useElevenLabsVoice.ts` | `streamToTTS()` | 479-492 |
| Audio Playback | `lib/audioPlayer.ts` | `AudioPlayer` | 6-187 |
| Barge-in | `hooks/useElevenLabsVoice.ts` | `handleBargeIn()` | 444-474 |

---

## 5. Bugs & Issues (Prioritized)

### 🔴 BLOCKER: ChatId Not Stable Across Conversation Turns

**Symptom:** Each voice turn may create a new chat instead of reusing the same chatId.

**Root Cause:** 
- Location: `app/page.tsx:213-239`
- `handleSendMessage` creates a new chat if `selectedChatId` is undefined
- When voice conversation starts, `selectedChatId` is not set
- First message creates chat, but subsequent messages might not reuse it if state is cleared

**Severity:** Blocker

**How to Reproduce:**
1. Start voice conversation
2. Speak first message → chat created
3. Speak second message → might create new chat if selectedChatId is undefined

**Minimal Fix:**
```typescript
// In app/page.tsx, add ref to track conversation chatId
const conversationChatIdRef = useRef<string | null>(null);

// In startConversation (or when first message sent), set it once
if (!conversationChatIdRef.current) {
  // Create or get chatId
  conversationChatIdRef.current = chatId;
}

// In handleSendMessage, use conversationChatIdRef.current if available
let chatId = conversationChatIdRef.current || selectedChatId;
```

**How to Test:**
- Start conversation, send 3 messages via voice
- Check database: should have 1 chat with 6 messages (3 user + 3 assistant)
- Verify chatId stays same across turns

---

### 🔴 HIGH: STT is Batch Mode (Not Streaming)

**Symptom:** User must wait 2.5 seconds of silence + transcription time before seeing results. No real-time feedback.

**Root Cause:**
- Location: `hooks/useElevenLabsVoice.ts:366-439`
- Uses MediaRecorder to record entire utterance
- Only transcribes after speech ends (2.5s silence)
- ElevenLabs STT API is batch-only (no streaming endpoint used)

**Severity:** High (UX issue, not a bug per se)

**How to Reproduce:**
1. Start voice conversation
2. Speak a sentence
3. Wait 2.5 seconds of silence
4. Wait additional 1-2 seconds for transcription
5. See transcript appear (no live preview)

**Minimal Fix:**
- Option 1: Use browser SpeechRecognition API for live preview (already exists in `lib/liveTranscription.ts` but unused)
- Option 2: Keep batch STT but add "listening..." indicator
- Option 3: Switch to streaming STT service (Deepgram, AssemblyAI)

**How to Test:**
- Verify live transcript appears as user speaks (if using SpeechRecognition)
- Verify final transcript matches after ElevenLabs STT completes

---

### 🟡 HIGH: Race Condition in Barge-in

**Symptom:** Barge-in might not properly abort OpenAI stream or stop TTS in all cases.

**Root Cause:**
- Location: `hooks/useElevenLabsVoice.ts:444-474` and `app/page.tsx:38-43`
- Multiple async operations: WebSocket close, audio stop, buffer clear, abort controller
- Timing: VAD detects speech → calls handleBargeIn → but OpenAI stream might already be processing
- AbortController might not be set when barge-in occurs

**Severity:** High

**How to Reproduce:**
1. Start conversation, let AI speak
2. Interrupt mid-sentence (speak during AI speech)
3. Sometimes OpenAI continues streaming
4. Sometimes audio doesn't stop immediately

**Minimal Fix:**
```typescript
// In handleBargeIn, ensure all operations are synchronous where possible
// Add state check before aborting
if (openaiAbortControllerRef.current && !openaiAbortControllerRef.current.signal.aborted) {
  openaiAbortControllerRef.current.abort();
}
```

**How to Test:**
- Interrupt AI 10 times during speech
- Verify OpenAI stream aborts 100% of the time
- Verify audio stops immediately 100% of the time

---

### 🟡 HIGH: Audio Player Queue Can Cause Stack Overflow

**Symptom:** Very long AI responses might cause performance issues or stack overflow.

**Root Cause:**
- Location: `lib/audioPlayer.ts:58-83`
- Recursive `playChunk` calls via `setTimeout` (line 63)
- If many chunks queue up, setTimeout chain could be long
- Fixed in code (uses setTimeout) but still potential issue with very long responses

**Severity:** Medium (edge case)

**How to Reproduce:**
- Get AI to generate very long response (1000+ tokens)
- Many audio chunks queue up
- Potential performance degradation

**Minimal Fix:**
- Already uses setTimeout (good)
- Consider adding queue size limit
- Consider using MediaSource API for true streaming (more complex)

**How to Test:**
- Generate 5-minute AI response
- Verify audio plays smoothly without lag

---

### 🟡 MEDIUM: VAD Cleanup May Fail

**Symptom:** Potential errors when VAD cleanup is called after AudioContext is closed.

**Root Cause:**
- Location: `lib/vad.ts:152-162`
- Cleanup tries to disconnect analyser
- If AudioContext is already closed, might throw error
- Has try-catch but might not handle all cases

**Severity:** Medium

**How to Reproduce:**
- Start conversation
- Quickly end conversation
- Check console for errors

**Minimal Fix:**
```typescript
// Already has try-catch, but verify AudioContext state
if (audioContext.state !== 'closed') {
  analyser.disconnect();
}
```

**How to Test:**
- Start/end conversation rapidly 10 times
- Verify no console errors

---

### 🟡 MEDIUM: WebSocket Reconnection Has No User Feedback

**Symptom:** If TTS WebSocket disconnects, it silently reconnects without user awareness.

**Root Cause:**
- Location: `lib/elevenLabsWebSocket.ts:99-115`
- Reconnection happens automatically (up to 5 attempts)
- No UI feedback to user
- If max retries reached, error callback is called but user might not see it

**Severity:** Medium

**How to Reproduce:**
- Disconnect network during TTS
- WebSocket tries to reconnect
- User sees no indication

**Minimal Fix:**
- Add UI toast/notification for reconnection attempts
- Show error message if reconnection fails

**How to Test:**
- Simulate network disconnect during TTS
- Verify user sees reconnection status

---

### 🟢 LOW: Inconsistent Error Handling

**Symptom:** Some errors are logged but not shown to user, error messages vary in format.

**Root Cause:**
- Multiple files
- Some use `onError` callback, others just `console.error`
- No centralized error handling

**Severity:** Low

**How to Reproduce:**
- Trigger various error conditions
- Some show user-friendly messages, others don't

**Minimal Fix:**
- Create centralized error handler
- Standardize error message format
- Always show user-friendly messages

**How to Test:**
- Trigger all error paths
- Verify consistent error messages

---

### 🟢 LOW: Missing Null Check in TextBuffer

**Symptom:** Potential runtime error if sentence boundary regex doesn't match.

**Root Cause:**
- Location: `lib/textBuffer.ts:50`
- Uses optional chaining (`sentenceEndMatch?.index`) - already fixed
- But worth verifying

**Severity:** Low (likely already fixed)

**How to Test:**
- Send text without sentence boundaries
- Verify no errors

---

## 6. Suggested Fix Plan (Incremental)

### Phase 1: Critical Stability Fixes (Week 1)

**Goal:** Fix blockers and high-priority bugs

1. **Fix ChatId Stability**
   - Add `conversationChatIdRef` in `app/page.tsx`
   - Set once when conversation starts
   - Reuse across all turns
   - **Verify:** Single chat per conversation session

2. **Improve Barge-in Reliability**
   - Add state checks before abort operations
   - Ensure AbortController is always set before OpenAI call
   - Add timeout for barge-in operations
   - **Verify:** 100% barge-in success rate

3. **Add Error Logging**
   - Centralized error handler
   - User-friendly error messages
   - **Verify:** All errors are logged and shown

**Success Criteria:**
- ✅ ChatId stable across conversation
- ✅ Barge-in works 100% of the time
- ✅ All errors are user-visible

---

### Phase 2: UX Improvements (Week 2)

**Goal:** Improve user experience without major architecture changes

1. **Add Live Transcription Preview**
   - Enable `LiveTranscription` class (already exists)
   - Show interim results in VoicePanel
   - Keep ElevenLabs STT for final accuracy
   - **Verify:** User sees text as they speak

2. **Improve Loading States**
   - Show "listening..." indicator
   - Show "transcribing..." indicator
   - Show "thinking..." indicator (already exists)
   - **Verify:** User always knows what's happening

3. **WebSocket Reconnection Feedback**
   - Add toast notifications for reconnection
   - Show error if reconnection fails
   - **Verify:** User aware of connection issues

**Success Criteria:**
- ✅ Live transcription preview works
- ✅ All states have clear UI indicators
- ✅ Connection issues are visible

---

### Phase 3: Performance & Reliability (Week 3)

**Goal:** Optimize performance and handle edge cases

1. **Optimize Audio Playback**
   - Consider MediaSource API for true streaming (if needed)
   - Add queue size limits
   - **Verify:** Smooth playback for long responses

2. **Improve VAD Cleanup**
   - Verify all cleanup paths
   - Add state checks
   - **Verify:** No errors on rapid start/stop

3. **Add Retry Logic**
   - Retry STT on failure
   - Retry OpenAI on failure (with backoff)
   - **Verify:** Transient failures are handled

**Success Criteria:**
- ✅ No performance issues with long responses
- ✅ No errors on rapid start/stop
- ✅ Transient failures are retried

---

### Phase 4: Testing & Monitoring (Week 4)

**Goal:** Add observability and basic testing

1. **Add Logging**
   - Structured logging for all voice operations
   - Log timing information (latency metrics)
   - **Verify:** Can debug issues from logs

2. **Add Basic Tests**
   - Unit tests for VAD
   - Unit tests for TextBuffer
   - Integration test for voice flow
   - **Verify:** Tests pass, catch regressions

3. **Add Monitoring**
   - Track conversation success rate
   - Track barge-in success rate
   - Track error rates
   - **Verify:** Can identify issues in production

**Success Criteria:**
- ✅ Comprehensive logging in place
- ✅ Basic test suite exists
- ✅ Monitoring dashboard (if applicable)

---

### Phase 5: Optional Enhancements (Future)

**Goal:** Consider architectural improvements (only if needed)

1. **Evaluate Streaming STT**
   - Research Deepgram/AssemblyAI
   - Compare cost vs. latency benefits
   - **Decision:** Only if batch STT is unacceptable

2. **Consider Web Workers**
   - Move VAD to Web Worker (if performance issues)
   - Move audio processing to Web Worker
   - **Decision:** Only if main thread is blocked

3. **Consider State Management**
   - Evaluate Zustand/Redux if state becomes complex
   - **Decision:** Only if current hooks become unwieldy

**Success Criteria:**
- ✅ Architecture decisions documented
- ✅ No premature optimization

---

## 7. ChatGPT Context Pack

### PASTE THIS INTO CHATGPT

```
I have a Next.js voice conversational AI app called "ICP Builder" that helps users build Ideal Customer Profiles through voice conversations. The app uses ElevenLabs for STT (batch mode) and TTS (streaming WebSocket), OpenAI GPT-4o-mini for LLM, and Supabase for data persistence.

VOICE FLOW:
1. User speaks → VAD detects speech (AudioContext + AnalyserNode, 150ms threshold)
2. MediaRecorder captures audio in 100ms chunks (batch mode, not streaming)
3. After 2.5s silence → stop recording, create blob, send to ElevenLabs STT API
4. Get transcription → send to OpenAI (streaming SSE)
5. Stream OpenAI response → buffer text (50-100 chars) → send to ElevenLabs TTS WebSocket
6. Receive audio chunks → queue in AudioPlayer → play sequentially
7. Barge-in: VAD detects speech during 'speaking' → abort OpenAI, stop TTS, clear buffer

TOP PROBLEM AREAS:
1. ChatId not stable - creates new chat per message instead of reusing across conversation turns
2. STT is batch mode (not streaming) - 3-5s latency, no live preview
3. Barge-in race conditions - sometimes doesn't abort OpenAI or stop TTS
4. Audio playback uses sequential chunk playback (not true streaming)
5. Error handling inconsistent - some errors not shown to user

TOP 10 FILES TO READ FIRST:
1. app/page.tsx - Main orchestrator, handles message flow and OpenAI streaming
2. hooks/useElevenLabsVoice.ts - Voice state machine, recording, transcription, TTS
3. lib/vad.ts - Voice Activity Detection (energy-based, 300-3400Hz focus)
4. lib/elevenLabsWebSocket.ts - TTS WebSocket manager (streaming)
5. lib/audioPlayer.ts - Audio playback (sequential chunk queue)
6. app/api/stt/elevenlabs/route.ts - ElevenLabs STT API endpoint (batch)
7. app/api/ai/chat/route.ts - OpenAI streaming endpoint (SSE)
8. components/VoicePanel.tsx - Voice UI, VAD initialization
9. lib/textBuffer.ts - TTS text buffering (50-100 chars or sentence boundaries)
10. lib/liveTranscription.ts - Browser SpeechRecognition (exists but unused)

COMMANDS TO RUN LOCALLY:
npm install
npm run dev
# Requires .env.local with: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY

QUESTIONS/UNKNOWNS:
- Should chatId be stable across entire voice conversation session? (Currently creates new chat per message)
- Should we use browser SpeechRecognition for live preview while keeping ElevenLabs for final accuracy?
- Is MediaSource API needed for true audio streaming, or is current sequential playback acceptable?
- Should we switch to streaming STT (Deepgram/AssemblyAI) or keep batch ElevenLabs?
- What's the expected latency for voice conversations? (Currently 3-5s minimum)
```

---

## 8. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │ Sidebar  │  │ChatArea  │  │ChatInput │  │VoicePanel│                │
│  │(Chat List)│ │(Messages)│ │(Text)    │  │(Voice UI) │                │
│  └──────────┘  └──────────┘  └──────────┘  └─────┬─────┘                │
└───────────────────────────────────────────────────┼─────────────────────┘
                                                    │
                                    ┌───────────────▼───────────────┐
                                    │   app/page.tsx               │
                                    │   (Main Orchestrator)         │
                                    │   - State Management          │
                                    │   - OpenAI Streaming          │
                                    │   - Message Handling          │
                                    └───────────────┬───────────────┘
                                                    │
                        ┌───────────────────────────┼───────────────────────────┐
                        │                           │                           │
            ┌───────────▼──────────┐    ┌───────────▼──────────┐    ┌───────────▼──────────┐
            │ useElevenLabsVoice   │    │  handleSendMessage    │    │  ICP Analyzer        │
            │ (Voice Hook)          │    │  (Message Handler)   │    │  (Data Extraction)   │
            │                       │    │                       │    │                       │
            │ State Machine:        │    │ - Create/Get ChatId   │    │ - Extract ICP Data    │
            │ idle→listening→       │    │ - Save Messages       │    │ - Update Progress    │
            │ thinking→speaking     │    │ - Stream OpenAI       │    │ - Calculate %        │
            │                       │    │ - Handle Abort        │    │                       │
            └───────────┬───────────┘    └───────────┬──────────┘    └──────────────────────┘
                        │                           │
        ┌───────────────┼───────────────┐           │
        │               │               │           │
┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐   │
│ VAD          │ │MediaRecorder│ │LiveTranscr.│   │
│ (lib/vad.ts) │ │(Recording)  │ │(Unused)    │   │
└───────┬──────┘ └──────┬───────┘ └────────────┘   │
        │               │                           │
        │        ┌──────▼───────┐                  │
        │        │ STT API      │                  │
        │        │ (ElevenLabs) │                  │
        │        │ (Batch)      │                  │
        │        └──────┬───────┘                  │
        │               │                           │
        │        ┌──────▼───────┐                  │
        │        │ Transcription│                  │
        │        │ (Text)       │                  │
        │        └──────┬───────┘                  │
        │               │                           │
        └───────────────┼───────────────────────────┘
                        │
            ┌───────────▼──────────┐
            │  OpenAI API          │
            │  (Streaming SSE)     │
            │  - GPT-4o-mini        │
            │  - AbortController   │
            └───────────┬──────────┘
                        │
            ┌───────────▼──────────┐
            │  TTS WebSocket        │
            │  (ElevenLabs)         │
            │  - Streaming          │
            │  - TextBuffer         │
            └───────────┬──────────┘
                        │
            ┌───────────▼──────────┐
            │  AudioPlayer          │
            │  - Queue Chunks       │
            │  - Sequential Play    │
            └───────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND API ROUTES                               │
│  /api/sessions          - Session management                             │
│  /api/chats             - Chat CRUD                                      │
│  /api/chats/[id]/messages - Message storage                              │
│  /api/chats/[id]/icp    - ICP data                                       │
│  /api/ai/chat           - OpenAI streaming (SSE)                         │
│  /api/stt/elevenlabs    - ElevenLabs STT (batch)                        │
│  /api/voice/websocket-key - TTS API key                                  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                 │
│  Supabase (PostgreSQL)  - Data persistence                              │
│  OpenAI API              - LLM (GPT-4o-mini, streaming)                  │
│  ElevenLabs API         - STT (batch) + TTS (WebSocket streaming)      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Recommended Logging Additions

### Critical Logs to Add

**1. Voice State Transitions**
```typescript
// In useElevenLabsVoice.ts, log all state changes
log(`[State] ${oldState} → ${newState}`, { timestamp: Date.now() });
```

**2. Timing Metrics**
```typescript
// Log latency for each stage
log(`[Timing] STT: ${sttEndTime - sttStartTime}ms`);
log(`[Timing] OpenAI: ${openaiEndTime - openaiStartTime}ms`);
log(`[Timing] TTS: ${ttsEndTime - ttsStartTime}ms`);
```

**3. Barge-in Events**
```typescript
// Log barge-in attempts and success
log(`[BargeIn] Detected`, { state: currentState });
log(`[BargeIn] OpenAI aborted: ${aborted}`, { hadController: !!controller });
log(`[BargeIn] TTS stopped: ${stopped}`);
```

**4. Error Context**
```typescript
// Log errors with full context
log(`[Error] ${error.message}`, {
  stage: 'STT' | 'OpenAI' | 'TTS' | 'Audio',
  state: currentState,
  isActive: isActiveRef.current,
  stack: error.stack,
});
```

**5. ChatId Tracking**
```typescript
// Log chatId usage
log(`[ChatId] Using chatId: ${chatId}`, { isNew: isNewChat, source: 'voice' | 'text' });
```

---

## 10. Summary

### Current State
- ✅ Core functionality works (voice → STT → LLM → TTS)
- ✅ ICP tracking and progress calculation
- ✅ Barge-in detection (but has race conditions)
- ⚠️ STT is batch mode (not streaming)
- ⚠️ ChatId not stable across conversation
- ⚠️ Some error handling gaps

### Top 3 Priorities
1. **Fix ChatId Stability** - Ensure one chat per conversation session
2. **Improve Barge-in Reliability** - Fix race conditions, ensure 100% success
3. **Add Live Transcription Preview** - Use existing LiveTranscription class for UX

### Architecture Assessment
- **Current architecture is sound** - No need for full rewrite
- **Incremental fixes are appropriate** - Address specific bugs and UX issues
- **Consider streaming STT later** - Only if batch latency is unacceptable

### Next Steps
1. Implement Phase 1 fixes (ChatId stability, barge-in, error handling)
2. Test thoroughly with real conversations
3. Monitor logs for timing and error patterns
4. Iterate based on user feedback

---

**End of Report**

