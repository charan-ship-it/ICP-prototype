# ICP Builder - Project Vision Document

## Core Philosophy

**Primary Mode: Speech-to-Speech Conversation**
- The application should feel like a natural phone call or voice assistant conversation
- Voice is the PRIMARY interface, with text chat as a secondary option when needed
- Seamless, uninterrupted flow without technical interruptions or visible bugs

---

## User Experience Vision

### 1. Voice-First, Seamless Conversation

**Ideal Flow:**
```
User speaks → AI listens → AI responds with voice → User speaks again → (continuous loop)
```

**Key Principles:**
- **No visible state transitions** - User shouldn't see "listening", "thinking", "speaking" states unless absolutely necessary
- **Natural conversation rhythm** - Like talking to a person on the phone
- **Instant responsiveness** - AI should start speaking as soon as it has enough content (streaming TTS)
- **No interruptions** - No WebSocket reconnections, no timeout errors, no technical messages
- **Barge-in support** - User can interrupt AI naturally, just like in real conversation

### 2. Hybrid Mode: Voice + Text Chat

**When to use each:**
- **Voice Mode (Default)**: Natural conversation, quick back-and-forth, hands-free interaction
- **Text Chat (Optional)**: 
  - When user prefers typing
  - When sharing complex information (copy/paste)
  - When in a noisy environment
  - When user explicitly switches to text mode

**Seamless Switching:**
- User can type while voice mode is active (should pause voice, process text, resume voice)
- User can speak while in text mode (should switch to voice mode automatically)
- Both modes share the same conversation history
- No data loss when switching modes

### 3. Visual Design Philosophy

**Minimal, Clean Interface:**
- **Chat area**: Shows conversation history (both voice and text messages)
- **Voice indicator**: Subtle, non-intrusive visual feedback (maybe just a small pulsing dot)
- **No overwhelming UI elements** - Focus on the conversation
- **Progress indicators**: Only show when relevant (e.g., ICP progress, document generation)

**State Visibility:**
- Hide technical states ("thinking", "transcribing", "processing")
- Show only user-relevant states:
  - "Listening..." (when waiting for user)
  - "Speaking..." (when AI is talking - optional, can be hidden)
  - Nothing during processing (seamless)

---

## Technical Architecture Vision

### 1. Voice Pipeline (Speech-to-Speech)

**Current Issues to Fix:**
- ❌ WebSocket timeouts and reconnections
- ❌ Messages not displaying in chat
- ❌ TurnId mismatches causing stream stops
- ❌ VAD too sensitive to noise
- ❌ Recording hitting max duration (30s) unnecessarily

**Ideal Implementation:**
- ✅ **Persistent WebSocket**: One connection for entire conversation session
- ✅ **Reliable message display**: All AI responses appear immediately in chat
- ✅ **Stable streaming**: No premature stream cancellations
- ✅ **Robust VAD**: Works in noisy environments, doesn't false-trigger
- ✅ **Smart recording**: Only records when user is actually speaking

**Flow:**
1. User speaks → VAD detects speech start
2. User stops → VAD detects silence → Transcribe immediately
3. LLM streams response → TTS starts speaking as soon as first chunk arrives
4. User can interrupt (barge-in) → Cancel current turn, start new one
5. AI finishes speaking → Automatically resume listening
6. Loop continues seamlessly

### 2. Message Display & History

**Requirements:**
- **All messages visible**: Both user and AI messages appear in chat immediately
- **Real-time updates**: Text appears as AI speaks (synchronized with audio)
- **Persistent history**: All conversations saved and accessible
- **Mixed mode support**: Voice messages and text messages in same conversation

**Display Logic:**
- User voice input → Show transcription in chat immediately
- AI response → Show text as it streams, synchronized with audio playback
- Text input → Show immediately in chat
- No duplicate messages, no missing messages

### 3. Error Handling & Resilience

**Zero-Error Experience:**
- **Silent error recovery**: Errors should be handled automatically without user intervention
- **No error messages**: User should never see technical error messages
- **Graceful degradation**: If voice fails, fall back to text seamlessly
- **Connection resilience**: Automatic reconnection without user awareness

