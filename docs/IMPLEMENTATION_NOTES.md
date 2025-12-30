# ICP Builder - Project Progress

## Project Overview

**ICP Builder** is a Next.js-based AI Voice Chat Application designed to help users build their Ideal Customer Profile (ICP). The application provides an interactive chat interface where users can have conversations with an AI assistant to understand their customers better.

### Technology Stack

- **Framework**: Next.js 16.1.1 (App Router)
- **Language**: TypeScript 5.9.3
- **UI Library**: React 19.2.3
- **Styling**: Tailwind CSS 3.4.19 with shadcn/ui components
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI API (GPT-4o-mini)
- **TTS**: ElevenLabs API
- **STT**: OpenAI Whisper API (refactored) 
---

## Implementation Phases

### Phase 1: Session System ✅ COMPLETE

**Status**: ✅ Fully implemented and tested

**What Was Built**:
- Session-based system without authentication
- Unique `session_id` that persists across page refreshes
- Session validation and creation API

**Files Created**:
- `lib/supabase.ts` - Supabase client initialization
- `lib/session.ts` - Client-side session management utilities
- `types/session.ts` - TypeScript interfaces for sessions
- `app/api/sessions/route.ts` - API endpoint for session creation/retrieval
- `supabase/migrations/001_create_sessions_table.sql` - Database migration

**Database Schema**:
- `sessions` table with `id`, `created_at`, `updated_at`

**Environment Variables Required**:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**How It Works**:
1. On app load, checks `localStorage` for existing `session_id`
2. If found, validates with API
3. If missing, creates new session via API
4. Session persists across page refreshes

---

### Phase 2: Chat Infrastructure ✅ COMPLETE

**Status**: ✅ Fully implemented and tested

**What Was Built**:
- Full chat persistence system
- Chat creation, listing, and deletion
- Message storage and retrieval
- Chat history with last message preview

**Files Created**:
- `supabase/migrations/002_create_chats_and_messages_tables.sql` - Database schema
- `types/chat.ts` - TypeScript interfaces for Chat and Message
- `app/api/chats/route.ts` - API endpoint for listing and creating chats
- `app/api/chats/[chatId]/route.ts` - API endpoint for updating and deleting chats
- `app/api/chats/[chatId]/messages/route.ts` - API endpoint for getting and creating messages

**Database Schema**:

**`chats` table**:
- `id` (UUID, Primary Key)
- `session_id` (UUID, Foreign Key → sessions)
- `title` (TEXT, default: "New Chat")
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ, auto-updated when messages are added)

**`messages` table**:
- `id` (UUID, Primary Key)
- `chat_id` (UUID, Foreign Key → chats, CASCADE DELETE)
- `role` (TEXT, CHECK: 'user' or 'assistant')
- `content` (TEXT)
- `created_at` (TIMESTAMPTZ)

**API Endpoints**:
- `GET /api/chats?session_id=xxx` - List all chats for a session
- `POST /api/chats` - Create a new chat
- `PATCH /api/chats/[chatId]` - Update chat (e.g., title)
- `DELETE /api/chats/[chatId]` - Delete a chat and all its messages
- `GET /api/chats/[chatId]/messages` - Get all messages for a chat
- `POST /api/chats/[chatId]/messages` - Create a new message

**Features**:
- Automatic `updated_at` trigger on chats when messages are added
- Cascade delete: deleting a chat deletes all its messages
- Indexes for performance on common queries

---

### Phase 3: Message Flow with AI ✅ COMPLETE

**Status**: ✅ Fully implemented and tested

**What Was Built**:
- AI conversation capabilities using OpenAI API
- Streaming responses with Server-Sent Events (SSE)
- Context-aware AI responses based on chat history
- System prompt for ICP guidance

**Files Created**:
- `app/api/ai/chat/route.ts` - AI API endpoint with streaming support

**Environment Variables Required**:
```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
```

