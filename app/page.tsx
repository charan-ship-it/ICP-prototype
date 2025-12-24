"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Conversation as ElevenLabsClient } from "@elevenlabs/client"
import { Button } from "@/components/ui/button"
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
} from "lucide-react"
import type { AgentState } from "@/components/ui/orb"

export default function VoiceChatUI() {
  const [mode, setMode] = useState<"voice" | "chat">("chat")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [paused, setPaused] = useState(false)
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)

  const [sessions, setSessions] = useState<any[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const conversationRef = useRef<ElevenLabsClient | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioQueueRef = useRef<AudioBuffer[]>([])
  const isPlayingAudioRef = useRef<boolean>(false)
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null)

  useEffect(() => {
    async function loadSessions() {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("deleted", false)
        .order("created_at", { ascending: false })

      if (data) {
        setSessions(data)
        if (data.length > 0) setActiveSessionId(data[0].id)
      }
    }

    loadSessions()
  }, [])

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([])
      // End conversation when no active session
      endConversation().catch(err => console.error("Error ending conversation:", err))
      return
    }

    // End any active conversation when switching sessions
    // User must explicitly start a new conversation (lazy start)
    endConversation().catch(err => console.error("Error ending conversation:", err))

    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", activeSessionId)
        .order("created_at", { ascending: true })

      setMessages(data || [])
    }

    loadMessages()
  }, [activeSessionId])

  async function createNewSession() {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ title: "New Chat" })
      .select()
      .single()

    if (!error && data) {
      setSessions((prev) => [data, ...prev])
      setActiveSessionId(data.id)
    }
  }

  async function deleteAllChats() {
    await supabase
      .from("sessions")
      .update({ deleted: true })
      .eq("deleted", false)

    setSessions([])
    setMessages([])
    setActiveSessionId(null)
  }

  // Constants for cost safety
  const VOICE_SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes
  const SILENCE_TIMEOUT = 5 * 60 * 1000 // 5 minutes

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
  async function rehydrateConversation(sessionId: string) {
    if (!conversationRef.current) return

    try {
      // Get conversation history from database (last 20 messages)
      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", sessionId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true })
        .limit(20)

      if (!messages || messages.length === 0) {
        console.log("No conversation history to rehydrate")
        return
      }

      // Check if this is a continuing conversation (more than just intro)
      const hasSubstantialHistory = messages.length > 2

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
        // Very explicit instruction to prevent intro repetition and responses
        const contextPrompt = `[SYSTEM CONTEXT - DO NOT RESPOND]

This is a CONTINUATION of an existing conversation. You have already introduced yourself and greeted the user. 

Previous conversation:
${contextMessages}

CRITICAL INSTRUCTIONS:
- This is ONLY for your context/memory
- Do NOT respond to this message
- Do NOT repeat any introductions or greetings
- Do NOT say "I'll help you" or similar phrases
- Wait silently for the user's actual input
- Only respond when the user speaks/types something new
- Do not generate any audio or text response to this context message`
        
        // Send context message - agent should not respond based on instructions
        try {
          await (conversationRef.current as any).sendUserMessage(contextPrompt)
          console.log("Conversation context rehydrated with", messages.length, "messages")
        } catch (error) {
          console.error("Error sending rehydration context:", error)
        }
      }
    } catch (error) {
      console.error("Failed to rehydrate conversation:", error)
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
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }

    try {
      // Resume audio context if suspended (browser autoplay policy)
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData)
      audioQueueRef.current.push(audioBuffer)
      
      if (!isPlayingAudioRef.current) {
        processAudioQueue()
      }
    } catch (error) {
      console.error("Error decoding/playing audio:", error)
      // If decoding fails, it might be raw PCM - log for debugging
    }
  }

  async function processAudioQueue() {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingAudioRef.current = false
      currentAudioSourceRef.current = null
      if (!paused) {
        setAgentState("listening")
      }
      return
    }

    // Don't play audio if paused
    if (paused) {
      // Clear the queue when paused
      audioQueueRef.current = []
      isPlayingAudioRef.current = false
      currentAudioSourceRef.current = null
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

  // Centralized conversation lifecycle: Start voice conversation
  async function startVoiceConversation(sessionId: string) {
    // CRITICAL: End existing conversation first
    await endConversation()

    // Request mic permission
    const micGranted = await requestMicAccess()
    if (!micGranted) {
      // Fallback to chat mode
      await startChatConversation(sessionId)
      setMode("chat")
      alert("Voice disconnected. Switched to chat.")
      return
    }

    try {
      setAgentState("listening")
      setIsVoiceSessionActive(true)

      conversationRef.current = await ElevenLabsClient.startSession({
        agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!,
        ...({ connectionType: "websocket" } as any),
        ...(sessionId ? { sessionId } as any : {}),
        onMessage: async (message: any) => {
          console.log("Voice SDK Message:", message)
          
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
                mode: "voice",
                created_at: new Date().toISOString(),
              }
              setMessages((prev) => [...prev, tempUserMsg])

              // Save to database
              await supabase.from("messages").insert({
                session_id: sessionId,
                role: "user",
                content: userContent,
                mode: "voice",
              })
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
            }

          } else if (message.type === "agent_response" || 
                     message.type === "agent_message" ||
                     (message.source === "ai" && message.message && message.type !== "agent_audio")) {
            // Agent text response
            const agentContent = message.text || message.message || message.response || message.content || ""
            
            if (agentContent.trim()) {
              // Optimistic update
              const tempAgentMsg = {
                id: `temp-agent-${Date.now()}`,
                session_id: sessionId,
                role: "assistant",
                content: agentContent,
                mode: "voice",
                created_at: new Date().toISOString(),
              }
              setMessages((prev) => [...prev, tempAgentMsg])

              // Save to database
              await supabase.from("messages").insert({
                session_id: sessionId,
                role: "assistant",
                content: agentContent,
                mode: "voice",
              })
              setAgentState("talking")

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
            // Agent audio chunk - only play if not paused
            if (!paused) {
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
            }

          } else if (message.source === "ai" && message.message) {
            // Fallback: handle standard AI messages
            await supabase.from("messages").insert({
              session_id: sessionId,
              role: "assistant",
              content: message.message,
              mode: "voice",
            })
            setAgentState("listening")

            // Refresh messages
            const { data: refreshedMessages } = await supabase
              .from("messages")
              .select("*")
              .eq("session_id", sessionId)
              .order("created_at", { ascending: true })
            setMessages(refreshedMessages || [])
          }
        },
        onError: (error: any) => {
          console.error("Voice Conversation Error:", error)
          setIsVoiceSessionActive(false)
          setAgentState(null)
          // Allow user to restart by clicking Orb again
        }
      })

      // CRITICAL: Rehydrate conversation context after session starts
      // Small delay to ensure session is fully initialized
      await new Promise(resolve => setTimeout(resolve, 500))
      await rehydrateConversation(sessionId)
    } catch (err) {
      console.error("Failed to start voice session:", err)
      
      // Clean up on error
      await endConversation()
      
      // Fallback to chat mode
      try {
        await startChatConversation(sessionId)
        setMode("chat")
        alert("Voice disconnected. Switched to chat.")
      } catch (fallbackError) {
        console.error("Failed to fallback to chat:", fallbackError)
      }
    }
  }

  // Centralized conversation lifecycle: Start chat conversation
  async function startChatConversation(sessionId: string) {
    // CRITICAL: End existing conversation first
    await endConversation()

    try {
      conversationRef.current = await ElevenLabsClient.startSession({
        agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!,
        connectionType: "websocket" as any,
        ...(sessionId ? { sessionId } as any : {}),
        overrides: {
          conversation: {
            textOnly: true
          },
        },
        onMessage: async (message: any) => {
          console.log("SDK Message:", message)
          if (message.source === "ai" && message.message) {
            // Save assistant message to Supabase
            await supabase.from("messages").insert({
              session_id: sessionId,
              role: "assistant",
              content: message.message,
              mode: "chat",
            })

            // Refresh messages
            const { data: refreshedMessages } = await supabase
              .from("messages")
              .select("*")
              .eq("session_id", sessionId)
              .order("created_at", { ascending: true })

            setMessages(refreshedMessages || [])
          }
        },
        onError: (error: any) => {
          console.error("Chat Conversation Error:", error)
          // Connection lost - user can restart by sending a message
          conversationRef.current = null
        }
      })

      // CRITICAL: Rehydrate conversation context after session starts
      // Small delay to ensure session is fully initialized
      await new Promise(resolve => setTimeout(resolve, 500))
      await rehydrateConversation(sessionId)
    } catch (err) {
      console.error("Failed to start chat conversation:", err)
      conversationRef.current = null
      throw err // Re-throw so caller can handle
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

  // Note: Removed auto-start useEffect - conversations now start lazily on user interaction

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

      // 6. Notify User in UI (System message with summary)
      const systemMsgContent = summary
        ? `📎 File uploaded: ${file.name}\n\n📄 Summary:\n${summary}`
        : `📎 File uploaded: ${file.name}`

      const systemMsg = {
        session_id: activeSessionId,
        role: "system",
        content: systemMsgContent,
        mode: mode, // Use current mode (voice or chat)
      }

      await supabase.from("messages").insert(systemMsg)

      setMessages((prev) => [...prev, { ...systemMsg, id: `temp-sys-${Date.now()}` }])

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
      await startVoiceConversation(activeSessionId)
    }
  }

  async function handlePause() {
    const newPaused = !paused

    if (newPaused) {
      // PAUSING: Disable mic input and stop audio, but keep session alive
      if (micStreamRef.current) {
        const tracks = micStreamRef.current.getAudioTracks()
        tracks.forEach(track => {
          track.enabled = false // Disable but don't stop (keeps stream alive)
        })
      }

      // Stop audio playback
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop()
          currentAudioSourceRef.current.disconnect()
          currentAudioSourceRef.current = null
        } catch (error) {
          // Source might already be stopped
        }
      }
      audioQueueRef.current = []
      isPlayingAudioRef.current = false

      // Try to pause via SDK if method exists
      if (conversationRef.current) {
        try {
          if ((conversationRef.current as any).pause && typeof (conversationRef.current as any).pause === "function") {
            (conversationRef.current as any).pause()
          }
          // Also try mute method if pause doesn't exist
          else if ((conversationRef.current as any).mute && typeof (conversationRef.current as any).mute === "function") {
            (conversationRef.current as any).mute(true)
          }
        } catch (error) {
          console.log("SDK pause method not available")
        }
      }

      setPaused(true)
      setAgentState("thinking")

    } else {
      // UNPAUSING: Re-enable mic and resume session
      if (micStreamRef.current) {
        const tracks = micStreamRef.current.getAudioTracks()
        tracks.forEach(track => {
          track.enabled = true // Re-enable tracks
        })
      }

      // Try to unpause via SDK if method exists
      if (conversationRef.current) {
        try {
          if ((conversationRef.current as any).resume && typeof (conversationRef.current as any).resume === "function") {
            (conversationRef.current as any).resume()
          }
          else if ((conversationRef.current as any).mute && typeof (conversationRef.current as any).mute === "function") {
            (conversationRef.current as any).mute(false)
          }
        } catch (error) {
          console.log("SDK resume method not available")
        }
      }

      setPaused(false)
      setAgentState("listening")
    }
  }

  async function sendChatMessage(text: string) {
    if (!activeSessionId || isSwitching) return

    // Lazy start chat session if not active
    if (!conversationRef.current) {
      try {
        await startChatConversation(activeSessionId)
      } catch (error) {
        console.error("Failed to start chat session:", error)
        alert("Failed to start conversation. Please try again.")
        return
      }
    }

    // 1. Save user message
    await supabase.from("messages").insert({
      session_id: activeSessionId,
      role: "user",
      content: text,
      mode: "chat",
    })

    // Optimistic update
    setMessages((prev) => [...prev, { id: `temp-user-${Date.now()}`, role: "user", content: text }])

    // 2. Send to SDK
    if (conversationRef.current) {
      try {
        await (conversationRef.current as any).sendUserMessage(text)
      } catch (error) {
        console.error("Failed to send message:", error)
        // Try to restart session
        await startChatConversation(activeSessionId)
        await (conversationRef.current as any)?.sendUserMessage(text)
      }
    }
  }

  // Clean mode switch logic
  async function switchToVoice() {
    if (isSwitching || !activeSessionId) return

    setIsSwitching(true)
    try {
      await endConversation()
      await startVoiceConversation(activeSessionId)
      setMode("voice")
    } catch (error) {
      console.error("Failed to switch to voice:", error)
      // Fallback to chat on error
      try {
        await startChatConversation(activeSessionId)
        setMode("chat")
        alert("Voice unavailable. Switched to chat.")
      } catch (fallbackError) {
        console.error("Failed to fallback to chat:", fallbackError)
      }
    } finally {
      setIsSwitching(false)
    }
  }

  async function switchToChat() {
    if (isSwitching || !activeSessionId) return

    setIsSwitching(true)
    try {
      await endConversation()
      await startChatConversation(activeSessionId)
      setMode("chat")
    } catch (error) {
      console.error("Failed to switch to chat:", error)
      // At least end the conversation
      await endConversation()
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <div className="h-screen flex bg-neutral-950 text-white overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-64 bg-neutral-900 border-r border-neutral-800 p-4 flex flex-col">
          <Button variant="secondary" className="mb-3" onClick={createNewSession}>+ New Chat</Button>

          <div className="flex-1 space-y-2 text-sm overflow-y-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`p - 2 rounded cursor - pointer ${activeSessionId === session.id
                  ? "bg-neutral-800"
                  : "hover:bg-neutral-800"
                  } `}
                onClick={() => setActiveSessionId(session.id)}
              >
                {session.title || "Untitled Session"}
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            className="mt-4 text-red-400 hover:text-red-300 justify-start"
            onClick={deleteAllChats}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete All Chats
          </Button>
        </aside>
      )}

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>

          <div className="flex gap-2">
            <Button
              variant={mode === "voice" ? "default" : "secondary"}
              onClick={switchToVoice}
              disabled={isSwitching || !activeSessionId}
            >
              Voice
            </Button>
            <Button
              variant={mode === "chat" ? "default" : "secondary"}
              onClick={switchToChat}
              disabled={isSwitching || !activeSessionId}
            >
              Chat
            </Button>
          </div>

          <div className="w-10" />
        </header>

        {/* Conversation Area */}
        <div className="flex-1 flex justify-center min-h-0 overflow-hidden">
          <div className="w-full max-w-3xl h-full">
            <Conversation className="h-full">
              <ConversationContent className="p-6">
                {messages.length === 0 ? (
                  <ConversationEmptyState
                    title="No messages yet"
                    description="Start a conversation to see messages here"
                  />
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max - w - xl p - 3 rounded - lg mb - 2 ${m.role === "user"
                        ? "ml-auto text-right bg-blue-600 text-white"
                        : m.role === "assistant"
                          ? "mr-auto text-left bg-neutral-800 text-neutral-200"
                          : "mx-auto text-center text-xs text-neutral-500 bg-neutral-900/50" // System messages
                        } `}
                    >
                      {m.content}
                    </div>
                  ))
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>
        </div>

        {/* Bottom Controls */}
        {mode === "voice" ? (
          <div className="relative py-10 border-t border-neutral-800 flex justify-center items-center flex-shrink-0 bg-neutral-950">
            <div className="w-full max-w-3xl relative flex justify-center items-center">
              {/* Pause/Resume - only show if voice session is active */}
              {isVoiceSessionActive && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-4"
                  onClick={handlePause}
                  title={paused ? "Resume conversation" : "Pause conversation"}
                >
                  {paused ? <Play /> : <Pause />}
                </Button>
              )}

              {/* Orb - clickable to start voice session */}
              <div
                onClick={handleOrbClick}
                className={isSwitching ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                title={isSwitching ? "Switching..." : isVoiceSessionActive ? "" : "Click to start voice conversation"}
              >
                <Orb
                  className="w-28 h-28"
                  agentState={agentState || (isVoiceSessionActive ? "listening" : null)}
                />
              </div>

              {/* Upload */}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
              />
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-4"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className={isUploading ? "animate-pulse" : ""} />
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-neutral-800 p-4 flex justify-center flex-shrink-0 bg-neutral-950">
            <div className="w-full max-w-3xl flex gap-2 items-center">
              <input
                placeholder="Type a message"
                className="flex-1 bg-neutral-900 rounded px-4 py-2 outline-none"
                disabled={isSwitching}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSwitching) {
                    sendChatMessage(e.currentTarget.value)
                    e.currentTarget.value = ""
                  }
                }}
              />
              <Button variant="secondary" size="icon" disabled={isSwitching}>
                <Mic />
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
              />
              <Button
                variant="secondary"
                size="icon"
                disabled={isUploading || isSwitching}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className={isUploading ? "animate-pulse" : ""} />
              </Button>
              <Button 
                onClick={() => {
                  const input = document.querySelector("input[placeholder='Type a message']") as HTMLInputElement
                  if (input && !isSwitching) {
                    sendChatMessage(input.value)
                    input.value = ""
                  }
                }}
                disabled={isSwitching}
              >
                <Send className="mr-2 h-4 w-4" /> Send
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
