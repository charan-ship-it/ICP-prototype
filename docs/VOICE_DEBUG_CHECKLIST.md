# Voice Debug Checklist

**Purpose:** Quick reference for debugging voice conversation issues

---

## Debug Commands

### Browser Console Commands

```javascript
// Check current voice state
window.__voiceDebug?.getState()

// Check conversation chatId
window.__voiceDebug?.getChatId()

// Check if conversation is active
window.__voiceDebug?.isActive()

// Force stop conversation
window.__voiceDebug?.forceStop()
```

### Network Tab Filters

```
# Filter for voice-related requests
stt|elevenlabs|websocket-key|ai/chat

# Filter for WebSocket connections
wss://api.elevenlabs.io
```

### Local Storage Inspection

```javascript
// Check session ID
localStorage.getItem('session_id')

// Check all voice-related storage
Object.keys(localStorage).filter(k => k.includes('voice') || k.includes('session'))
```

---

## Logs to Inspect

### Critical Log Patterns

**1. Conversation Start:**
```
[Voice] [Conversation] Starting conversation [conversationId] [chatId]
[Voice] [State] idle → listening [conversationId] [chatId]
```

**2. Speech Detection:**
```
[Voice] [VAD] Speech start detected [conversationId] [chatId]
[Voice] [Recording] Started [conversationId] [chatId]
```

**3. Transcription:**
```
[Voice] [STT] Starting transcription [conversationId] [chatId]
[Voice] [Timing] STT duration: XXXms [conversationId] [chatId]
[Voice] [STT] Transcription: "..." [conversationId] [chatId]
```

**4. OpenAI Call:**
```
[Voice] [OpenAI] Starting stream [conversationId] [chatId]
[Voice] [Timing] OpenAI time-to-first-token: XXXms [conversationId] [chatId]
[Voice] [OpenAI] Stream complete [conversationId] [chatId]
[Voice] [Timing] Total LLM duration: XXXms [conversationId] [chatId]
```

**5. TTS:**
```
[Voice] [TTS] Starting [conversationId] [chatId]
[Voice] [TTS] First audio chunk received [conversationId] [chatId]
[Voice] [Timing] TTS time-to-first-audio: XXXms [conversationId] [chatId]
[Voice] [Audio] Queue length: X [conversationId] [chatId]
```

**6. Barge-in:**
```
[Voice] [BargeIn] Detected [conversationId] [chatId]
[Voice] [BargeIn] Aborting OpenAI stream [conversationId] [chatId]
[Voice] [BargeIn] Stopping TTS [conversationId] [chatId]
[Voice] [BargeIn] Clearing audio queue [conversationId] [chatId]
[Voice] [State] speaking → listening [conversationId] [chatId]
```

**7. Errors:**
```
[Voice] [Error] [Stage] message [conversationId] [chatId] {error details}
```

---

## Common Failure Modes

### 1. ChatId Not Stable

**Symptoms:**
- Multiple chats created for single conversation
- Messages split across different chats
- ICP data not accumulating

**Debug Steps:**
1. Check logs for chatId changes:
   ```
   [Voice] [ChatId] Using chatId: XXX [conversationId]
   ```
2. Verify `conversationChatIdRef.current` in console
3. Check if `selectedChatId` state is being cleared
4. Verify chatId is set when conversation starts

**Fix:**
- Ensure `conversationChatIdRef` is set on first message
- Verify ref is not cleared during conversation
- Check that `handleSendMessage` uses ref, not just state

---

### 2. Barge-in Not Working

**Symptoms:**
- OpenAI continues streaming after interruption
- Audio continues playing after interruption
- State doesn't transition to 'listening'

**Debug Steps:**
1. Check barge-in logs:
   ```
   [Voice] [BargeIn] Detected [conversationId] [chatId]
   ```
2. Verify AbortController exists:
   - Check `openaiAbortControllerRef.current` is not null
   - Check `currentAbortControllerRef.current` is not null
3. Check network tab: OpenAI request should show "canceled"
4. Verify WebSocket flush:
   - Check `wsManagerRef.current.getConnectionStatus()` is true
   - Check `closeCurrentContext()` is called
5. Check audio queue:
   - Verify `audioPlayerRef.current.stop()` is called
   - Check queue is cleared

**Fix:**
- Ensure AbortController is set BEFORE fetch starts
- Verify WebSocket is connected before flushing
- Check state guards in `handleBargeIn`
- Verify audio player stop is synchronous

---

### 3. STT Not Working

**Symptoms:**
- No transcription after speaking
- Transcription is empty
- STT API error

**Debug Steps:**
1. Check STT logs:
   ```
   [Voice] [STT] Starting transcription [conversationId] [chatId]
   [Voice] [STT] Audio blob size: XXX bytes [conversationId] [chatId]
   ```
2. Verify audio blob is created:
   - Check `recordingChunksRef.current.length > 0`
   - Check blob size > 0
3. Check network tab: STT request should succeed (200)
4. Verify ElevenLabs API key is set
5. Check STT response format

**Fix:**
- Verify MediaRecorder is recording
- Check audio format is supported (webm/opus)
- Verify API key in environment
- Check STT endpoint response format

---

### 4. TTS Not Playing

**Symptoms:**
- No audio output
- Audio cuts off mid-sentence
- Audio queue builds up but doesn't play

**Debug Steps:**
1. Check TTS logs:
   ```
   [Voice] [TTS] Starting [conversationId] [chatId]
   [Voice] [TTS] First audio chunk received [conversationId] [chatId]
   [Voice] [Audio] Queue length: X [conversationId] [chatId]
   ```