**How It Works**:
1. User sends message → Saved to database
2. Frontend calls `/api/ai/chat` with `chatId`
3. Backend fetches all messages for that chat
4. Messages are formatted for OpenAI API
5. System prompt sets context for ICP building
6. OpenAI API is called with `stream: true`
7. Server streams SSE chunks back to client
8. Client accumulates content and updates UI
9. AI response is saved to database

**System Prompt**:
> "You are a helpful AI assistant that helps users build their Ideal Customer Profile (ICP). Guide them through understanding their target customers, identifying pain points, understanding buying processes, and defining budget and decision makers. Be conversational, ask follow-up questions, and help them think through each aspect of their ICP."

**API Configuration**:
- Model: `gpt-4o-mini` (default, cost-effective)
- Temperature: 0.7 (balanced creativity/consistency)
- Max tokens: 1000
- Streaming: Enabled (SSE format)

---

### Phase 4: ICP Intelligence ✅ COMPLETE

**Status**: ✅ Fully implemented and tested

**What Was Built**:
- Intelligent ICP tracking and progress monitoring
- Automatic extraction of ICP information from conversations
- Progress tracking through 5 ICP sections
- Contextual AI responses based on progress

**Files Created**:
- `supabase/migrations/003_create_icp_data_table.sql` - Database schema for ICP data
- `types/icp.ts` - TypeScript interfaces and progress calculation
- `app/api/chats/[chatId]/icp/route.ts` - API endpoint for ICP data (GET, PATCH)
- `lib/icp-analyzer.ts` - Functions to analyze messages and extract ICP information

**Database Schema**:

**`icp_data` table**:
- `id` (UUID, Primary Key)
- `chat_id` (UUID, Foreign Key → chats)
- **Company Basics**: `company_name`, `company_size`, `industry`, `location`, `company_basics_complete`
- **Target Customer**: `target_customer_type`, `target_demographics`, `target_psychographics`, `target_customer_complete`
- **Problem & Pain**: `main_problems`, `pain_points`, `current_solutions`, `problem_pain_complete`
- **Buying Process**: `decision_makers`, `buying_process_steps`, `evaluation_criteria`, `buying_process_complete`
- **Budget & Decision Maker**: `budget_range`, `decision_maker_role`, `approval_process`, `budget_decision_complete`
- `created_at`, `updated_at` (TIMESTAMPTZ)

**ICP Sections** (each worth 20% of progress):

1. **Company Basics** (20%)
   - Company name, size, industry, location
   - Marked complete when 2+ fields filled

2. **Target Customer** (20%)
   - Customer type (B2B/B2C), demographics, psychographics
   - Marked complete when 2+ fields filled

3. **Problem & Pain** (20%)
   - Main problems, pain points, current solutions
   - Marked complete when 2+ fields filled

4. **Buying Process** (20%)
   - Decision makers, buying process steps, evaluation criteria
   - Marked complete when 2+ fields filled

5. **Budget & Decision Maker** (20%)
   - Budget range, decision maker role, approval process
   - Marked complete when 2+ fields filled

**Progress Calculation**:
```typescript
function calculateProgress(icpData: ICPData | null): number {
  if (!icpData) return 0;
  
  const sections = [
    'company_basics_complete',
    'target_customer_complete',
    'problem_pain_complete',
    'buying_process_complete',
    'budget_decision_complete',
  ];
  
  const completed = sections.filter(key => icpData[key] === true).length;
  return Math.round((completed / sections.length) * 100);
}
```

**How It Works**:
1. Message analysis extracts ICP-relevant information
2. Extracted data is merged with existing ICP data
3. Section completion is checked (2+ fields = complete)
4. Progress is recalculated (0-100%)
5. AI system prompt includes current progress and gathered information
6. AI guides users through incomplete sections

**API Endpoints**:
- `GET /api/chats/[chatId]/icp` - Get ICP data for a chat
- `PATCH /api/chats/[chatId]/icp` - Update ICP data

---

### Phase 5: Voice Support ✅ COMPLETE

**Status**: ✅ Fully implemented and operational

