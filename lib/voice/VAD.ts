/**
 * Adaptive Voice Activity Detection (VAD)
 * 
 * Uses adaptive threshold that adjusts to ambient noise levels.
 * Much more robust than fixed threshold for environments with fans, AC, etc.
 */

import { VADOptions } from './types';

export class VAD {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private isActive = false;

  // Detection state
  private isSpeaking = false;
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;

  // Adaptive threshold
  private ambientNoiseLevel = 0;
  private isCalibrating = true;
  private calibrationSamples: number[] = [];
  private readonly CALIBRATION_SAMPLES = 30; // ~0.5 seconds at 60fps
  private readonly THRESHOLD_MULTIPLIER = 1.3; // Speech must be 1.3x louder than ambient (lowered for noisy environments)

  // Rolling average for smoothing
  private energyHistory: number[] = [];
  private readonly ENERGY_HISTORY_SIZE = 5;

  // Configuration
  private options: Required<VADOptions>;

  // Callbacks
  private onSpeechStart?: () => void;
  private onSpeechEnd?: () => void;
  private onSilenceTimeout?: () => void;

  constructor(options: VADOptions = {}) {
    this.options = {
      onSpeechStart: options.onSpeechStart,
      onSpeechEnd: options.onSpeechEnd,
      onSilenceTimeout: options.onSilenceTimeout,
      energyThreshold: options.energyThreshold ?? 0.015, // Fallback if calibration fails
      speechStartDelay: options.speechStartDelay ?? 100,
      silenceTimeout: options.silenceTimeout ?? 1200, // Longer timeout to avoid cutting off
      sampleRate: options.sampleRate ?? 16000,
    };

    this.onSpeechStart = options.onSpeechStart;
    this.onSpeechEnd = options.onSpeechEnd;
    this.onSilenceTimeout = options.onSilenceTimeout;
  }

