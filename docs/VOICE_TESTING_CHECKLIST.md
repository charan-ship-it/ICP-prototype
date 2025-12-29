# Voice Model Testing Checklist

## Quick Test Guide - Use This to Verify Fixes

---

## ✅ Pre-Flight Checks

- [ ] Browser: Chrome, Edge, or Safari (NOT Firefox)
- [ ] Microphone permission granted
- [ ] `.env.local` has all required API keys
- [ ] Run `npm run dev` and app is running
- [ ] Open browser console (F12) to watch logs

---

## Test 1: Basic Voice Flow

### Steps:
1. Click "Start Conversation"
2. Say: "Hello, can you help me?"
3. Wait 1.5 seconds
4. Watch AI respond

### Expected Results:
- [ ] Button changes to "End Conversation"
- [ ] See "Listening..." state with animated orb
- [ ] Live text appears as you speak (real-time)
- [ ] After 1.5s pause, state changes to "Thinking..."
- [ ] AI response streams in chat
- [ ] State changes to "Speaking..." 
- [ ] You hear AI voice output
- [ ] After AI finishes, returns to "Listening..."

### Console Logs to Verify:
```
[Voice] [LiveTranscription] Starting
[Voice] [LiveTranscription] Interim transcript: "Hello"
[Voice] [LiveTranscription] Final transcript: "Hello can you help me"
[Voice] [State] listening → thinking
[Voice] [OpenAI] Starting stream
[Voice] [TTS] Starting
[Voice] [State] thinking → speaking
```

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 2: Continuous Conversation

### Steps:
1. Complete Test 1
2. Immediately after AI stops speaking, say: "Tell me more"
3. Don't click anything
4. Verify smooth flow

### Expected Results:
- [ ] No delay - can speak immediately after AI
- [ ] Don't need to click "Start" again
- [ ] Live transcription works instantly
- [ ] Second response generates normally

### Console Logs to Verify:
```
[Voice] [VAD] Speech start detected
[Voice] [LiveTranscription] Interim transcript: "Tell"
```

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 3: Barge-In (Interruption)

### Steps:
1. Ask: "Tell me a long story about marketing"
2. While AI is speaking, start talking: "Stop, that's enough"
3. Verify interruption works

### Expected Results:
- [ ] AI audio stops immediately when you speak
- [ ] State changes from "Speaking..." to "Listening..."
- [ ] Your interruption is transcribed
- [ ] New AI response generated
- [ ] No leftover audio from interrupted response

### Console Logs to Verify:
```
[Voice] [BargeIn] Detected
[Voice] [BargeIn] TTS WebSocket context closed
[Voice] [BargeIn] Audio playback stopped
[Voice] [State] speaking → listening
```

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 4: Multi-Sentence Capture

### Steps:
1. Say in one go: "I need help with three things. First is marketing. Second is sales. Third is customer service."
2. Pause 1.5s only at the end
3. Verify full text is captured

### Expected Results:
- [ ] All four sentences appear in live transcript
- [ ] Complete text is sent to AI
- [ ] No truncation
- [ ] AI responds to all parts

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 5: Background Noise Filtering

### Steps:
1. Turn on fan or play background music
2. Speak normally: "Can you hear me clearly?"
3. Verify voice is detected but noise isn't

### Expected Results:
- [ ] Your speech triggers VAD
- [ ] Background noise doesn't trigger false starts
- [ ] Transcription is accurate
- [ ] State only changes when YOU speak

### Console Logs to Verify:
```
[Voice] [VAD] Speech start detected (only when you speak)
```

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 6: No Audio Loss

### Steps:
1. Say very quickly: "Testing one two three"
2. Verify "Testing" (first word) is captured

### Expected Results:
- [ ] "Testing" appears in transcript
- [ ] No cut-off at beginning
- [ ] Full sentence captured

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 7: Auto-Send on Pause

### Steps:
1. Say: "Hello" then pause 1.5 seconds
2. Don't say anything else
3. Verify message is sent

### Expected Results:
- [ ] After 1.5s, state changes to "Thinking..."
- [ ] Message is sent to AI automatically
- [ ] Don't need to manually click send

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 8: Complete Silence Detection

### Steps:
1. Say: "Testing" then stay silent for 3+ seconds
2. Verify speech end is detected

### Expected Results:
- [ ] After 2.5s silence, turn ends
- [ ] Message is sent
- [ ] System returns to listening for next turn

### Console Logs to Verify:
```
[Voice] [VAD] Speech end detected
```

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 9: Conversation End