**What Was Built**:
- Real-time voice conversation system with ChatGPT Voice-like experience
- Speech-to-text using browser LiveTranscription (Web Speech API)
- Text-to-speech using ElevenLabs WebSocket streaming API
- Voice Activity Detection (VAD) for barge-in support
- Synchronized text and voice display
- State machine for conversation flow

**Files Created**:
- `hooks/useElevenLabsVoice.ts` - Main voice hook with WebSocket TTS integration
- `lib/elevenLabsWebSocket.ts` - ElevenLabs WebSocket manager
- `lib/audioPlayer.ts` - Audio playback manager
- `lib/textBuffer.ts` - Text buffering for TTS
- `lib/liveTranscription.ts` - Browser SpeechRecognition wrapper
- `lib/vad.ts` - Voice Activity Detection
- `components/VoicePanel.tsx` - Voice controls and state visualization

**Voice States**:
1. **Idle** (Gray) - Default state when conversation is not active, or after AI finishes speaking
2. **Listening** (Blue) - Active when user is speaking or ready to speak
3. **Thinking** (Yellow) - Active when AI is processing/streaming response
4. **Speaking** (Green) - Active when AI is speaking via TTS
5. **Error** (Red) - Error state when something goes wrong

**State Transitions**:
- `idle` → `listening` (when conversation starts or user resumes)
- `listening` → `thinking` (when user transcript is received)
- `thinking` → `speaking` (when first TTS content arrives)
- `speaking` → `idle` (when audio playback ends - user can resume by speaking)
- `speaking` → `listening` (when barge-in detected)
- `idle` → `listening` (when VAD detects speech after pause)

**Browser Compatibility**:
- Speech Recognition: ✅ Chrome/Edge (Chromium), ✅ Safari (with webkit prefix), ❌ Firefox
- WebSocket TTS: ✅ All modern browsers
- AudioContext: ✅ All modern browsers
- Note: Speech recognition requires HTTPS or localhost

---

## ElevenLabs WebSocket TTS Integration ✅ COMPLETE

**Status**: ✅ Fully integrated with real-time streaming

**What Was Built**:
- Real-time text-to-speech using ElevenLabs WebSocket API
- Streaming audio chunks for instant voice start (ChatGPT Voice-like)
- Multi-context support for barge-in functionality
- Text buffering for optimal streaming performance

**Files Created**:
- `lib/elevenLabsWebSocket.ts` - WebSocket manager for ElevenLabs TTS
- `lib/audioPlayer.ts` - Audio playback queue manager
- `lib/textBuffer.ts` - Text buffering with sentence boundaries
- `app/api/voice/websocket-key/route.ts` - API key endpoint (secure)

**Environment Variables Required**:
```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb  # Optional, has default
```

**Voice Settings**:
- **Voice ID**: `JBFqnCBsd6RMkjVDRZzb` (default, ChatGPT-like voice)
- **Model**: `eleven_multilingual_v2`
- **Stability**: 0.5 (balanced)
- **Similarity Boost**: 0.75 (high similarity to original voice)
- **Style**: 0.0 (neutral)
- **Speaker Boost**: true (enhanced clarity)
- **Speed**: 1.0 (normal speed)

**Text Buffer Configuration**:
- **Min Chars**: 50 (before flushing to TTS)
- **Max Chars**: 100 (maximum buffer size)
- **Sentence Boundaries**: true (flush at sentence end)
- **First Chunk Threshold**: 20 chars (immediate flush for instant start)

**Features**:
- ✅ Real-time streaming audio (no waiting for full response)
- ✅ Instant voice start (speaks after ~20-50 characters)
- ✅ High-quality, natural voice synthesis
- ✅ Multilingual support (eleven_multilingual_v2 model)
- ✅ Custom voice ID support
- ✅ Barge-in support (context closing)
- ✅ Text synchronization (text appears as AI speaks)
- ✅ Error handling and reconnection
- ✅ Keep-alive mechanism to prevent timeouts

---

## Voice System Architecture ✅ COMPLETE

### ✅ Core Components