**Error Scenarios:**
- WebSocket disconnects → Auto-reconnect silently
- Transcription fails → Retry once, then show error (but don't break flow)
- LLM timeout → Show friendly message, allow retry
- Microphone permission denied → Clear instructions, easy fix

---

## Feature Priorities

### Phase 1: Core Stability (Current Focus)
1. ✅ Fix message display (AI responses showing in chat)
2. ✅ Fix turnId mismatches (stream not stopping prematurely)
3. ✅ Fix WebSocket lifecycle (persistent connections)
4. ✅ Improve VAD for noisy environments
5. ✅ Fix recording resumption logic

### Phase 2: Seamless Experience
1. **Remove visible state transitions** - Hide "thinking", "transcribing" states
2. **Improve barge-in** - Make it feel natural, instant
3. **Better error handling** - Silent recovery, no error messages
4. **Optimize latency** - Faster response times, lower perceived delay

### Phase 3: Hybrid Mode
1. **Seamless mode switching** - Voice ↔ Text without interruption
2. **Unified conversation history** - Voice and text in same thread
3. **Smart mode detection** - Auto-switch based on user behavior

### Phase 4: Polish & UX
1. **Minimal UI** - Clean, focused interface
2. **Better visual feedback** - Subtle indicators, not overwhelming
3. **Performance optimization** - Smooth, responsive, no lag

---

## Success Metrics

### User Experience
- **Conversation feels natural** - Like talking to a person
- **No technical interruptions** - No errors, no reconnections visible
- **Fast response times** - AI starts speaking within 1-2 seconds
- **Reliable transcription** - Works in noisy environments
- **Seamless mode switching** - Voice/text switching is instant

### Technical Metrics
- **WebSocket uptime**: >99% (no disconnections during conversation)
- **Message delivery**: 100% (all messages appear in chat)
- **Stream success rate**: >99% (no premature cancellations)
- **VAD accuracy**: >95% (correctly detects speech start/end)
- **Latency**: <2s from user speech end to AI speech start

---

## Design Principles

1. **Voice-First**: Voice is the primary interface, text is secondary
2. **Seamless**: No visible technical processes, just conversation
3. **Resilient**: Errors handled silently, automatic recovery
4. **Fast**: Low latency, instant feedback
5. **Natural**: Feels like talking to a person, not a machine
6. **Flexible**: Users can switch between voice and text as needed
7. **Reliable**: Works consistently, no bugs interrupting flow

---

## Current State vs. Ideal State

### Current Issues
- ❌ Messages not displaying in chat
- ❌ WebSocket reconnecting constantly
- ❌ Stream stopping prematurely
- ❌ VAD too sensitive to noise
- ❌ Visible technical states ("thinking", "transcribing")
- ❌ Error messages visible to user
- ❌ Not seamless - many interruptions

### Ideal State
- ✅ All messages display immediately
- ✅ WebSocket stays connected for entire conversation
- ✅ Streams complete successfully
- ✅ VAD works in any environment
- ✅ No visible technical states
- ✅ Errors handled silently
- ✅ Seamless, natural conversation flow

---

## Implementation Notes

### Key Technical Requirements
1. **Message Display**: Ensure `onTextSpoken` always finds the message (create message BEFORE streaming starts)
2. **WebSocket Lifecycle**: One connection per conversation, only disconnect on explicit end
3. **Turn Management**: Proper turnId tracking to prevent stream cancellations
4. **VAD Robustness**: Adaptive thresholds, noise filtering, silence lock
5. **State Management**: Hide technical states, show only user-relevant information

### Code Quality Standards
- **Error handling**: All errors caught and handled gracefully
- **Logging**: Comprehensive logging for debugging, but no user-facing errors
- **Performance**: Optimize for low latency, smooth experience
- **Maintainability**: Clean code, clear separation of concerns

---

## Reference Points

**Inspiration:**
- ChatGPT Voice Mode (seamless, natural conversation)
- Phone calls (natural back-and-forth, interruptions)
- Modern voice assistants (instant responses, reliable)

**Anti-Patterns to Avoid:**
- Visible technical states
- Error messages to users
- Frequent reconnections
- Premature stream cancellations
- Overly complex UI
- Mode switching friction

---

*This document should be referenced for all feature development and bug fixes to ensure alignment with the vision.*

