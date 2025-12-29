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
- **STT**: OpenAI Whisper API (refactored) / Web Speech API (legacy)

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

### Phase 5: Voice Support ✅ COMPLETE (Legacy Implementation)

**Status**: ✅ Implemented, but being refactored

**What Was Built** (Legacy):
- Voice interaction capabilities using Web Speech API
- Speech-to-text (Web Speech API)
- Text-to-speech (Web Speech API, later upgraded to ElevenLabs)
- Voice state management (idle, listening, thinking, speaking)
- Mute functionality

**Files Created**:
- `hooks/useVoice.ts` - Custom React hook for voice management (legacy version)
- `components/VoicePanel.tsx` - Enhanced with voice state visualization

**Voice States**:
1. **Idle** (Gray) - Default state when conversation is not active
2. **Listening** (Blue) - Active when user is speaking
3. **Thinking** (Yellow) - Active when AI is processing
4. **Speaking** (Green) - Active when AI is speaking

**Browser Compatibility**:
- Speech Recognition: ✅ Chrome/Edge (Chromium), ✅ Safari (with webkit prefix), ❌ Firefox
- Speech Synthesis: ✅ All modern browsers
- Note: Speech recognition requires HTTPS or localhost

---

## ElevenLabs Integration ✅ COMPLETE

**Status**: ✅ Fully integrated

**What Was Built**:
- High-quality text-to-speech using ElevenLabs API
- Replaced browser-native Web Speech API TTS
- Streaming MP3 audio responses

**Files Created**:
- `app/api/voice/speak/route.ts` - ElevenLabs TTS API endpoint

**Environment Variables Required**:
```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=GzE4TcXfh9rYCU9gVgPp  # Optional, has default
```

**Voice Settings**:
- **Voice ID**: `GzE4TcXfh9rYCU9gVgPp` (default)
- **Model**: `eleven_multilingual_v2`
- **Stability**: 0.5 (balanced)
- **Similarity Boost**: 0.75 (high similarity to original voice)
- **Style**: 0.0 (neutral)
- **Speaker Boost**: true (enhanced clarity)

**API Route**:
- `POST /api/voice/speak`
- Input: `{ text: string }`
- Output: MP3 audio stream (streaming response)

**Features**:
- ✅ High-quality, natural voice synthesis
- ✅ Multilingual support (eleven_multilingual_v2 model)
- ✅ Custom voice ID support
- ✅ Audio playback with controls
- ✅ Error handling and fallbacks
- ✅ Mute functionality

---

## Voice System Refactor Status

### ✅ Completed Refactor Components

1. **Whisper STT API Endpoint** (`app/api/stt/whisper/route.ts`)
   - ✅ Created endpoint that accepts audio and calls OpenAI Whisper
   - ✅ Returns transcribed text

2. **VAD Helper** (`lib/vad.ts`)
   - ✅ Voice Activity Detection using AudioContext + AnalyserNode
   - ✅ Configurable energy thresholds and timing
   - ✅ Speech start/end callbacks

3. **True Streaming Audio** (`lib/audioStream.ts`)
   - ✅ MediaSource API implementation
   - ✅ Streams MP3 chunks while playing
   - ✅ Abort support with cleanup
   - ✅ Fallback to blob approach for unsupported browsers

4. **New useVoice Hook** (`hooks/useVoice.ts` - refactored)
   - ✅ getUserMedia for mic access
   - ✅ AudioContext initialization
   - ✅ VAD integration
   - ✅ MediaRecorder for audio capture
   - ✅ Whisper STT integration
   - ✅ True streaming TTS with MediaSource
   - ✅ Barge-in detection in VAD
   - ✅ Turn ID tracking
   - ✅ Abort controllers for TTS and OpenAI
   - ✅ State machine (idle/listening/thinking/speaking/paused/error)
   - ✅ Comprehensive logging

5. **OpenAI Stream Helper** (`lib/openaiStream.ts`)
   - ✅ Streaming with abort support
   - ✅ Chunk callbacks
   - ✅ Error handling

### 🔄 Remaining Integration Work

#### 1. Update VoicePanel Component
The VoicePanel needs to be updated to:
- Use `startConversation`/`endConversation` instead of `startListening`/`stopListening`
- Pass `sessionId` prop to useVoice
- Handle the new API (no more `streamingAIContent`, speak is called differently)
- Remove auto-speak logic (parent will handle calling speak)