1. **LiveTranscription** (`lib/liveTranscription.ts`)
   - ✅ Browser SpeechRecognition API wrapper
   - ✅ Real-time interim and final results
   - ✅ Auto-send on final transcript
   - ✅ Continuous mode for conversation flow

2. **VAD Helper** (`lib/vad.ts`)
   - ✅ Voice Activity Detection using AudioContext + AnalyserNode
   - ✅ Configurable energy thresholds (0.03) and timing
   - ✅ Speech start/end/pause callbacks
   - ✅ Used for barge-in detection

3. **ElevenLabs WebSocket Manager** (`lib/elevenLabsWebSocket.ts`)
   - ✅ WebSocket connection to ElevenLabs streaming API
   - ✅ Multi-context support for barge-in
   - ✅ Real-time audio chunk streaming
   - ✅ Keep-alive mechanism
   - ✅ Automatic reconnection

4. **Audio Player** (`lib/audioPlayer.ts`)
   - ✅ Audio queue management
   - ✅ Progressive audio playback
   - ✅ Abort support for barge-in
   - ✅ State tracking (playing/paused/stopped)

5. **Text Buffer** (`lib/textBuffer.ts`)
   - ✅ Buffers text before sending to TTS
   - ✅ Sentence boundary detection
   - ✅ Configurable min/max sizes
   - ✅ Immediate flush for first chunk

6. **useElevenLabsVoice Hook** (`hooks/useElevenLabsVoice.ts`)
   - ✅ Complete voice conversation management
   - ✅ LiveTranscription integration
   - ✅ VAD integration for barge-in
   - ✅ ElevenLabs WebSocket TTS streaming
   - ✅ Text-to-voice synchronization
   - ✅ State machine (idle/listening/thinking/speaking/error)
   - ✅ Abort controllers for OpenAI and TTS
   - ✅ Comprehensive logging via voiceLogger

### ✅ Integration Complete

**VoicePanel Component** (`components/VoicePanel.tsx`):
- ✅ Uses `startConversation`/`endConversation`
- ✅ VAD initialization on conversation start
- ✅ State visualization (idle/listening/thinking/speaking)
- ✅ Pause/resume functionality
- ✅ Error handling and display

**Page Integration** (`app/page.tsx`):
- ✅ Stable `sessionId` management (persists across conversations)
- ✅ Stable `chatId` per conversation (created on first message)
- ✅ OpenAI streaming with abort support
- ✅ Text synchronization via `onTextSpoken` callback
- ✅ Barge-in handling (aborts OpenAI stream)
- ✅ Chat persistence across turns

### Key Features

**Text Synchronization**:
- Text appears in chat as AI speaks (via `onTextSpoken` callback)
- Real-time updates as more content streams in
- Synchronized with audio playback

**Barge-In Support**:
- VAD detects user speech during AI speaking
- Immediately stops audio playback
- Aborts OpenAI stream generation
- Closes TTS WebSocket context
- Transitions to listening state
- Preserves chatId and sessionId

**State Management**:
- After AI finishes speaking → transitions to `idle` (not `listening`)
- User can resume by speaking (VAD detects and transitions to `listening`)
- Or use pause/resume button
- Clean state transitions prevent race conditions

**Performance Optimizations**:
- Text buffer flushes at 50-100 chars for optimal streaming
- First chunk flushes at 20 chars for instant voice start
- Audio chunks queued and played progressively
- Keep-alive prevents WebSocket timeouts

---

## Voice System Audit Findings

### Critical Bugs Identified (Legacy Implementation)

1. **Audio cuts off after first word**
   - **Root Cause**: `await response.blob()` waits for entire response before playing
   - **Impact**: Browser auto-plays partial MP3, then pauses when buffer underruns
   - **Status**: ✅ Fixed in refactor (using MediaSource API)

2. **Barge-in fails**
   - **Root Causes**:
     - Speech recognition events fire too late (100-500ms delay)
     - Mic stopped before speech, then restarted (race condition)
     - Fetch not aborted when barge-in detected
   - **Status**: ✅ Fixed in refactor (VAD-based detection, AbortController)