### Steps:
1. Start conversation
2. Click "End Conversation"
3. Verify clean shutdown

### Expected Results:
- [ ] Button changes to "Start Conversation"
- [ ] State changes to "idle"
- [ ] Microphone light turns off (browser indicator)
- [ ] All audio stops
- [ ] Can start new conversation cleanly

### Console Logs to Verify:
```
[Voice] [Conversation] Ending
[Voice] [LiveTranscription] Stopped
[Voice] [State] listening → idle
[Voice] [Conversation] Ended
```

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 10: State Persistence

### Steps:
1. Ask a question about ICP
2. Verify message appears in chat area
3. Check sidebar for chat entry
4. Refresh page
5. Select the chat from sidebar
6. Verify history loads

### Expected Results:
- [ ] User message appears in center chat area
- [ ] AI response appears in center chat area
- [ ] Chat appears in sidebar with title
- [ ] After refresh, chat is still in sidebar
- [ ] Clicking chat loads full history
- [ ] Can continue conversation via voice

**Status:** ⬜ PASS / ⬜ FAIL

---

## Known Limitations

### Browser Compatibility
- ❌ **Firefox**: No SpeechRecognition API support
  - Fallback: Manual transcription via ElevenLabs STT only
  - No live transcription display
  
- ✅ **Chrome/Edge**: Full support
- ✅ **Safari**: Full support
- ✅ **Opera**: Full support

### Performance Notes
- First message may take 3-5 seconds (cold start)
- Subsequent messages should be 1-2 seconds faster
- Network latency affects response time
- ElevenLabs TTS may have slight delays

---

## Troubleshooting Quick Fixes

### Issue: No live transcription showing
```javascript
// Run in console:
console.log('SpeechRecognition:', !!(window.SpeechRecognition || window.webkitSpeechRecognition));
// Should return: true
```
**Fix:** Use Chrome/Edge/Safari

### Issue: Microphone not working
1. Check browser permissions (camera icon in address bar)
2. Verify microphone works in other apps
3. Check console for permission errors

### Issue: No audio output
1. Check system volume
2. Check browser audio isn't muted
3. Verify AudioContext state in console:
```javascript
// Audio context should be 'running'
```

### Issue: State stuck in "Thinking..."
1. Check network tab for failed API calls
2. Verify OpenAI API key is correct
3. Check console for errors

### Issue: Multiple chats created
1. Check `conversationChatIdRef` in console
2. Verify no errors during first message
3. Check Supabase connection

---

## Success Criteria

### Minimum Passing Grade: 8/10 tests pass

**If 8+ tests pass:**
✅ Voice model is working correctly!

**If < 8 tests pass:**
❌ Review failed tests and check:
1. Console errors
2. Network tab (API calls)
3. Browser compatibility
4. Environment variables

---

## Performance Benchmarks

### Target Latencies (from speech end to audio start)

- **Live Transcription**: < 100ms ✅
- **Final Transcription**: < 500ms ✅
- **LLM First Token**: < 3s ✅
- **TTS First Audio**: < 1.5s ✅
- **Total Latency**: < 5s ✅

### Measure in Console:
```
[Voice] [Timing] STT duration: XXXms
[Voice] [Timing] OpenAI time-to-first-token: XXXms
[Voice] [Timing] TTS time-to-first-audio: XXXms
[Voice] [Timing] Total LLM duration: XXXms
```

---

## Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| 1. Basic Flow | ⬜ | |
| 2. Continuous | ⬜ | |
| 3. Barge-In | ⬜ | |
| 4. Multi-Sentence | ⬜ | |
| 5. Noise Filter | ⬜ | |
| 6. No Loss | ⬜ | |
| 7. Auto-Send | ⬜ | |
| 8. Silence | ⬜ | |
| 9. End | ⬜ | |
| 10. Persistence | ⬜ | |

**Overall:** __ / 10 PASS

---

**Testing Date:** _______________  
**Tester:** _______________  
**Browser:** _______________  
**OS:** _______________

---

## Next Steps After Testing

### If All Tests Pass:
1. Deploy to production
2. Monitor performance metrics
3. Gather user feedback
4. Consider enhancements (see VOICE_FIX_COMPLETE.md)

### If Tests Fail:
1. Note which tests failed
2. Check console for specific errors
3. Review VOICE_DEBUG_CHECKLIST.md
4. Re-run failed tests after fixes
5. Contact support if stuck

---

**Good luck testing!** 🎤✨
