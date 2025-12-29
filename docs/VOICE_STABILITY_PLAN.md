# Voice Stability Fix Plan

**Date:** 2025-01-27  
**Goal:** Fix ChatId stability, barge-in reliability, and add observability

---

## 1. ChatId Stability Issue

### Root Cause Analysis

**Location:** `app/page.tsx:213-239` (handleSendMessage)

**Problem:**
- `selectedChatId` is a React state variable (`useState<string | undefined>()`)
- When voice conversation starts, `selectedChatId` may be `undefined`
- `handleSendMessage` checks `if (!chatId)` and creates a new chat (line 217)
- If `selectedChatId` is cleared or not set between turns, each message creates a new chat
- This breaks the conversation continuity - messages should all go to the same chat

**Evidence:**
```typescript
// Line 215-217
let chatId = selectedChatId;
let isNewChat = false;
if (!chatId) {  // ← Creates new chat if selectedChatId is undefined
  // ... create new chat
}
```

**Why it happens:**
- User starts voice conversation → `selectedChatId` is undefined
- First message creates chat and sets `selectedChatId` (line 230)
- But if component re-renders or state is cleared, `selectedChatId` becomes undefined again
- Next message creates another new chat

### Proposed Fix

**Strategy:** Use a ref to track conversation chatId that persists across voice conversation turns

**Changes:**
1. Add `conversationChatIdRef` ref in `app/page.tsx`
2. Set it once when first message is sent in a voice conversation
3. Use `conversationChatIdRef.current` as primary source for chatId in voice flow
4. Clear ref when conversation ends
5. Keep `selectedChatId` for UI selection, but prioritize ref for voice messages

**Code Changes:**
```typescript
// Add ref after other refs (line ~27)
const conversationChatIdRef = useRef<string | null>(null);

// In handleSendMessage, prioritize conversationChatIdRef
let chatId = conversationChatIdRef.current || selectedChatId;

// If still no chatId, create one and set both
if (!chatId) {
  // ... create chat
  chatId = newChat.id;
  conversationChatIdRef.current = chatId;  // ← Set ref
  setSelectedChatId(chatId);
}

// In endConversation callback (or when voice conversation ends)
conversationChatIdRef.current = null;  // ← Clear on end
```

**Files to Modify:**
- `app/page.tsx` (add ref, modify handleSendMessage, clear on end)

**Risk:** Low - isolated change, refs don't trigger re-renders  
**Rollback:** Remove ref, revert to original selectedChatId logic

### Testing Instructions

1. **Test: Single Conversation Session**
   - Start voice conversation
   - Send 3 messages via voice
   - Check database: should have 1 chat with 6 messages (3 user + 3 assistant)
   - Verify `conversationChatIdRef.current` stays same across all 3 turns

2. **Test: Conversation End/Start**
   - Start conversation, send 2 messages
   - End conversation
   - Start new conversation
   - Send 2 messages
   - Check database: should have 2 separate chats (one per conversation session)

3. **Test: Mixed Voice/Text**
   - Start voice conversation, send 1 voice message
   - Send 1 text message via ChatInput
   - Check: both messages should be in same chat

---

## 2. Barge-in Race Conditions

### Root Cause Analysis

**Location 1:** `hooks/useElevenLabsVoice.ts:444-474` (handleBargeIn)  
**Location 2:** `app/page.tsx:343-348` (AbortController setup)  
**Location 3:** `app/page.tsx:38-43` (onBargeIn callback)

**Problem 1: AbortController Timing**
- AbortController is created in `handleSendMessage` (line 344)
- It's set in ref and voice hook (lines 345, 348)
- But if barge-in happens BEFORE `handleSendMessage` completes, controller might not be set yet
- Race condition: VAD detects speech → calls handleBargeIn → but controller not set

**Problem 2: TTS WebSocket Flush**
- `closeCurrentContext()` sends flush message (line 449)
- But if WebSocket is not connected or context not created, flush might not work
- Need to ensure WebSocket is in valid state before flushing