3. **Conversation ends prematurely**
   - **Root Cause**: Missing state transitions, cleanup sets `isActiveRef = false`
   - **Status**: ✅ Fixed in refactor (explicit state machine)

4. **Multiple speak() calls during streaming**
   - **Root Cause**: `streamingAIContent` updates trigger new `speak()` calls
   - **Impact**: Audio interrupted mid-word
   - **Status**: ✅ Fixed in refactor (speak only on final message)

5. **No AbortController for fetch**
   - **Root Cause**: Fetch continues even after interruption
   - **Impact**: Wasted resources, potential conflicts
   - **Status**: ✅ Fixed in refactor (AbortController for all fetches)

### Refactor Approach

**Recommended**: Stay with ElevenLabs streaming TTS and implement barge-in manually

**Rationale**:
- Already integrated and working (aside from bugs)
- No additional API costs (Agents API is more expensive)
- More control over behavior
- Simpler architecture than Agents API
- Can fix bugs with minimal changes

**New Architecture Principles**:
1. **True Streaming Audio**: Use MediaSource API for progressive playback
2. **Single Audio Manager**: Singleton pattern for audio playback
3. **AbortController**: Cancel fetches when interrupted
4. **State Machine**: Explicit states with valid transitions
5. **Debounced TTS**: Only trigger speak() once per message
6. **Continuous Mic**: Keep mic listening during speech (for barge-in)

---

## Current Project State

### ✅ Fully Implemented Features

1. **Session Management**
   - Session creation and persistence
   - Session validation
   - localStorage integration

2. **Chat Infrastructure**
   - Chat creation, listing, deletion
   - Message storage and retrieval
   - Chat history with previews
   - Automatic title generation

3. **AI Integration**
   - OpenAI API integration
   - Streaming responses (SSE)
   - Context-aware conversations
   - System prompt for ICP guidance

4. **ICP Intelligence**
   - Automatic ICP data extraction
   - Progress tracking (0-100%)
   - 5-section ICP structure
   - Contextual AI guidance

5. **ElevenLabs TTS**
   - High-quality voice synthesis
   - Streaming audio responses
   - Multilingual support

6. **Voice System (Complete)**
   - LiveTranscription (browser SpeechRecognition API)
   - ElevenLabs WebSocket TTS streaming
   - VAD for barge-in detection
   - Real-time audio playback
   - Text-to-voice synchronization
   - Barge-in support
   - Abort controllers for OpenAI and TTS
   - State machine (idle/listening/thinking/speaking/error)

### 🔄 In Progress

1. **Voice System Enhancements**
   - Fine-tuning barge-in sensitivity
   - Optimizing text buffer thresholds
   - Improving audio quality settings

### ⏳ Planned / Future Enhancements

1. **Document Upload**
   - Extract ICP info from PDFs/DOCX
   - File attachment handling

2. **Enhanced Features**
   - Search functionality with backend
   - Unread message counting
   - Export ICP data
   - ICP report generation

3. **UI/UX Improvements**
   - Enhanced animations and transitions
   - More accessibility features
   - Mobile optimization

4. **Testing**
   - Unit tests for components
   - Integration tests for chat flow
   - E2E tests for critical paths

---

## Environment Variables Summary