  /**
   * Initialize VAD with a media stream
   */
  async initialize(stream: MediaStream): Promise<void> {
    if (this.isActive) {
      console.warn('[VAD] Already initialized');
      return;
    }

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.options.sampleRate,
      });

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create analyser with good frequency resolution
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.5; // Less smoothing for faster response

      // Connect stream to analyser
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);

      // Reset state
      this.isCalibrating = true;
      this.calibrationSamples = [];
      this.energyHistory = [];
      this.ambientNoiseLevel = 0;

      console.log('[VAD] Initialized - calibrating ambient noise...');
    } catch (error) {
      console.error('[VAD] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Calculate speech energy (focused on voice frequencies 300Hz-3400Hz)
   */
  private calculateEnergy(dataArray: Uint8Array): number {
    if (!this.analyser || !this.audioContext) return 0;

    const sampleRate = this.audioContext.sampleRate;
    const binSize = sampleRate / this.analyser.fftSize;
    
    // Focus on speech frequencies (300Hz - 3400Hz)
    const lowBin = Math.floor(300 / binSize);
    const highBin = Math.min(Math.floor(3400 / binSize), dataArray.length);

    let energy = 0;
    let count = 0;

    for (let i = lowBin; i < highBin; i++) {
      const normalized = dataArray[i] / 255;
      energy += normalized * normalized;
      count++;
    }

    return count > 0 ? Math.sqrt(energy / count) : 0;
  }

  /**
   * Get smoothed energy using rolling average
   */
  private getSmoothedEnergy(currentEnergy: number): number {
    this.energyHistory.push(currentEnergy);
    if (this.energyHistory.length > this.ENERGY_HISTORY_SIZE) {
      this.energyHistory.shift();
    }

    const sum = this.energyHistory.reduce((a, b) => a + b, 0);
    return sum / this.energyHistory.length;
  }

  /**
   * Start voice activity detection
   */
  start(): void {
    if (!this.analyser || !this.audioContext) {
      console.error('[VAD] Not initialized');
      return;
    }

    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.silenceStartTime = null;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let logCounter = 0;
    const LOG_INTERVAL = 60; // Log every ~1 second

    const detectVoice = () => {
      if (!this.isActive || !this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);

      const rawEnergy = this.calculateEnergy(dataArray);
      const smoothedEnergy = this.getSmoothedEnergy(rawEnergy);
      const now = Date.now();

      // Calibration phase - measure ambient noise
      if (this.isCalibrating) {
        this.calibrationSamples.push(rawEnergy);
        
        if (this.calibrationSamples.length >= this.CALIBRATION_SAMPLES) {
          // Calculate ambient noise as average + 1 std dev
          const avg = this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length;
          const variance = this.calibrationSamples.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / this.calibrationSamples.length;
          const stdDev = Math.sqrt(variance);
          
          this.ambientNoiseLevel = avg + stdDev;
          this.isCalibrating = false;
          
          console.log(`[VAD] ✅ Calibration complete - Ambient noise: ${this.ambientNoiseLevel.toFixed(4)}, Threshold: ${(this.ambientNoiseLevel * this.THRESHOLD_MULTIPLIER).toFixed(4)}`);
        }
        
        this.animationFrameId = requestAnimationFrame(detectVoice);
        return;
      }

      // Calculate dynamic threshold based on ambient noise
      const dynamicThreshold = Math.max(
        this.ambientNoiseLevel * this.THRESHOLD_MULTIPLIER,
        this.options.energyThreshold // Minimum threshold
      );

      const isSpeechDetected = smoothedEnergy > dynamicThreshold;

      // Periodic logging
      logCounter++;
      if (logCounter >= LOG_INTERVAL) {
        logCounter = 0;
        const status = this.isSpeaking ? '🗣️ SPEAKING' : '🔇 SILENT';
        const ratio = (smoothedEnergy / dynamicThreshold).toFixed(2);
        console.log(`[VAD] ${status} | Energy: ${smoothedEnergy.toFixed(4)} | Threshold: ${dynamicThreshold.toFixed(4)} | Ratio: ${ratio}x | ${isSpeechDetected ? '✓ ABOVE' : '✗ below'}`);
      }

      if (isSpeechDetected) {
        // Speech detected
        this.silenceStartTime = null;

        if (!this.isSpeaking) {
          if (this.speechStartTime === null) {
            this.speechStartTime = now;
          } else if (now - this.speechStartTime >= this.options.speechStartDelay) {
            // Confirmed speech start
            this.isSpeaking = true;
            this.speechStartTime = null;
            console.log('[VAD] 🎤 Speech started');
            this.onSpeechStart?.();
          }
        }
      } else {
        // Silence detected
        this.speechStartTime = null;

        if (this.isSpeaking) {
          if (this.silenceStartTime === null) {
            this.silenceStartTime = now;
          } else {
            const silenceDuration = now - this.silenceStartTime;
            
            // Log silence progress
            if (silenceDuration > 500 && silenceDuration % 200 < 20) {
              console.log(`[VAD] 🔇 Silence: ${silenceDuration}ms / ${this.options.silenceTimeout}ms`);
            }
            
            if (silenceDuration >= this.options.silenceTimeout) {
              // Confirmed silence - speech ended
              this.isSpeaking = false;
              this.silenceStartTime = null;
              console.log(`[VAD] ✅ Speech ended after ${silenceDuration}ms of silence`);
              this.onSpeechEnd?.();
              this.onSilenceTimeout?.();
            }
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(detectVoice);
    };

    detectVoice();
    console.log('[VAD] Started');
  }

  /**
   * Recalibrate ambient noise (call when environment changes)
   */
  recalibrate(): void {
    console.log('[VAD] Recalibrating...');
    this.isCalibrating = true;
    this.calibrationSamples = [];
    this.energyHistory = [];
  }

  /**
   * Stop voice activity detection
   */
  stop(): void {
    this.isActive = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Trigger speech end if was speaking
    if (this.isSpeaking) {
      this.isSpeaking = false;
      console.log('[VAD] Speech ended (stopped)');
      this.onSpeechEnd?.();
    }

    console.log('[VAD] Stopped');
  }

  /**
   * Check if currently detecting speech
   */
  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Check if VAD is active
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Check if calibrating
   */
  getIsCalibrating(): boolean {
    return this.isCalibrating;
  }

  /**
   * Get current ambient noise level
   */
  getAmbientNoiseLevel(): number {
    return this.ambientNoiseLevel;
  }

  /**
   * Update callbacks
   */
  setCallbacks(callbacks: {
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    onSilenceTimeout?: () => void;
  }): void {
    if (callbacks.onSpeechStart) this.onSpeechStart = callbacks.onSpeechStart;
    if (callbacks.onSpeechEnd) this.onSpeechEnd = callbacks.onSpeechEnd;
    if (callbacks.onSilenceTimeout) this.onSilenceTimeout = callbacks.onSilenceTimeout;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stop();

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        // Ignore
      }
      this.sourceNode = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {
        // Ignore
      }
      this.audioContext = null;
    }

    this.analyser = null;
    this.calibrationSamples = [];
    this.energyHistory = [];
    console.log('[VAD] Cleaned up');
  }
}
