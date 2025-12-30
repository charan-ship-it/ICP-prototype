/**
 * Voice State Machine
 * Clean, predictable state transitions for voice conversations
 */

import { VoiceState, StateTransition } from './types';

type StateListener = (state: VoiceState, transition: StateTransition) => void;

// Valid state transitions
const VALID_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  idle: ['listening', 'error'],
  listening: ['processing', 'idle', 'error'],
  processing: ['speaking', 'listening', 'idle', 'error'],
  speaking: ['listening', 'idle', 'error'], // listening = barge-in
  error: ['idle', 'listening'],
};

export class VoiceStateMachine {
  private currentState: VoiceState = 'idle';
  private listeners: Set<StateListener> = new Set();
  private transitionHistory: StateTransition[] = [];
  private maxHistorySize = 50;

  constructor(initialState: VoiceState = 'idle') {
    this.currentState = initialState;
  }

  /**
   * Get current state
   */
  getState(): VoiceState {
    return this.currentState;
  }

  /**
   * Check if a transition is valid
   */
  canTransitionTo(newState: VoiceState): boolean {
    return VALID_TRANSITIONS[this.currentState].includes(newState);
  }

  /**
   * Transition to a new state
   */
  transition(newState: VoiceState, reason: string): boolean {
    if (!this.canTransitionTo(newState)) {
      console.warn(
        `[VoiceStateMachine] Invalid transition: ${this.currentState} → ${newState}. Reason: ${reason}`
      );
      return false;
    }

    const transition: StateTransition = {
      from: this.currentState,
      to: newState,
      reason,
      timestamp: Date.now(),
    };

    console.log(
      `[VoiceStateMachine] ${this.currentState} → ${newState} (${reason})`
    );

    this.currentState = newState;
    this.transitionHistory.push(transition);

    // Trim history if too large
    if (this.transitionHistory.length > this.maxHistorySize) {
      this.transitionHistory = this.transitionHistory.slice(-this.maxHistorySize);
    }

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(newState, transition);
      } catch (error) {
        console.error('[VoiceStateMachine] Listener error:', error);
      }
    });

    return true;
  }

  /**
   * Force transition (for error recovery)
   */
  forceTransition(newState: VoiceState, reason: string): void {
    const transition: StateTransition = {
      from: this.currentState,
      to: newState,
      reason: `FORCED: ${reason}`,
      timestamp: Date.now(),
    };

    console.warn(
      `[VoiceStateMachine] FORCED: ${this.currentState} → ${newState} (${reason})`
    );

    this.currentState = newState;
    this.transitionHistory.push(transition);

    this.listeners.forEach((listener) => {
      try {
        listener(newState, transition);
      } catch (error) {
        console.error('[VoiceStateMachine] Listener error:', error);
      }
    });
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get transition history
   */
  getHistory(): StateTransition[] {
    return [...this.transitionHistory];
  }

  /**
   * Get last transition
   */
  getLastTransition(): StateTransition | null {
    return this.transitionHistory[this.transitionHistory.length - 1] || null;
  }

  /**
   * Reset to idle state
   */
  reset(): void {
    this.forceTransition('idle', 'reset');
  }

  /**
   * Check if in active conversation (not idle)
   */
  isActive(): boolean {
    return this.currentState !== 'idle';
  }

  /**
   * Check if currently listening
   */
  isListening(): boolean {
    return this.currentState === 'listening';
  }

  /**
   * Check if AI is speaking
   */
  isSpeaking(): boolean {
    return this.currentState === 'speaking';
  }

  /**
   * Check if processing (transcribing or waiting for AI)
   */
  isProcessing(): boolean {
    return this.currentState === 'processing';
  }
}

