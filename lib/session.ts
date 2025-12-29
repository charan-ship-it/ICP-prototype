'use client';

const SESSION_STORAGE_KEY = 'icp_builder_session_id';

/**
 * Get session ID from localStorage
 */
export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

/**
 * Store session ID in localStorage
 */
export function setSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

/**
 * Clear session ID from localStorage
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Get or create a session ID
 * Checks localStorage first, then calls API if needed
 */
export async function getOrCreateSessionId(): Promise<string> {
  // Check localStorage first
  const existingSessionId = getSessionId();
  if (existingSessionId) {
    // Validate session exists on server (optional for Phase 1, but good practice)
    try {
      const response = await fetch(`/api/sessions?session_id=${existingSessionId}`);
      if (response.ok) {
        const data = await response.json();
        return data.session_id;
      }
    } catch (error) {
      console.error('Error validating session:', error);
      // If validation fails, continue to create new session
    }
  }

  // Create new session via API
  try {
    const response = await fetch('/api/sessions', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to create session');
    }

    const data = await response.json();
    const sessionId = data.session_id;

    // Store in localStorage
    setSessionId(sessionId);

    return sessionId;
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