**Problem 3: Audio Queue Not Cleared**
- `audioPlayer.stop()` clears queue (line 454)
- But if audio is currently playing, there might be a brief delay
- Need to ensure immediate stop

**Problem 4: TextBuffer Clear Timing**
- TextBuffer is cleared (line 459)
- But if TTS is still receiving chunks, buffer might refill
- Need to prevent new chunks from being added during barge-in

**Evidence:**
```typescript
// handleBargeIn checks but doesn't verify state
if (openaiAbortControllerRef.current) {
  openaiAbortControllerRef.current.abort();  // ← Might be null
}
```

### Proposed Fix

**Strategy:** Add state checks, ensure synchronous operations where possible, add guards

**Changes:**

1. **Add State Guards in handleBargeIn:**
   ```typescript
   // Check if already aborted
   if (openaiAbortControllerRef.current && !openaiAbortControllerRef.current.signal.aborted) {
     openaiAbortControllerRef.current.abort();
   }
   ```

2. **Ensure WebSocket is Connected Before Flush:**
   ```typescript
   if (wsManagerRef.current && wsManagerRef.current.getConnectionStatus()) {
     wsManagerRef.current.closeCurrentContext();
   }
   ```

3. **Add Immediate Audio Stop:**
   ```typescript
   if (audioPlayerRef.current) {
     audioPlayerRef.current.stop();  // Already clears queue
     // Ensure immediate stop (already implemented)
   }
   ```

4. **Prevent TextBuffer Refill:**
   - Add flag to prevent new chunks during barge-in
   - Or check state before adding to buffer in `streamToTTS`

5. **Add Logging for Debugging:**
   - Log when barge-in is triggered
   - Log state of each component (controller, WebSocket, audio, buffer)
   - Log success/failure of each abort operation

**Files to Modify:**
- `hooks/useElevenLabsVoice.ts` (handleBargeIn, streamToTTS)
- `lib/elevenLabsWebSocket.ts` (add connection status check if needed)
- `app/page.tsx` (ensure controller is set before fetch starts)

**Risk:** Medium - touches critical path, but changes are defensive  
**Rollback:** Revert handleBargeIn to original, remove state checks

### Testing Instructions

1. **Test: Barge-in During OpenAI Stream**
   - Start conversation, let AI start speaking
   - Interrupt mid-sentence (speak during AI speech)
   - Verify: OpenAI stream aborts immediately (check network tab)
   - Verify: No more AI text appears in UI
   - Repeat 10 times, should work 100%

2. **Test: Barge-in During TTS**
   - Start conversation, let AI speak
   - Interrupt during audio playback
   - Verify: Audio stops immediately (no lag)
   - Verify: No more audio chunks play
   - Repeat 10 times, should work 100%

3. **Test: Barge-in Before Controller Set**
   - Start conversation
   - Immediately interrupt (before OpenAI call completes)
   - Verify: No errors, graceful handling
   - Verify: Next turn works normally

4. **Test: Rapid Barge-ins**
   - Start conversation
   - Interrupt 3 times in quick succession
   - Verify: All operations complete, no errors
   - Verify: Final state is 'listening'

---

## 3. Observability (Logging)

### Current State

**Location:** Various files use `console.log` inconsistently

**Problems:**
- No structured logging format
- No conversationId or chatId in logs
- No timing metrics
- Hard to trace flow across files
- No correlation between logs

### Proposed Fix

**Strategy:** Add structured logging with consistent format, timing metrics, and correlation IDs

**Changes:**

1. **Create Logging Utility:**
   - Add `lib/voiceLogger.ts` with structured log function
   - Format: `[Voice] [Stage] [conversationId] [chatId] message {metadata}`
   - Include timestamp, stage, conversationId, chatId

2. **Add Timing Metrics:**
   - Track: mic start, VAD start/end, recording stop, STT duration, OpenAI time-to-first-token, total LLM duration, TTS start, time-to-first-audio, audio queue length
   - Log at each stage transition

