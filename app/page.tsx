"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Conversation as ElevenLabsClient } from "@elevenlabs/client"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ui/conversation"
import { Orb } from "@/components/ui/orb"
import {
  Mic,
  Send,
  Paperclip,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import type { AgentState } from "@/components/ui/orb"

interface VoiceChatUIProps {
  initialSessionId?: string | null
}

// Helper function to generate session title from first message
function generateSessionTitle(firstMessage: string): string {
  // Extract first 3-5 words, clean up, and truncate to ~50 characters
  const words = firstMessage.trim().split(/\s+/).slice(0, 5)
  let title = words.join(" ")
  
  // Remove special characters that might not look good in titles
  title = title.replace(/[^\w\s-]/g, "")
  
  // Truncate if too long
  if (title.length > 50) {
    title = title.substring(0, 47) + "..."
  }
  
  return title || "New Chat"
}

// Helper function to update session title if needed
async function updateSessionTitleIfNeeded(sessionId: string, firstUserMessage: string) {
  try {
    // Check if session title is still "New Chat" and has no previous messages
    const { data: session } = await supabase
      .from("sessions")
      .select("title")
      .eq("id", sessionId)
      .single()
    
    if (session && session.title === "New Chat") {
      // Check message count
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("role", "user")
      
      // Only update if this is the first user message
      if (count === 1) {
        const newTitle = generateSessionTitle(firstUserMessage)
        await supabase
          .from("sessions")
          .update({ title: newTitle })
          .eq("id", sessionId)
      }
    }
  } catch (error) {
    console.error("Error updating session title:", error)
    // Don't throw - title update failure shouldn't break the flow
  }
}

export function VoiceChatUI({ initialSessionId = null }: VoiceChatUIProps = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const [mode, setMode] = useState<"voice" | "chat">("chat")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [paused, setPaused] = useState(false)
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)

  const [sessions, setSessions] = useState<any[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const [contextExpanded, setContextExpanded] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  
  // Refs for audio and conversation management
  const fileInputRef = useRef<HTMLInputElement>(null)
  const conversationRef = useRef<ElevenLabsClient | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioQueueRef = useRef<AudioBuffer[]>([])
  const isPlayingAudioRef = useRef<boolean>(false)
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  
  // Refs for current state (used in closures to avoid stale values)
  const modeRef = useRef<"voice" | "chat">("chat")
  const pausedRef = useRef<boolean>(false)
  const isRehydratingRef = useRef<boolean>(false)
  const lastAgentMessageRef = useRef<string>("")
  const rehydrationCooldownRef = useRef<number>(0)
  
  // Keep refs in sync with state
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    async function loadSessions() {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("deleted", false)
        .order("created_at", { ascending: false })

      if (data) {
        setSessions(data)
      }
    }

    loadSessions()
  }, [])

  // Handle initial session ID from props (for dynamic route) or pathname
  useEffect(() => {
    if (initialSessionId) {
      // Validate session exists
      async function validateAndSetSession() {
        const { data, error } = await supabase
          .from("sessions")
          .select("id")
          .eq("id", initialSessionId)
          .eq("deleted", false)
          .single()

        if (error || !data) {
          // Session doesn't exist or is deleted, redirect to root
          router.push("/")
        } else {
          setActiveSessionId(initialSessionId)
          // Save to sessionStorage for caching
          if (typeof window !== "undefined" && initialSessionId) {
            sessionStorage.setItem("lastVisitedSessionId", initialSessionId)
          }
        }
      }
      validateAndSetSession()
    } else if (pathname === "/") {
      // Root route: check for cached session
      if (typeof window !== "undefined") {
        const cachedSessionId = sessionStorage.getItem("lastVisitedSessionId")
        if (cachedSessionId) {
          // Validate cached session still exists
          async function validateCachedSession() {
            const { data, error } = await supabase
              .from("sessions")
              .select("id")
              .eq("id", cachedSessionId)
              .eq("deleted", false)
              .single()

            if (!error && data) {
              // Redirect to cached session
              router.push(`/${cachedSessionId}`)
            } else {
              // Invalid cached session, clear it
              sessionStorage.removeItem("lastVisitedSessionId")
            }
          }
          validateCachedSession()
        }
        // If no cached session, stay on root (no activeSessionId)
      }
    }
  }, [initialSessionId, pathname, router])

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([])
      setUploadedFiles([])
      // End conversation when no active session
      endConversation().catch(err => console.error("Error ending conversation:", err))
      return
    }

    // Validate session still exists (handle case where session was deleted)
    async function validateSession() {
      const { data, error } = await supabase
        .from("sessions")
        .select("id")
        .eq("id", activeSessionId)
        .eq("deleted", false)
        .single()

      if (error || !data) {
        // Session was deleted, redirect to root
        console.warn("Session was deleted, redirecting to root")
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("lastVisitedSessionId")
        }
        router.push("/")
        return false
      }
      return true
    }

    // End any active conversation when switching sessions
    // User must explicitly start a new conversation (lazy start)
    endConversation().catch(err => console.error("Error ending conversation:", err))

    async function loadData() {
      const isValid = await validateSession()
      if (!isValid) return

      async function loadMessages() {
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("session_id", activeSessionId)
          .order("created_at", { ascending: true })

        setMessages(data || [])
      }

      async function loadFiles() {
        const { data } = await supabase
          .from("files")
          .select("*")
          .eq("session_id", activeSessionId)
          .order("created_at", { ascending: true })

        setUploadedFiles(data || [])
      }

      loadMessages()
      loadFiles()
    }

    loadData()
    
    // Refresh sessions list to get updated titles
    async function refreshSessions() {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("deleted", false)
        .order("created_at", { ascending: false })
      if (data) {
        setSessions(data)
        // If current session is no longer in the list, it was deleted
        const currentSessionExists = data.some(s => s.id === activeSessionId)
        if (!currentSessionExists && activeSessionId) {
          console.warn("Current session no longer exists in sessions list")
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("lastVisitedSessionId")
          }
          router.push("/")
        }
      }
    }
    refreshSessions()
  }, [activeSessionId, router])

  async function createNewSession() {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ title: "New Chat" })
      .select()
      .single()

    if (!error && data) {
      setSessions((prev) => [data, ...prev])
      setActiveSessionId(data.id)
      // Navigate to new session route
      router.push(`/${data.id}`)
      // Save to sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.setItem("lastVisitedSessionId", data.id)
      }
    }
  }

  async function deleteAllChats() {
    await supabase
      .from("sessions")
      .update({ deleted: true })
      .eq("deleted", false)

    setSessions([])
    setMessages([])
    setUploadedFiles([])
    setActiveSessionId(null)
    // Clear cache and redirect to root
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("lastVisitedSessionId")
    }
    router.push("/")
  }

  // Constants for cost safety
  const VOICE_SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes

  async function requestMicAccess(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      return true
    } catch (error) {
      console.error("Mic permission denied:", error)
      alert("Microphone access is required for voice mode. Please allow microphone access and try again.")
      return false
    }
  }

  // Helper function to rehydrate conversation context
  async function rehydrateConversation(sessionId: string, isModeSwitch: boolean = false) {
    if (!conversationRef.current) return

    try {
      // Get conversation history from database (last 30 messages for better context)
      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", sessionId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true })
        .limit(30)

      if (!messages || messages.length === 0) {
        console.log("[REHYDRATE] No conversation history to rehydrate")
        return
      }

      // Build context message from conversation history
      const contextMessages = messages
        .map((msg: any) => {
          if (msg.role === "user") {
            return `User: ${msg.content}`
          } else if (msg.role === "assistant") {
            return `Assistant: ${msg.content}`
          }
          return null
        })
        .filter((msg: string | null) => msg !== null)
        .join("\n\n")

      // Only rehydrate if there's actual conversation history
      if (contextMessages.trim()) {
        // Enhanced prompt to prevent repetition, especially on mode switches
        const modeSwitchNote = isModeSwitch 
          ? "\n\nIMPORTANT: The user is switching between voice and chat modes. This is the SAME conversation. Do NOT re-ask questions you already asked. Do NOT repeat information you already collected. Continue naturally from where you left off."
          : ""
        
        const contextPrompt = `[SYSTEM CONTEXT UPDATE - ABSOLUTELY DO NOT RESPOND - THIS IS NOT A USER MESSAGE]

⚠️ CRITICAL: This is a SYSTEM CONTEXT UPDATE, NOT a user message. DO NOT RESPOND TO THIS MESSAGE.

This is a CONTINUATION of an existing conversation. You have already introduced yourself and greeted the user.${modeSwitchNote}

COMPLETE CONVERSATION HISTORY:
${contextMessages}

🚫 ABSOLUTE REQUIREMENTS - YOU MUST NOT:
- DO NOT respond to this message
- DO NOT generate any text response
- DO NOT generate any audio response
- DO NOT say anything
- DO NOT repeat questions you already asked
- DO NOT re-ask for information you already collected
- DO NOT say "I understand" or "I'll help you" or similar phrases
- DO NOT acknowledge this message in any way
- DO NOT generate any output whatsoever

✅ WHAT YOU SHOULD DO:
- Remember all information from the conversation history above
- Wait silently for the user's NEXT actual input
- Only respond when the user speaks/types something NEW (not this message)
- Continue naturally from where the conversation left off
- If switching modes, maintain full context - this is the SAME conversation

This message is for YOUR MEMORY ONLY. The user has NOT asked you anything. Wait for their next message.`
        
        // CRITICAL: Set rehydration flag to ignore responses for a short period
        isRehydratingRef.current = true
        rehydrationCooldownRef.current = Date.now() + 5000 // 5 second cooldown
        
        // Send context message - agent should not respond based on instructions
        try {
          await (conversationRef.current as any).sendUserMessage(contextPrompt)
          console.log(`[REHYDRATE] Conversation context rehydrated with ${messages.length} messages${isModeSwitch ? ' (mode switch)' : ''}`)
          
          // Clear rehydration flag after a delay to allow any immediate responses to be filtered
          setTimeout(() => {
            isRehydratingRef.current = false
            console.log("[REHYDRATE] Rehydration cooldown ended")
          }, 5000)
        } catch (error) {
          console.error("[REHYDRATE] Error sending rehydration context:", error)
          isRehydratingRef.current = false
        }
      }
    } catch (error) {
      console.error("[REHYDRATE] Failed to rehydrate conversation:", error)
      // Don't throw - rehydration failure shouldn't break the session
    }
  }

  // Centralized conversation lifecycle: End conversation
  async function endConversation() {
    // End ElevenLabs session
    if (conversationRef.current) {
      try {
        await conversationRef.current.endSession()
      } catch (err) {
        console.error("Error ending session:", err)
      }
      conversationRef.current = null
    }

    // Clean up mic stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop())
      micStreamRef.current = null
    }

    // Clean up audio context
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close()
      } catch (err) {
        console.error("Error closing audio context:", err)
      }
      audioContextRef.current = null
    }

    // Reset state
    audioQueueRef.current = []
    isPlayingAudioRef.current = false
    currentAudioSourceRef.current = null
    setIsVoiceSessionActive(false)
    setAgentState(null)
    setPaused(false)
  }

  async function playAudio(audioData: ArrayBuffer) {
    // CRITICAL: Don't queue audio if in chat mode or paused
    if (modeRef.current === "chat" || pausedRef.current) {
      console.log("Skipping audio - chat mode or paused")
      return
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }

    try {
      // Resume audio context if suspended (browser autoplay policy)
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData)
      
      // Double-check before queuing (state might have changed)
      const currentMode = modeRef.current
      if (currentMode !== "voice" || pausedRef.current) {
        return
      }
      
      audioQueueRef.current.push(audioBuffer)
      
      if (!isPlayingAudioRef.current) {
        processAudioQueue()
      }
    } catch (error) {
      console.error("Error decoding/playing audio:", error)
    }
  }

  async function processAudioQueue() {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingAudioRef.current = false
      currentAudioSourceRef.current = null
      if (!pausedRef.current && modeRef.current === "voice") {
        setAgentState("listening")
      }
      return
    }

    // Don't play audio if paused or in chat mode - use refs for current state
    if (pausedRef.current || modeRef.current === "chat") {
      // Clear the queue when paused or in chat mode
      audioQueueRef.current = []
      isPlayingAudioRef.current = false
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop()
          currentAudioSourceRef.current.disconnect()
        } catch (error) {
          // Ignore errors
        }
        currentAudioSourceRef.current = null
      }
      return
    }

    isPlayingAudioRef.current = true
    setAgentState("talking")

    const audioBuffer = audioQueueRef.current.shift()!
    const source = audioContextRef.current.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContextRef.current.destination)
    currentAudioSourceRef.current = source

    source.onended = () => {
      currentAudioSourceRef.current = null
      processAudioQueue()
    }

    source.start()
  }

  // Centralized conversation lifecycle: Start or resume conversation
  async function startConversation(sessionId: string, initialMode: "voice" | "chat") {
    // Always start fresh - mode switching should call endConversation first
    if (conversationRef.current) {
      console.warn("[SESSION] Conversation already active - this should not happen during mode switch. Ending existing session.")
      await endConversation()
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    try {
      // For voice mode, request mic permission first
      if (initialMode === "voice") {
        console.log("[SESSION] Requesting microphone access for voice mode")
        const micGranted = await requestMicAccess()
        if (!micGranted) {
          throw new Error("Microphone access denied")
        }
        console.log("[SESSION] Microphone access granted")
        setAgentState("listening")
        setIsVoiceSessionActive(true)
      } else {
        console.log("[SESSION] Starting in chat mode (textOnly: true)")
      }

      conversationRef.current = await ElevenLabsClient.startSession({
        agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!,
        ...({ connectionType: "websocket" } as any),
        ...(sessionId ? { sessionId } as any : {}),
        ...(initialMode === "chat" ? {
          overrides: {
            conversation: {
              textOnly: true
            },
          },
        } : {}),
        onMessage: async (message: any) => {
          console.log("[SDK] Message received:", message.type || message.source, "Mode:", modeRef.current, "Paused:", pausedRef.current)
          
          // CRITICAL: Ignore all messages when paused (except for system messages if needed)
          if (pausedRef.current) {
            console.log("[SDK] Ignoring message - session is paused")
            return
          }
          
          // CRITICAL: In chat mode, ignore voice-related messages (user transcripts from mic)
          if (modeRef.current === "chat") {
            if (message.type === "user_transcript" || 
                (message.source === "user" && (message.type === "user_message" || message.audio))) {
              console.log("[SDK] Ignoring voice input in chat mode")
              return
            }
          }
          
          // Handle user messages/transcripts
          if (message.type === "user_transcript" || 
              message.type === "user_message" ||
              message.source === "user" ||
              (message.message && message.source === "user")) {
            // User speech transcribed
            const userContent = message.text || message.transcript || message.message || message.content || ""
            
            if (userContent.trim()) {
              // Optimistic update - show immediately
              const tempUserMsg = {
                id: `temp-user-${Date.now()}`,
                session_id: sessionId,
                role: "user",
                content: userContent,
                mode: mode,
                created_at: new Date().toISOString(),
              }
              setMessages((prev) => [...prev, tempUserMsg])

              // Save to database
              await supabase.from("messages").insert({
                session_id: sessionId,
                role: "user",
                content: userContent,
                mode: mode,
              })
              
              // Update session title if this is the first message
              await updateSessionTitleIfNeeded(sessionId, userContent)
              
              setAgentState("thinking")

              // Refresh messages to get the real ID
              const { data: refreshedMessages } = await supabase
                .from("messages")
                .select("*")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: true })
              if (refreshedMessages) {
                setMessages(refreshedMessages)
              }
              
              // Refresh sessions to update title in sidebar
              const { data: updatedSessions } = await supabase
                .from("sessions")
                .select("*")
                .eq("deleted", false)
                .order("created_at", { ascending: false })
              if (updatedSessions) {
                setSessions(updatedSessions)
              }
            }

          } else if (message.type === "agent_response" || 
                     message.type === "agent_message" ||
                     (message.source === "ai" && message.message && message.type !== "agent_audio")) {
            // Agent text response
            const agentContent = message.text || message.message || message.response || message.content || ""
            
            // CRITICAL: Filter out blank/empty messages
            if (!agentContent || !agentContent.trim()) {
              console.log("[SDK] Ignoring blank/empty agent message")
              return
            }
            
            // CRITICAL: Ignore responses during rehydration cooldown period
            if (isRehydratingRef.current || Date.now() < rehydrationCooldownRef.current) {
              console.log("[SDK] Ignoring agent response - rehydration cooldown active")
              return
            }
            
            // CRITICAL: Prevent duplicate messages - ignore if same as last message
            const trimmedContent = agentContent.trim()
            if (trimmedContent === lastAgentMessageRef.current) {
              console.log("[SDK] Ignoring duplicate agent message")
              return
            }
            
            // CRITICAL: In chat mode, ensure we're not in voice mode (defensive check)
            if (modeRef.current !== "chat" && modeRef.current !== "voice") {
              console.log("[SDK] Ignoring message - invalid mode")
              return
            }
            
            if (agentContent.trim()) {
              // Update last message ref to prevent duplicates
              lastAgentMessageRef.current = trimmedContent
              
              // CRITICAL: Check if this message already exists in the database (prevent duplicates)
              const { data: existingMessages } = await supabase
                .from("messages")
                .select("id, content")
                .eq("session_id", sessionId)
                .eq("role", "assistant")
                .order("created_at", { ascending: false })
                .limit(5)
              
              // Check if the exact same message was just saved
              const isDuplicate = existingMessages?.some(
                (msg: any) => msg.content?.trim() === trimmedContent
              )
              
              if (isDuplicate) {
                console.log("[SDK] Message already exists in database - skipping save")
                // Still update UI if needed, but don't save again
                return
              }
              
              // Optimistic update
              const tempAgentMsg = {
                id: `temp-agent-${Date.now()}`,
                session_id: sessionId,
                role: "assistant",
                content: agentContent,
                mode: mode,
                created_at: new Date().toISOString(),
              }
              setMessages((prev) => {
                // Also check in current state to prevent UI duplicates
                const alreadyExists = prev.some(
                  (msg: any) => msg.role === "assistant" && msg.content?.trim() === trimmedContent
                )
                if (alreadyExists) {
                  console.log("[SDK] Message already in UI - skipping optimistic update")
                  return prev
                }
                return [...prev, tempAgentMsg]
              })

              // Save to database
              await supabase.from("messages").insert({
                session_id: sessionId,
                role: "assistant",
                content: agentContent,
                mode: mode,
              })
              
              if (mode === "voice") {
                setAgentState("talking")
              }

              // Refresh messages to get the real ID
              const { data: refreshedMessages } = await supabase
                .from("messages")
                .select("*")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: true })
              if (refreshedMessages) {
                setMessages(refreshedMessages)
              }
            }

          } else if (message.type === "agent_audio" || message.audio) {
            // Agent audio chunk - only play if in voice mode and not paused
            // Use refs to get current state (not closure-captured values)
            // CRITICAL: Ignore audio in chat mode or when paused
            if (modeRef.current !== "voice") {
              console.log("[SDK] Ignoring audio - chat mode active")
              return
            }
            if (pausedRef.current) {
              console.log("[SDK] Ignoring audio - session paused")
              return
            }
            if (modeRef.current === "voice" && !pausedRef.current) {
              const audioData = message.audio || message.audioChunk || message.data
              if (audioData) {
                try {
                  // Convert base64 or ArrayBuffer to ArrayBuffer
                  let audioBuffer: ArrayBuffer
                  if (typeof audioData === "string") {
                    // Base64 encoded - remove data URL prefix if present
                    const base64Data = audioData.includes(",") 
                      ? audioData.split(",")[1] 
                      : audioData
                    const binaryString = atob(base64Data)
                    const bytes = new Uint8Array(binaryString.length)
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i)
                    }
                    audioBuffer = bytes.buffer
                  } else if (audioData instanceof ArrayBuffer) {
                    audioBuffer = audioData
                  } else if (audioData instanceof Uint8Array) {
                    audioBuffer = new ArrayBuffer(audioData.buffer.byteLength)
                    new Uint8Array(audioBuffer).set(audioData)
                  } else {
                    // Try to convert other array-like formats
                    const uint8 = new Uint8Array(audioData)
                    audioBuffer = new ArrayBuffer(uint8.length)
                    new Uint8Array(audioBuffer).set(uint8)
                  }
                  await playAudio(audioBuffer)
                } catch (error) {
                  console.error("Error processing audio data:", error)
                }
              }
            } else {
              // In chat mode or paused - ignore audio completely
              console.log("Ignoring audio - chat mode or paused")
            }

          } else if (message.source === "ai" && message.message) {
            // Fallback: handle standard AI messages
            const fallbackContent = message.message || ""
            
            // CRITICAL: Filter out blank/empty messages
            if (!fallbackContent || !fallbackContent.trim()) {
              console.log("[SDK] Ignoring blank/empty fallback agent message")
              return
            }
            
            // CRITICAL: Ignore responses during rehydration cooldown period
            if (isRehydratingRef.current || Date.now() < rehydrationCooldownRef.current) {
              console.log("[SDK] Ignoring fallback agent response - rehydration cooldown active")
              return
            }
            
            // CRITICAL: Prevent duplicate messages
            const trimmedContent = fallbackContent.trim()
            if (trimmedContent === lastAgentMessageRef.current) {
              console.log("[SDK] Ignoring duplicate fallback agent message")
              return
            }
            
            // Update last message ref
            lastAgentMessageRef.current = trimmedContent
            
            // Only process if we have valid content
            await supabase.from("messages").insert({
              session_id: sessionId,
              role: "assistant",
              content: fallbackContent,
              mode: mode,
            })
            
            // Optimistic update
            const tempAgentMsg = {
              id: `temp-agent-${Date.now()}`,
              session_id: sessionId,
              role: "assistant",
              content: fallbackContent,
              mode: mode,
              created_at: new Date().toISOString(),
            }
            setMessages((prev) => [...prev, tempAgentMsg])
            
            if (mode === "voice") {
              setAgentState("listening")
            } else {
              setAgentState("thinking")
            }

            // Refresh messages
            const { data: refreshedMessages } = await supabase
              .from("messages")
              .select("*")
              .eq("session_id", sessionId)
              .order("created_at", { ascending: true })
            if (refreshedMessages) {
              setMessages(refreshedMessages)
            }
          } else {
            // Log unhandled message types for debugging
            console.log("[SDK] Unhandled message type:", message.type, "Source:", message.source, "Full message:", message)
          }
        },
        onError: (error: any) => {
          console.error("Conversation Error:", error)
          setIsVoiceSessionActive(false)
          setAgentState(null)
          // Allow user to restart by clicking Orb again
        }
      })

      // CRITICAL: Rehydrate conversation context after session starts
      // Small delay to ensure session is fully initialized
      await new Promise(resolve => setTimeout(resolve, 500))
      await rehydrateConversation(sessionId, false)
      
      console.log(`[SESSION] Started conversation in ${initialMode} mode for session ${sessionId}`)
    } catch (err) {
      console.error("Failed to start conversation:", err)
      
      // Clean up on error
      await endConversation()
      
      throw err
    }
  }

  // Cost safety: Voice session timeout
  useEffect(() => {
    if (!isVoiceSessionActive) return

    const timeout = setTimeout(() => {
      console.warn("Voice session timeout - ending")
      endConversation()
    }, VOICE_SESSION_TIMEOUT)

    return () => clearTimeout(timeout)
  }, [isVoiceSessionActive])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop())
        micStreamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      conversationRef.current?.endSession()
      conversationRef.current = null
    }
  }, [])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeSessionId) return

    setIsUploading(true)
    try {
      // 1. Upload to Supabase Storage
      const fileExt = file.name.split(".").pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
      const storagePath = `uploads/${activeSessionId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(storagePath, file)

      if (uploadError) throw uploadError

      // 2. Extract Text via Backend API
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) throw new Error("Failed to extract text")
      const { extractedText } = await res.json()

      // 3. Generate AI Summary
      let summary = ""
      try {
        const summaryRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: extractedText }),
        })

        if (summaryRes.ok) {
          const { summary: generatedSummary } = await summaryRes.json()
          summary = generatedSummary || ""
        } else {
          console.warn("Summary generation failed, continuing without summary")
        }
      } catch (summaryError) {
        console.warn("Summary generation error:", summaryError)
        // Continue without summary - not critical
      }

      // 4. Save metadata to DB (with full extracted text and summary)
      const { data: fileData, error: dbError } = await supabase
        .from("files")
        .insert({
          session_id: activeSessionId,
          name: file.name,
          mime_type: file.type,
          storage_path: storagePath,
          extracted_text: extractedText, // Full extracted text stored
          summary: summary || null, // AI-generated summary
        })
        .select()
        .single()

      if (dbError) throw dbError

      // 5. Inject Context into Agent (Hidden system message)
      const contextMessage = `
The user uploaded a document: "${file.name}".

Document Content (Summarized/Extracted):
${extractedText.slice(0, 15000)} ... (truncated if too long)

Use this as reference context for future responses. Do not repeat this content back to the user unless asked.
`
      if (conversationRef.current) {
        // Send as a user message but we won't save it to our own 'messages' table to keep history clean
        // The agent will see it as part of the conversation context
        await (conversationRef.current as any).sendUserMessage(contextMessage)
      }

      // 6. Update UI to show uploaded file
      setUploadedFiles((prev) => [...prev, fileData])

    } catch (error) {
      console.error("Upload failed:", error)
      alert("Failed to upload file")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleOrbClick() {
    if (mode !== "voice" || !activeSessionId || isSwitching) return

    if (!isVoiceSessionActive) {
      // Lazy start voice session on Orb click
      try {
        await startConversation(activeSessionId, "voice")
      } catch (error) {
        console.error("Failed to start voice conversation:", error)
        alert("Failed to start voice mode. Please try again.")
      }
    }
  }

  async function handlePause() {
    const newPaused = !paused

    if (newPaused) {
      // PAUSING/HOLDING: Stop mic completely and stop audio, but keep session alive
      console.log("[PAUSE] Pausing voice session")
      setPaused(true) // Set state first so ref updates immediately
      pausedRef.current = true
      
      // CRITICAL: Stop mic tracks completely (not just disable) to fully release mic
      if (micStreamRef.current) {
        const tracks = micStreamRef.current.getAudioTracks()
        tracks.forEach(track => {
          track.stop() // Stop completely to release mic resource
        })
        micStreamRef.current = null // Clear reference
        console.log("[PAUSE] Stopped and released microphone completely")
      }

      // Stop audio playback immediately
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop()
          currentAudioSourceRef.current.disconnect()
          currentAudioSourceRef.current = null
          console.log("[PAUSE] Stopped current audio playback")
        } catch (error) {
          // Source might already be stopped
        }
      }
      
      // Clear audio queue to prevent any queued audio from playing
      audioQueueRef.current = []
      isPlayingAudioRef.current = false
      console.log("[PAUSE] Cleared audio queue")

      // Try to pause via SDK if method exists
      if (conversationRef.current) {
        try {
          if ((conversationRef.current as any).pause && typeof (conversationRef.current as any).pause === "function") {
            (conversationRef.current as any).pause()
            console.log("[PAUSE] Called SDK pause() method")
          }
          // Also try mute method if pause doesn't exist
          else if ((conversationRef.current as any).mute && typeof (conversationRef.current as any).mute === "function") {
            (conversationRef.current as any).mute(true)
            console.log("[PAUSE] Called SDK mute(true) method")
          } else {
            console.log("[PAUSE] SDK pause/mute methods not available - using message filtering")
          }
        } catch (error) {
          console.log("[PAUSE] Error calling SDK pause method:", error)
        }
      }

      setAgentState("thinking")
      console.log("[PAUSE] Session paused - all messages will be ignored until resume")

    } else {
      // RESUMING: Re-request mic access and resume session
      console.log("[PAUSE] Resuming voice session")
      setPaused(false) // Set state first so ref updates immediately
      pausedRef.current = false
      
      // CRITICAL: Re-request mic access since we stopped it completely
      if (!micStreamRef.current) {
        console.log("[PAUSE] Re-requesting microphone access")
        const micGranted = await requestMicAccess()
        if (!micGranted) {
          console.error("[PAUSE] Failed to re-acquire microphone - staying paused")
          setPaused(true)
          pausedRef.current = true
          alert("Failed to re-acquire microphone access. Please check permissions.")
          return
        }
        console.log("[PAUSE] Microphone re-acquired successfully")
      } else {
        // If stream still exists (shouldn't happen, but handle gracefully)
        const tracks = micStreamRef.current.getAudioTracks()
        tracks.forEach(track => {
          track.enabled = true // Re-enable tracks
        })
        console.log("[PAUSE] Re-enabled existing microphone tracks")
      }

      // Try to unpause via SDK if method exists
      if (conversationRef.current) {
        try {
          if ((conversationRef.current as any).resume && typeof (conversationRef.current as any).resume === "function") {
            (conversationRef.current as any).resume()
            console.log("[PAUSE] Called SDK resume() method")
          }
          else if ((conversationRef.current as any).mute && typeof (conversationRef.current as any).mute === "function") {
            (conversationRef.current as any).mute(false)
            console.log("[PAUSE] Called SDK mute(false) method")
          } else {
            console.log("[PAUSE] SDK resume/unmute methods not available - message filtering disabled")
          }
        } catch (error) {
          console.log("[PAUSE] Error calling SDK resume method:", error)
        }
      }

      setAgentState("listening")
      console.log("[PAUSE] Session resumed - messages will be processed")
    }
  }

  async function sendChatMessage(text: string) {
    if (isSwitching || !text.trim()) {
      console.log("[CHAT] Cannot send message - invalid state:", { isSwitching, hasText: !!text.trim() })
      return
    }

    // Lazy session creation: create session if we don't have one
    let sessionId: string = activeSessionId || ""
    if (!sessionId) {
      console.log("[CHAT] No active session, creating new one")
      const { data, error } = await supabase
        .from("sessions")
        .insert({ title: "New Chat" })
        .select()
        .single()

      if (error || !data) {
        console.error("[CHAT] Failed to create session:", error)
        alert("Failed to create session. Please try again.")
        return
      }

      sessionId = data.id
      setActiveSessionId(sessionId)
      setSessions((prev) => [data, ...prev])
      
      // Navigate to new session route
      router.push(`/${sessionId}`)
      // Save to sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.setItem("lastVisitedSessionId", sessionId)
      }
    }

    console.log("[CHAT] Sending message in chat mode")

    // Lazy start chat session if not active
    if (!conversationRef.current) {
      try {
        console.log("[CHAT] Starting chat session")
        await startConversation(sessionId, "chat")
      } catch (error) {
        console.error("[CHAT] Failed to start chat session:", error)
        alert("Failed to start conversation. Please try again.")
        return
      }
    }

    // 1. Save user message
    await supabase.from("messages").insert({
      session_id: sessionId,
      role: "user",
      content: text,
      mode: "chat",
    })
    
    // Update session title if this is the first message
    await updateSessionTitleIfNeeded(sessionId, text)

    // Optimistic update
    setMessages((prev) => [...prev, { id: `temp-user-${Date.now()}`, role: "user", content: text, session_id: sessionId, created_at: new Date().toISOString() }])
    
    // Set agent state to thinking
    setAgentState("thinking")

    // 2. Send to SDK
    if (conversationRef.current) {
      try {
        console.log("[CHAT] Sending message to SDK")
        await (conversationRef.current as any).sendUserMessage(text)
        console.log("[CHAT] Message sent successfully")
      } catch (error) {
        console.error("[CHAT] Failed to send message:", error)
        // Try to restart session
        try {
          await startConversation(sessionId, "chat")
          await (conversationRef.current as any)?.sendUserMessage(text)
          console.log("[CHAT] Message sent after session restart")
        } catch (retryError) {
          console.error("[CHAT] Failed to send message after retry:", retryError)
          alert("Failed to send message. Please try again.")
        }
      }
    } else {
      console.error("[CHAT] No conversation session available")
      alert("Session not available. Please try again.")
    }
    
    // Refresh sessions to update title in sidebar
    const { data: updatedSessions } = await supabase
      .from("sessions")
      .select("*")
      .eq("deleted", false)
      .order("created_at", { ascending: false })
    if (updatedSessions) {
      setSessions(updatedSessions)
    }
  }

  // CRITICAL: Mode switching WITH proper session restart
  async function switchToVoice() {
    if (isSwitching || !activeSessionId) return

    console.log("[MODE] Switching to voice mode")
    setIsSwitching(true)
    try {
      // Always restart session to ensure proper voice mode
      // This ensures the SDK is in voice mode (not textOnly)
      const hadActiveSession = !!conversationRef.current
      
      // End existing session if it exists
      if (conversationRef.current) {
        console.log("[MODE] Ending existing session before switching to voice")
        await endConversation()
        // Small delay to ensure clean shutdown
        await new Promise(resolve => setTimeout(resolve, 300))
      }
      
      // Start new session in voice mode
      await startConversation(activeSessionId, "voice")
      
      // Rehydrate context if we had an active session (mode switch, not initial start)
      if (hadActiveSession) {
        console.log("[MODE] Rehydrating context after voice mode switch")
        await new Promise(resolve => setTimeout(resolve, 500))
        await rehydrateConversation(activeSessionId, true)
      }
      
      setMode("voice")
      modeRef.current = "voice"
      setPaused(false)
      pausedRef.current = false
      console.log("[MODE] Successfully switched to voice mode")
    } catch (error) {
      console.error("[MODE] Failed to switch to voice:", error)
      alert("Voice unavailable. Staying in chat mode.")
      setMode("chat")
      modeRef.current = "chat"
    } finally {
      setIsSwitching(false)
    }
  }

  async function switchToChat() {
    if (isSwitching || !activeSessionId) return

    console.log("[MODE] Switching to chat mode")
    setIsSwitching(true)
    try {
      // Always restart session to ensure proper chat mode (textOnly: true)
      // This ensures the SDK is in text-only mode and won't listen to mic
      const hadActiveSession = !!conversationRef.current
      
      // End existing session if it exists
      if (conversationRef.current) {
        console.log("[MODE] Ending existing session before switching to chat")
        await endConversation()
        // Small delay to ensure clean shutdown
        await new Promise(resolve => setTimeout(resolve, 300))
      }
      
      // Start new session in chat mode (textOnly: true)
      await startConversation(activeSessionId, "chat")
      
      // Rehydrate context if we had an active session (mode switch, not initial start)
      if (hadActiveSession) {
        console.log("[MODE] Rehydrating context after chat mode switch")
        await new Promise(resolve => setTimeout(resolve, 500))
        await rehydrateConversation(activeSessionId, true)
      }
      
      // CRITICAL: Stop mic completely in chat mode (not just disable)
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => {
          track.stop() // Stop completely to release mic resource
        })
        micStreamRef.current = null // Clear reference
        console.log("[MODE] Stopped and released microphone in chat mode")
      }
      
      // CRITICAL: Clear audio queue and stop any playing audio immediately
      audioQueueRef.current = []
      isPlayingAudioRef.current = false
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop()
          currentAudioSourceRef.current.disconnect()
          currentAudioSourceRef.current = null
        } catch (error) {
          // Ignore
        }
      }
      
      setIsVoiceSessionActive(false)
      setAgentState(null)
      setPaused(false)
      pausedRef.current = false
      setMode("chat")
      modeRef.current = "chat" // Update ref immediately
      console.log("[MODE] Successfully switched to chat mode")
    } catch (error) {
      console.error("[MODE] Failed to switch to chat:", error)
      alert("Failed to switch to chat mode.")
    } finally {
      setIsSwitching(false)
    }
  }

  // Auto-resize textarea
  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = "auto"
    target.style.height = target.scrollHeight + "px"
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const text = e.currentTarget.value
      if (text.trim()) {
        sendChatMessage(text)
        e.currentTarget.value = ""
        e.currentTarget.style.height = "auto"
      }
    }
  }

  // Filter out system messages from display (they're in context panel now)
  const displayMessages = messages.filter(msg => msg.role !== "system")

  return (
    <div className="h-screen flex bg-black text-white overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-64 bg-black border-r border-neutral-900 p-4 flex flex-col flex-shrink-0">
          <Button variant="secondary" className="mb-3 bg-neutral-800 text-white hover:bg-neutral-700 font-medium" onClick={createNewSession}>+ New Chat</Button>

          <div className="flex-1 space-y-2 text-sm overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-900 hover:scrollbar-thumb-neutral-600">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  activeSessionId === session.id
                    ? "bg-neutral-800 text-white font-medium"
                    : "hover:bg-neutral-900 text-neutral-300"
                }`}
                onClick={() => {
                  router.push(`/${session.id}`)
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("lastVisitedSessionId", session.id)
                  }
                }}
              >
                {session.title || "Untitled Session"}
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            className="mt-4 text-neutral-400 hover:text-neutral-200 justify-start"
            onClick={deleteAllChats}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete All Chats
          </Button>
        </aside>
      )}

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 h-screen">
        {/* Header - Fixed */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-900 flex-shrink-0 bg-black sticky top-0 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-neutral-900"
          >
            {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>

          <Tabs
            value={mode}
            onValueChange={(value) => {
              if (value === "voice" && mode !== "voice") {
                switchToVoice()
              } else if (value === "chat" && mode !== "chat") {
                switchToChat()
              }
            }}
          >
            <TabsList className="bg-transparent border-0 p-1 gap-1">
              <TabsTrigger
                value="voice"
                disabled={isSwitching || !activeSessionId}
                className="text-white data-[state=inactive]:text-white data-[state=inactive]:opacity-70 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-medium rounded-full px-4 py-1.5 transition-all duration-200"
              >
                Voice
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                disabled={isSwitching || !activeSessionId}
                className="text-white data-[state=inactive]:text-white data-[state=inactive]:opacity-70 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-medium rounded-full px-4 py-1.5 transition-all duration-200"
              >
                Chat
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="w-10" />
        </header>

        {/* Conversation Area - Scrollable Only */}
        <div className="flex-1 flex justify-center min-h-0 overflow-hidden relative">
          <div className="w-full max-w-4xl h-full flex flex-col">
            {/* Context Panel - Uploaded Documents */}
            {uploadedFiles.length > 0 && (
              <div className="border-b border-neutral-800 flex-shrink-0">
                <div
                  className="px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-900/50 transition-colors"
                  onClick={() => setContextExpanded(!contextExpanded)}
                >
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <Paperclip className="h-4 w-4" />
                    <span>{uploadedFiles.length} document{uploadedFiles.length > 1 ? "s" : ""} attached</span>
                  </div>
                  {contextExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
                {contextExpanded && (
                  <div className="px-6 pb-4 space-y-2">
                    {uploadedFiles.map((file) => (
                      <div key={file.id} className="bg-white border border-neutral-200 rounded-lg p-3 text-sm">
                        <div className="font-medium text-black mb-1">{file.name}</div>
                        {file.summary && (
                          <div className="text-neutral-600 text-xs">{file.summary}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Messages - Only This Scrolls */}
            <Conversation className="flex-1 pr-4 bg-black">
              <ConversationContent className="p-8 pr-12 bg-black min-h-full">
                {displayMessages.length === 0 ? (
                  <ConversationEmptyState className="gap-4">
                    <div className="space-y-2">
                      <h1 className="text-3xl font-semibold text-white mb-2">
                        Hey, I'm Alex 👋
                      </h1>
                      <p className="text-base text-neutral-300 max-w-md mx-auto">
                        We'll work together to build an Ideal Customer Profile (ICP) for your company.
                      </p>
                      <p className="text-sm text-neutral-400 mt-2">
                        Expect this to take around 15–20 minutes.
                      </p>
                    </div>
                  </ConversationEmptyState>
                ) : (
                  <div className="space-y-6">
                    {displayMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.role === "user" ? "justify-end" : "justify-start"
                        } animate-in fade-in slide-in-from-bottom-2 duration-300`}
                      >
                        {msg.role === "user" ? (
                          // User message: Right-aligned bubble
                          <div className="max-w-[60%] bg-orange-500 text-white rounded-2xl rounded-tr-sm px-5 py-3 shadow-sm">
                            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed text-left">
                              {msg.content}
                            </div>
                          </div>
                        ) : (
                          // AI message: Left-aligned, no bubble, on background
                          <div className="max-w-[70%]">
                            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed text-neutral-200">
                              {msg.content}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>
        </div>

        {/* Bottom Control Bar - Fixed at bottom, outside scrollable area */}
        <div className="flex-shrink-0 bg-black border-t border-neutral-900">
          <div className="max-w-4xl mx-auto">
            {mode === "voice" ? (
              <div className="p-6 flex items-center justify-center gap-4">
                {/* Pause Button */}
                {isVoiceSessionActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePause}
                    className="rounded-full w-12 h-12 text-white hover:bg-neutral-900"
                  >
                    {paused ? (
                      <Play className="h-5 w-5" />
                    ) : (
                      <Pause className="h-5 w-5" />
                    )}
                  </Button>
                )}

                {/* Orb */}
                <div
                  className="w-20 h-20 cursor-pointer"
                  onClick={handleOrbClick}
                >
                  <Orb agentState={agentState} />
                </div>

                {/* Attach File Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full w-12 h-12 text-white hover:bg-neutral-900"
                  disabled={isUploading}
                >
                  <Paperclip className="h-5 w-5" />
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.txt"
                />
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 relative">
                    <textarea
                      ref={chatInputRef}
                      placeholder="Message Alex..."
                      className="w-full border-0 rounded-xl px-4 py-3 pr-12 text-sm text-black placeholder-neutral-400 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500 min-h-[52px] max-h-[200px] overflow-hidden transition-all"
                      onInput={handleTextareaInput}
                      onKeyDown={handleTextareaKeyDown}
                      rows={1}
                      style={{ overflowY: 'hidden', backgroundColor: 'var(--accent)', borderColor: 'rgba(0, 0, 0, 1)', borderWidth: '0px' }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute h-8 w-8 text-neutral-600 hover:text-black justify-start"
                      style={{ left: '767px', top: '9px' }}
                      disabled={isUploading}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    onClick={() => {
                      const text = chatInputRef.current?.value
                      if (text?.trim()) {
                        sendChatMessage(text)
                        if (chatInputRef.current) {
                          chatInputRef.current.value = ""
                          chatInputRef.current.style.height = "auto"
                        }
                      }
                    }}
                    className="rounded-xl h-[52px] w-[51px] px-6 bg-neutral-700 text-white hover:bg-neutral-600 transition-colors font-medium flex items-center justify-center shadow-lg"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.txt"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function HomePage() {
  return <VoiceChatUI initialSessionId={null} />
}