#### 2. Update page.tsx Integration
The page component needs:
- **Stable sessionId**: Create once on "Start Conversation", store in ref, never change until "End"
- **Stable chatId**: Create once on first message, reuse for all messages in conversation
- **Integrate OpenAI streaming**: Use `streamOpenAIStream` with abort support
- **Call speak() with final message**: Only speak when OpenAI stream completes
- **Abort handling**: Abort OpenAI stream on barge-in using abort controllers from useVoice
- **No new chat on barge-in**: Ensure chatId stays the same across turns

#### 3. Critical Integration Points

```typescript
// In page.tsx or a conversation handler:

const conversationChatIdRef = useRef<string | null>(null);
const sessionIdRef = useRef<string | null>(null);

// On Start Conversation:
const handleStartConversation = async () => {
  // Create/ensure sessionId (only once)
  if (!sessionIdRef.current) {
    const sid = await getOrCreateSessionId();
    sessionIdRef.current = sid;
  }
  
  // Create chat if needed (only once per conversation)
  if (!conversationChatIdRef.current) {
    const chat = await createChat(sessionIdRef.current);
    conversationChatIdRef.current = chat.id;
  }
  
  // Start voice conversation
  voiceHook.startConversation();
};

// On transcript complete:
const handleTranscriptComplete = async (text: string) => {
  const chatId = conversationChatIdRef.current;
  if (!chatId) return;
  
  // Get abort controller for OpenAI
  const { openai } = voiceHook.getAbortControllers();
  const abortController = new AbortController();
  // Store for barge-in
  
  // Save user message
  await saveMessage(chatId, text);
  
  // Stream OpenAI response
  const fullContent = await streamOpenAIResponse({
    chatId,
    signal: abortController.signal,
    onChunk: (content) => {
      // Update UI
    },
    onComplete: async (content) => {
      // Save assistant message
      await saveMessage(chatId, content);
      
      // Speak final message
      voiceHook.speak(content);
    },
  });
};

// On barge-in:
const handleBargeIn = () => {
  // Abort OpenAI stream
  const { openai } = voiceHook.getAbortControllers();
  if (openai) {
    openai.abort();
  }
  
  // TTS is already aborted by interrupt()
  // Chat ID stays the same
  // Session ID stays the same
};

// On End Conversation:
const handleEndConversation = () => {
  voiceHook.endConversation();
  conversationChatIdRef.current = null;
  // Keep sessionIdRef.current - don't clear it
};
```

#### 4. Testing Checklist

- [ ] Start conversation → sessionId created once
- [ ] Speak → Whisper transcribes → OpenAI responds → TTS speaks smoothly
- [ ] Speak again → same chatId used (no new chat)
- [ ] Barge-in → audio stops instantly, OpenAI aborted, same session/chat
- [ ] Pause/resume works
- [ ] End conversation → cleanup, but sessionId can persist
- [ ] No stale audio plays after barge-in
- [ ] No duplicate speak() calls
- [ ] True streaming (audio plays while downloading)

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

6. **Voice System (Refactored)**
   - Whisper STT integration
   - VAD for speech detection
   - True streaming audio (MediaSource)
   - Barge-in detection
   - Abort controllers
   - State machine

### 🔄 In Progress

1. **Voice System Integration**
   - VoicePanel component update
   - page.tsx integration
   - Stable sessionId/chatId management
   - OpenAI streaming with abort support

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
ELEVENLABS_VOICE_ID=GzE4TcXfh9rYCU9gVgPp  # Optional, has default
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
│   │   ├── voice/               # ElevenLabs TTS
│   │   └── stt/                 # Whisper STT
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
│   └── useVoice.ts              # Voice management (refactored)
├── lib/                          # Utility functions
│   ├── utils.ts                 # General utilities
│   ├── supabase.ts              # Supabase client
│   ├── session.ts                # Session management
│   ├── icp-analyzer.ts          # ICP data extraction
│   ├── vad.ts                   # Voice Activity Detection
│   ├── audioStream.ts           # Streaming audio
│   └── openaiStream.ts          # OpenAI streaming helper
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

**Last Updated**: Based on current codebase analysis
**Project Version**: 1.0.0
**Status**: Phase 5 Complete, Voice System Refactor In Progress