3. **Add State Transition Logging:**
   - Log all state changes: idle → listening → thinking → speaking
   - Include previous state and reason for transition

4. **Add Conversation ID:**
   - Generate unique conversationId when conversation starts
   - Pass through all logs
   - Include in all log entries

**Files to Create:**
- `lib/voiceLogger.ts` (new file)

**Files to Modify:**
- `hooks/useElevenLabsVoice.ts` (replace console.log with structured logs)
- `app/page.tsx` (add timing logs, conversationId)
- `lib/audioPlayer.ts` (add queue length logs)
- `lib/elevenLabsWebSocket.ts` (add connection logs)

**Risk:** Low - additive only, doesn't change behavior  
**Rollback:** Remove logging utility, revert to console.log

### Testing Instructions

1. **Test: Log Format**
   - Start conversation, send 1 message
   - Check console: logs should have format `[Voice] [Stage] [conversationId] [chatId] message`
   - Verify: conversationId is consistent across all logs
   - Verify: chatId matches actual chat being used

2. **Test: Timing Metrics**
   - Start conversation, send 1 message
   - Check logs for timing entries:
     - `[Voice] [Timing] STT duration: XXXms`
     - `[Voice] [Timing] OpenAI time-to-first-token: XXXms`
     - `[Voice] [Timing] Total LLM duration: XXXms`
   - Verify: All timings are reasonable (< 5s for STT, < 2s for OpenAI)

3. **Test: State Transitions**
   - Start conversation
   - Check logs for state transitions:
     - `[Voice] [State] idle → listening`
     - `[Voice] [State] listening → thinking`
     - `[Voice] [State] thinking → speaking`
   - Verify: All transitions are logged

---

## Implementation Order

1. **Phase 1: ChatId Stability** (Lowest risk, highest impact)
   - Add `conversationChatIdRef`
   - Modify `handleSendMessage`
   - Test thoroughly

2. **Phase 2: Barge-in Reliability** (Medium risk, critical for UX)
   - Add state checks in `handleBargeIn`
   - Ensure WebSocket flush works
   - Add guards in `streamToTTS`
   - Test thoroughly

3. **Phase 3: Observability** (Low risk, helps debugging)
   - Create logging utility
   - Add structured logs
   - Add timing metrics
   - Test log format

---

## Expected Behaviors After Fixes

### ChatId Stability
- ✅ Single chatId used across entire voice conversation session
- ✅ New chat created only when conversation starts (not per message)
- ✅ ChatId persists across multiple voice turns
- ✅ ChatId cleared when conversation ends

### Barge-in Reliability
- ✅ OpenAI stream aborts 100% of the time when user interrupts
- ✅ TTS stops immediately (no lag, no extra audio)
- ✅ Audio queue cleared immediately
- ✅ TextBuffer cleared and prevented from refilling
- ✅ State transitions to 'listening' immediately

### Observability
- ✅ All logs include conversationId and chatId
- ✅ Timing metrics logged at each stage
- ✅ State transitions logged with reasons
- ✅ Easy to trace flow across files
- ✅ Can debug issues from logs alone

---

## Rollback Plan

If issues arise:

1. **ChatId Fix:**
   - Remove `conversationChatIdRef`
   - Revert `handleSendMessage` to use only `selectedChatId`
   - Clear ref cleanup code

2. **Barge-in Fix:**
   - Revert `handleBargeIn` to original implementation
   - Remove state checks
   - Remove WebSocket connection checks

3. **Logging:**
   - Remove `lib/voiceLogger.ts`
   - Revert all log calls to `console.log`
   - Remove timing metrics

All changes are isolated and can be reverted independently.

---

## Success Criteria

- ✅ ChatId stable across voice conversation turns (tested 10+ times)
- ✅ Barge-in works 100% of the time (tested 20+ times)
- ✅ All logs include conversationId and chatId
- ✅ Timing metrics available for debugging
- ✅ No new bugs introduced
- ✅ Existing functionality unchanged

---

**End of Fix Plan**