2. Verify WebSocket connection:
   - Check `wsManagerRef.current.getConnectionStatus()` is true
   - Check WebSocket is in OPEN state
3. Check audio player:
   - Verify `audioPlayerRef.current` is initialized
   - Check AudioContext state is 'running'
   - Verify chunks are being queued
4. Check browser audio permissions
5. Verify audio format (PCM chunks)

**Fix:**
- Ensure WebSocket is connected before sending text
- Verify AudioContext is resumed
- Check audio player initialization
- Verify chunks are valid PCM data

---

### 5. State Machine Stuck

**Symptoms:**
- State doesn't transition
- Stuck in 'thinking' or 'speaking'
- Can't start new conversation

**Debug Steps:**
1. Check state transition logs:
   ```
   [Voice] [State] X → Y [conversationId] [chatId] reason: ...
   ```
2. Verify current state:
   - Check `stateRef.current` matches `state` state
3. Check if conversation is active:
   - Verify `isActiveRef.current` is true/false as expected
4. Check for errors that might prevent transitions

**Fix:**
- Ensure state transitions are logged
- Verify state machine logic in `useElevenLabsVoice`
- Check for error states that block transitions
- Reset state on conversation end

---

### 6. Performance Issues

**Symptoms:**
- High latency (> 5s for STT, > 3s for OpenAI)
- Audio playback lag
- UI freezes during conversation

**Debug Steps:**
1. Check timing logs:
   ```
   [Voice] [Timing] STT duration: XXXms
   [Voice] [Timing] OpenAI time-to-first-token: XXXms
   [Voice] [Timing] Total LLM duration: XXXms
   ```
2. Verify network latency:
   - Check STT API response time
   - Check OpenAI API response time
   - Check WebSocket latency
3. Check audio queue length:
   ```
   [Voice] [Audio] Queue length: X
   ```
4. Profile browser performance:
   - Check main thread blocking
   - Check memory usage
   - Check WebSocket message rate

**Fix:**
- Optimize STT batch size
- Reduce OpenAI max_tokens if needed
- Optimize audio queue processing
- Consider Web Workers for heavy processing

---

## Quick Diagnostic Script

Paste this in browser console to get full state:

```javascript
(function() {
  const state = {
    sessionId: localStorage.getItem('session_id'),
    voiceState: window.__voiceDebug?.getState?.() || 'unknown',
    chatId: window.__voiceDebug?.getChatId?.() || 'unknown',
    isActive: window.__voiceDebug?.isActive?.() || false,
    timestamp: new Date().toISOString()
  };
  console.table(state);
  return state;
})();
```

---

## Log Filtering Tips

### Filter by Conversation ID

```javascript
// In console, filter logs:
console.log = (function(originalLog) {
  return function(...args) {
    if (args[0]?.includes('[conversationId]')) {
      originalLog.apply(console, args);
    }
  };
})(console.log);
```

### Filter by Stage

```javascript
// Show only errors
console.error = console.error; // Keep original

// Show only timing
// Filter: [Timing]
```

### Export Logs

```javascript
// Copy all voice logs to clipboard
const logs = [];
const originalLog = console.log;
console.log = function(...args) {
  if (args[0]?.includes('[Voice]')) {
    logs.push({ timestamp: Date.now(), message: args.join(' ') });
  }
  originalLog.apply(console, args);
};

// Later, export:
console.log(JSON.stringify(logs, null, 2));
```

---

## Environment Checks

### Required Environment Variables

```bash
# Check if all required vars are set
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
echo $OPENAI_API_KEY
echo $ELEVENLABS_API_KEY
```

### API Key Validation

```javascript
// Test API keys (in browser console)
async function testKeys() {
  const results = {
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    openai: !!(await fetch('/api/ai/chat', { method: 'POST', body: JSON.stringify({ chatId: 'test' }) }).catch(() => null)),
    elevenlabs: !!(await fetch('/api/voice/websocket-key').catch(() => null))
  };
  console.table(results);
  return results;
}
```

---

## Database Checks

### Verify Chat Structure

```sql
-- Check chats for a session
SELECT id, title, created_at, updated_at 
FROM chats 
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY created_at DESC;

-- Check messages in a chat
SELECT role, content, created_at 
FROM messages 
WHERE chat_id = 'YOUR_CHAT_ID'
ORDER BY created_at ASC;

-- Check ICP data
SELECT * FROM icp_data WHERE chat_id = 'YOUR_CHAT_ID';
```

---

## Network Debugging

### WebSocket Inspection

```javascript
// Monitor WebSocket messages
const ws = new WebSocket('wss://api.elevenlabs.io/...');
ws.onmessage = (event) => {
  console.log('[WS Message]', event.data);
};
ws.onerror = (error) => {
  console.error('[WS Error]', error);
};
```

### Fetch Request Inspection

```javascript
// Intercept fetch requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('[Fetch]', args[0], args[1]);
  return originalFetch.apply(this, args).then(response => {
    console.log('[Fetch Response]', args[0], response.status);
    return response;
  });
};
```

---

## Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| "Failed to access microphone" | Permission denied | Grant mic permission |
| "Eleven Labs API key not configured" | Missing env var | Set ELEVENLABS_API_KEY |
| "OpenAI API key not configured" | Missing env var | Set OPENAI_API_KEY |
| "WebSocket connection lost" | Network issue | Check connection, retry |
| "Audio context suspended" | Browser autoplay policy | User interaction required |
| "STT failed with status 400" | Invalid audio format | Check MediaRecorder format |
| "ChatId is required" | State issue | Check conversationChatIdRef |

---

**End of Debug Checklist**

