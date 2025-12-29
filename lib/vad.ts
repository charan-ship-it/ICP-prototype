/**
 * Voice Activity Detection (VAD) using audio energy levels
 * Designed to work with continuous listening and live transcription
 */

export interface VADOptions {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onPauseDuringSpeech?: () => void;
  energyThreshold?: number;
  speechStartMs?: number;
  speechEndMs?: number;
  pauseDuringSpeechMs?: number;
  debugLogging?: boolean; // Add debug logging option
}

export function createVAD(
  audioContext: AudioContext,
  source: MediaStreamAudioSourceNode,
  options: VADOptions
): () => void {
  const {
    onSpeechStart,
    onSpeechEnd,
    onPauseDuringSpeech,
    energyThreshold = 0.03, // Higher threshold for background noise filtering
    speechStartMs = 150,
    speechEndMs = 1200, // 1.2 seconds silence = complete speech end (reduced from 2.5s)
    pauseDuringSpeechMs = 800, // 0.8 seconds pause = auto-send during speech (reduced from 1.5s)
    debugLogging = false,
  } = options;

  if (audioContext.state === 'closed') {
    console.warn('[VAD] AudioContext is closed, cannot create VAD');
    return () => {};
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch((err) => {
      console.error('[VAD] Failed to resume AudioContext:', err);
    });
  }

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85; // High smoothing to filter transient noise

  if (audioContext.state !== 'closed') {
    source.connect(analyser);
  } else {
    console.warn('[VAD] AudioContext closed before connecting analyser');
    return () => {};
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  let isSpeaking = false;
  let speechStartTime: number | null = null;
  let speechEndTime: number | null = null;
  let pauseStartTime: number | null = null;
  let hasTriggeredPause = false;
  let animationFrameId: number;

  const checkEnergy = () => {
    analyser.getByteFrequencyData(dataArray);

    // Calculate RMS energy
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = dataArray[i] / 255;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);

    // Focus on human speech frequencies (300Hz - 3400Hz)
    const sampleRate = audioContext.sampleRate;
    const speechLowBin = Math.floor(300 * analyser.fftSize / sampleRate);
    const speechHighBin = Math.floor(3400 * analyser.fftSize / sampleRate);
    
    let speechEnergy = 0;
    let speechCount = 0;
    for (let i = speechLowBin; i < Math.min(speechHighBin, bufferLength); i++) {
      const normalized = dataArray[i] / 255;
      speechEnergy += normalized * normalized;
      speechCount++;
    }
    const speechRms = speechCount > 0 ? Math.sqrt(speechEnergy / speechCount) : 0;

    // Require both overall energy and speech-band energy
    const now = Date.now();
    const threshold = energyThreshold;
    const speechThreshold = threshold * 1.5;
    const hasSpeech = speechRms > speechThreshold && rms > threshold;

    if (hasSpeech) {
      // Speech detected
      speechEndTime = null;
      pauseStartTime = null;
      hasTriggeredPause = false;

      if (!isSpeaking) {
        if (speechStartTime === null) {
          speechStartTime = now;
        } else if (now - speechStartTime >= speechStartMs) {
          // Confirmed speech start
          isSpeaking = true;
          speechStartTime = null;
          if (debugLogging) {
            console.log('[VAD] Speech confirmed - user is speaking');
          }
          onSpeechStart();
        }
      }
    } else {
      // Silence detected
      speechStartTime = null;

      if (isSpeaking) {
        // User was speaking, now silence
        if (speechEndTime === null) {
          speechEndTime = now;
          pauseStartTime = now;
          if (debugLogging) {
            console.log('[VAD] Silence detected - starting pause timer');
          }
        } else {
          const pauseDuration = now - pauseStartTime!;
          
          // Check for pause during speech (auto-send)
          if (onPauseDuringSpeech && !hasTriggeredPause && pauseDuration >= pauseDuringSpeechMs) {
            hasTriggeredPause = true;
            if (debugLogging) {
              console.log(`[VAD] Pause threshold reached (${pauseDuration}ms) - auto-sending`);
            }
            onPauseDuringSpeech();
            // Don't reset isSpeaking yet - user might continue
          }
          
          // Check for complete speech end (longer pause)
          if (now - speechEndTime >= speechEndMs) {
            // Confirmed speech end
            isSpeaking = false;
            speechEndTime = null;
            pauseStartTime = null;
            hasTriggeredPause = false;
            if (debugLogging) {
              console.log('[VAD] Complete silence - speech ended');
            }
            onSpeechEnd();
          }
        }
      }
    }

    animationFrameId = requestAnimationFrame(checkEnergy);
  };

  checkEnergy();

  // Return cleanup function
  return () => {
    cancelAnimationFrame(animationFrameId);
    try {
      if (audioContext.state !== 'closed') {
        analyser.disconnect();
      }
    } catch (e) {
      console.warn('[VAD] Cleanup warning:', e);
    }
  };
}