### Required for Full Functionality

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini  # Optional

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb  # Optional, has default
```

---

## Database Migrations

### Required Migrations (in order)

1. **001_create_sessions_table.sql** - Session system
2. **002_create_chats_and_messages_tables.sql** - Chat infrastructure
3. **003_create_icp_data_table.sql** - ICP intelligence

**How to Run**:
1. Go to Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste each migration file
4. Run in order

Or use Supabase CLI:
```bash
supabase db push
```

---

## Project Structure

```
final/
├── app/                          # Next.js App Router
│   ├── api/                     # API routes
│   │   ├── sessions/            # Session management
│   │   ├── chats/               # Chat CRUD operations
│   │   ├── ai/                  # AI chat endpoint
│   │   └── voice/               # ElevenLabs WebSocket key endpoint
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Main page
├── components/                   # React components
│   ├── ui/                      # shadcn/ui components
│   ├── ChatArea.tsx             # Chat message display
│   ├── ChatHeader.tsx           # Header with progress
│   ├── ChatInput.tsx            # Message input
│   ├── Sidebar.tsx              # Chat list sidebar
│   └── VoicePanel.tsx           # Voice controls
├── hooks/                        # Custom React hooks
│   └── useElevenLabsVoice.ts    # Voice management with ElevenLabs WebSocket
├── lib/                          # Utility functions
│   ├── utils.ts                 # General utilities
│   ├── supabase.ts              # Supabase client
│   ├── session.ts                # Session management
│   ├── icp-analyzer.ts          # ICP data extraction
│   ├── vad.ts                   # Voice Activity Detection
│   ├── elevenLabsWebSocket.ts   # ElevenLabs WebSocket manager
│   ├── audioPlayer.ts            # Audio playback manager
│   ├── textBuffer.ts            # Text buffering for TTS
│   ├── liveTranscription.ts     # Browser SpeechRecognition wrapper
│   └── voiceLogger.ts           # Voice system logging
├── types/                        # TypeScript types
│   ├── session.ts               # Session types
│   ├── chat.ts                  # Chat and Message types
│   └── icp.ts                   # ICP data types
├── supabase/                     # Database migrations
│   └── migrations/              # SQL migration files
└── styles/                       # Global styles
    └── globals.css              # Tailwind and theme
```

---

## Next Steps

### Immediate Priority

1. **Complete Voice System Integration**
   - Update VoicePanel component
   - Integrate with page.tsx
   - Test full voice conversation flow
   - Verify barge-in functionality

2. **Testing & Validation**
   - Test all voice features
   - Verify session/chat persistence
   - Test ICP progress tracking
   - Validate error handling

### Short-term Goals

1. **Document Upload Feature**
   - PDF/DOCX parsing
   - ICP data extraction from documents
   - File attachment UI

2. **Enhanced UX**
   - Improved error messages
   - Loading states
   - Better mobile experience

### Long-term Goals

1. **Advanced Features**
   - ICP report generation
   - Export functionality
   - Search and filtering
   - Analytics dashboard

2. **Production Readiness**
   - Rate limiting
   - Error monitoring
   - Performance optimization
   - Security hardening

---

## Notes

- **SessionId**: Should persist across conversations (user can continue later)
- **ChatId**: Created per "conversation session" (from Start to End)
- **Turn ID**: Increments on each user utterance
- **Streams**: All streams (OpenAI, TTS) must be abortable for barge-in
- **State Machine**: Ensures clean transitions
- **Logging**: Helps debug timing/latency issues

---

**Last Updated**: January 2025
**Project Version**: 1.0.0
**Status**: All Phases Complete - Voice System Fully Operational

## Recent Updates (January 2025)

### Voice System Improvements

1. **Text Synchronization**
   - Added `onTextSpoken` callback to display text as AI speaks
   - Real-time text updates synchronized with audio playback
   - Text appears in chat immediately when audio starts

2. **State Management Refinements**
   - AI transitions to `idle` after speaking (not `listening`)
   - User can resume by speaking (VAD auto-detects)
   - Cleaner state transitions prevent race conditions

3. **Barge-In Optimizations**
   - Improved VAD sensitivity (energyThreshold: 0.03)
   - Faster speech detection (speechStartMs: 150)
   - Proper context closing on barge-in
   - State-based audio filtering prevents late chunks

4. **Text Buffer Tuning**
   - Optimized buffer sizes (minChars: 50, maxChars: 100)
   - First chunk immediate flush at 20 chars for instant start
   - Sentence boundary detection for natural pauses

5. **Audio Playback**
   - Progressive audio chunk queuing
   - Proper cleanup on barge-in
   - State tracking prevents duplicate playback

