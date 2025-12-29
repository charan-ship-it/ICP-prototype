"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ChatHeader from "@/components/ChatHeader";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import VoicePanel from "@/components/VoicePanel";
import ChatInput from "@/components/ChatInput";
import { getOrCreateSessionId } from "@/lib/session";
import { ChatListItem, MessageDisplay } from "@/types/chat";
import { ICPData, calculateProgress } from "@/types/icp";
import { analyzeMessageForICP, updateSectionCompletion } from "@/lib/icp-analyzer";
import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import { voiceLogger } from "@/lib/voiceLogger";

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>();
  const [messages, setMessages] = useState<MessageDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [icpData, setIcpData] = useState<ICPData | null>(null);
  const [progress, setProgress] = useState(0);
  const [streamingAIContent, setStreamingAIContent] = useState<string>('');
  const currentAbortControllerRef = useRef<AbortController | null>(null);
  const handleSendMessageRef = useRef<((content: string) => Promise<void>) | null>(null);
  const conversationChatIdRef = useRef<string | null>(null); // Stable chatId for voice conversation
  const conversationIdRef = useRef<string | null>(null); // Unique ID for this conversation session

  // Initialize voice hook (will use handleSendMessageRef)
  const voiceHook = useElevenLabsVoice({
    sessionId,
    onTranscriptComplete: async (text) => {
      voiceLogger.log('STT', 'Transcript complete callback received', { 
        conversationId: conversationIdRef.current, 
        chatId: conversationChatIdRef.current,
        text: text ? text.substring(0, 50) + (text.length > 50 ? '...' : '') : 'empty',
        textLength: text?.length || 0,
        hasHandleSendMessage: !!handleSendMessageRef.current
      });
      console.log('[app/page.tsx] Voice transcript received:', text);
      
      if (text && text.trim() && handleSendMessageRef.current) {
        voiceLogger.log('STT', 'Calling handleSendMessage', { 
          conversationId: conversationIdRef.current, 
          chatId: conversationChatIdRef.current 
        });
        await handleSendMessageRef.current(text.trim());
      } else {
        voiceLogger.log('STT', 'Skipping handleSendMessage', { 
          conversationId: conversationIdRef.current, 
          chatId: conversationChatIdRef.current,
          reason: !text ? 'no text' : !text.trim() ? 'empty text' : !handleSendMessageRef.current ? 'no handler' : 'unknown'
        });
      }
    },
    onTextSpoken: (spokenText) => {
      // CRITICAL: Update message display with text that's being spoken
      // This synchronizes text display with audio playback
      // Note: We don't check voiceHook.isActive here because this callback
      // is only called when voice is active (from the voice hook itself)
      setStreamingAIContent(spokenText);
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          return prev.map((msg, idx) => 
            idx === prev.length - 1 ? { ...msg, content: spokenText } : msg
          );
        }
        return prev;
      });
    },
    onBargeIn: () => {
      console.log('[app/page.tsx] Barge-in detected, aborting OpenAI stream');
      if (currentAbortControllerRef.current) {
        currentAbortControllerRef.current.abort();
        currentAbortControllerRef.current = null;
      }
    },
    onError: (error) => {
      console.error('[app/page.tsx] Voice hook error:', error);
    },
  });

  // Initialize session on mount
  useEffect(() => {
    getOrCreateSessionId()
      .then((id) => {
        setSessionId(id);
        console.log('Session initialized:', id);
        // Load chats after session is initialized
        loadChats(id);
      })
      .catch((error) => {
        console.error('Failed to initialize session:', error);
      });
  }, []);

  // Load chats for the session
  const loadChats = async (sid: string) => {
    if (!sid) return;
    
    setIsLoadingChats(true);
    try {
      const response = await fetch(`/api/chats?session_id=${sid}`);
      if (!response.ok) throw new Error('Failed to load chats');
      
      const data = await response.json();
      // Convert timestamp strings to Date objects
      const chatsWithDates = data.map((chat: any) => ({
        ...chat,
        timestamp: chat.timestamp ? new Date(chat.timestamp) : undefined,
      }));
      setChats(chatsWithDates);
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setIsLoadingChats(false);
    }
  };

  // Create a new chat
  const handleNewChat = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) throw new Error('Failed to create chat');

      const newChat = await response.json();
      setSelectedChatId(newChat.id);
      setMessages([]);
      setIcpData(null);
      setProgress(0);
      
      // Add new chat to list immediately (with Date conversion)
      setChats((prev) => [
        {
          id: newChat.id,
          title: newChat.title,
          timestamp: newChat.timestamp ? new Date(newChat.timestamp) : undefined,
        },
        ...prev,
      ]);
      
      // Reload chats list to ensure consistency
      loadChats(sessionId);
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  // Load ICP data for a chat
  const loadICPData = async (chatId: string) => {
    try {
      const response = await fetch(`/api/chats/${chatId}/icp`);
      if (response.ok) {
        const data = await response.json();
        setIcpData(data);
        setProgress(calculateProgress(data));
      } else {
        // No ICP data yet, that's fine
        setIcpData(null);
        setProgress(0);
      }
    } catch (error) {
      console.error('Error loading ICP data:', error);
      setIcpData(null);
      setProgress(0);
    }
  };

  // Select a chat and load its messages and ICP data
  const handleSelectChat = async (chatId: string) => {
    setSelectedChatId(chatId);
    setIsLoading(true);

    try {
      const [messagesResponse, icpResponse] = await Promise.all([
        fetch(`/api/chats/${chatId}/messages`),
        fetch(`/api/chats/${chatId}/icp`),
      ]);

      if (!messagesResponse.ok) {
        const errorData = await messagesResponse.json().catch(() => ({}));
        console.error('Failed to load messages:', errorData);
        throw new Error(errorData.error || 'Failed to load messages');
      }

      const messagesData = await messagesResponse.json();
      // Convert timestamp strings to Date objects
      const messagesWithDates = messagesData.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined,
      }));
      setMessages(messagesWithDates);

      // Load ICP data
      if (icpResponse.ok) {
        const icpData = await icpResponse.json();
        setIcpData(icpData);
        setProgress(calculateProgress(icpData));
      } else {
        setIcpData(null);
        setProgress(0);
      }
    } catch (error) {
      console.error('Error loading chat:', error);
      setMessages([]);
      setIcpData(null);
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a chat
  const handleDeleteChat = async (chatId: string) => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete chat');

      // If deleted chat was selected, clear selection
      if (selectedChatId === chatId) {
        setSelectedChatId(undefined);
        setMessages([]);
      }

      // Reload chats list
      loadChats(sessionId);
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const handleSendMessage = useCallback(async (content: string) => {
    // Generate conversationId if not set (for logging)
    if (!conversationIdRef.current) {
      conversationIdRef.current = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      voiceLogger.setConversationContext(conversationIdRef.current, conversationChatIdRef.current);
    }

    // Prioritize conversationChatIdRef for voice conversations, fallback to selectedChatId
    let chatId = conversationChatIdRef.current || selectedChatId;
    let isNewChat = false;
    
    if (!chatId) {
      if (!sessionId) {
        voiceLogger.error('ChatId', 'No sessionId available', { conversationId: conversationIdRef.current });
        return;
      }
      
      try {
        voiceLogger.log('ChatId', 'Creating new chat', { conversationId: conversationIdRef.current });
        const response = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });

        if (!response.ok) throw new Error('Failed to create chat');
        const newChat = await response.json();
        chatId = newChat.id;
        
        // Set both ref (for voice conversation stability) and state (for UI)
        conversationChatIdRef.current = chatId || null;
        setSelectedChatId(chatId);
        voiceLogger.setChatId(chatId || null);
        voiceLogger.log('ChatId', `Using chatId: ${chatId}`, { conversationId: conversationIdRef.current, isNew: true });
        
        isNewChat = true;
        // Clear messages for new chat
        setMessages([]);
        loadChats(sessionId);
      } catch (error) {
        voiceLogger.error('ChatId', error instanceof Error ? error : new Error(String(error)), { conversationId: conversationIdRef.current });
        console.error('Error creating chat:', error);
        return;
      }
    } else {
      // Log existing chatId usage
      voiceLogger.log('ChatId', `Using chatId: ${chatId}`, { conversationId: conversationIdRef.current, isNew: false });
    }

    // Save user message
    try {
      const userResponse = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content }),
      });

      if (!userResponse.ok) {
        const errorData = await userResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to save message:', errorData);
        const errorMessage = errorData.error || errorData.details || 'Failed to save message';
        throw new Error(errorMessage);
      }
      
      const userMessage = await userResponse.json();
      
      // Convert timestamp to Date object
      const userMessageWithDate = {
        id: userMessage.id,
        role: userMessage.role,
        content: userMessage.content,
        timestamp: userMessage.timestamp ? new Date(userMessage.timestamp) : new Date(),
      };
      
      setMessages((prev) => [...prev, userMessageWithDate]);

      // Analyze message for ICP data and update
      try {
        const detectedICP = analyzeMessageForICP(content, 'user');
        console.log('Detected ICP data from user message:', detectedICP);
        
        // Always update ICP data, even if nothing detected (to ensure it exists and recalculate progress)
        const currentICP = icpData || { chat_id: chatId };
        const updatedICP = {
          ...currentICP,
          ...detectedICP,
        };
        
        // Update section completion
        const completedICP = updateSectionCompletion(updatedICP as ICPData);
        console.log('Updated ICP data with completion:', completedICP);
        
        // Save to database
        const icpResponse = await fetch(`/api/chats/${chatId}/icp`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(completedICP),
        });
        
        if (icpResponse.ok) {
          const savedICP = await icpResponse.json();
          console.log('Saved ICP data:', savedICP);
          const newProgress = calculateProgress(savedICP);
          console.log('Calculated progress:', newProgress, '%');
          setIcpData(savedICP);
          setProgress(newProgress);
        } else {
          // Only log error if it's not a 404 (which is expected for new chats)
          if (icpResponse.status !== 404) {
            try {
              const errorData = await icpResponse.json();
              console.error('Failed to save ICP data:', errorData);
              if (icpResponse.status === 500) {
                console.warn('ICP data table might not exist. Please run migration 003_create_icp_data_table.sql');
              }
            } catch (e) {
              // Response might not be JSON, ignore
              console.warn('ICP data save failed with status:', icpResponse.status);
            }
          }
        }
      } catch (error) {
        console.error('Error updating ICP data:', error);
        // Don't fail the message send if ICP update fails
      }

      // Update chat title if this is the first message (title is still "New Chat")
      const currentChat = chats.find(c => c.id === chatId);
      if (currentChat?.title === 'New Chat') {
        // Use first 50 characters of message as title
        const newTitle = content.length > 50 ? content.substring(0, 50) + '...' : content;
        try {
          await fetch(`/api/chats/${chatId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle }),
          });
        } catch (error) {
          console.error('Error updating chat title:', error);
        }
      }

      // Reload chats to update last message and title
      if (sessionId) loadChats(sessionId);
    } catch (error) {
      console.error('Error sending message:', error);
      return;
    }

    setIsLoading(true);

    // Create abort controller for barge-in support
    const abortController = new AbortController();
    currentAbortControllerRef.current = abortController;
    
    // Set abort controller in voice hook immediately for barge-in support
    voiceHook.setOpenAIAbortController(abortController);
    
    // Track OpenAI timing (must be in scope for stream completion)
    const openaiStartTime = Date.now();
    voiceLogger.log('OpenAI', 'Starting stream', { 
      conversationId: conversationIdRef.current, 
      chatId 
    });
    
    // Call AI API with streaming
    try {
      const aiResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
        signal: abortController.signal,
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json().catch(() => ({}));
        console.error('AI API error:', errorData);
        throw new Error(errorData.error || 'Failed to get AI response');
      }

      // Handle streaming response
      const reader = aiResponse.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let messageId = `temp-${Date.now()}`;
      let firstTokenReceived = false;
      const firstTokenTime = Date.now();

      // Create initial streaming message
      const streamingMessage: MessageDisplay = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, streamingMessage]);

      // Read stream
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Check if aborted (barge-in)
          if (abortController.signal.aborted) {
            console.log('[OpenAI Stream] Aborted due to barge-in');
            break;
          }

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.done && data.message) {
                  // Final message from server
                  const finalMessage = {
                    id: data.message.id,
                    role: data.message.role,
                    content: data.message.content,
                    timestamp: new Date(data.message.created_at),
                  };
                  setMessages((prev) => 
                    prev.map(msg => msg.id === messageId ? finalMessage : msg)
                  );
                  setStreamingAIContent(''); // Clear streaming content when done
                  
                  // Log timing metrics (openaiStartTime is defined before fetch)
                  const totalDuration = Date.now() - openaiStartTime;
                  voiceLogger.timing('Total LLM duration', totalDuration, { 
                    conversationId: conversationIdRef.current, 
                    chatId 
                  });
                  
                  voiceLogger.log('OpenAI', 'Stream complete, flushing TTS', { 
                    conversationId: conversationIdRef.current, 
                    chatId 
                  });
                  
                  // Flush remaining TTS buffer
                  voiceHook.flushTTS();
                  
                  // Analyze AI response for ICP data
                  try {
                    const detectedICP = analyzeMessageForICP(data.message.content, 'assistant');
                    if (Object.keys(detectedICP).length > 0) {
                      const currentICP = icpData || { chat_id: chatId };
                      const updatedICP = {
                        ...currentICP,
                        ...detectedICP,
                      };
                      const completedICP = updateSectionCompletion(updatedICP as ICPData);
                      
                      const icpResponse = await fetch(`/api/chats/${chatId}/icp`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(completedICP),
                      });
                      
                      if (icpResponse.ok) {
                        const savedICP = await icpResponse.json();
                        setIcpData(savedICP);
                        setProgress(calculateProgress(savedICP));
                      }
                    }
                  } catch (error) {
                    console.error('Error extracting ICP from AI response:', error);
                  }
                  
                  // Reload ICP data and chats
                  if (chatId) {
                    await loadICPData(chatId);
                  }
                  if (sessionId) loadChats(sessionId);
                } else if (data.content) {
                  // Streaming content chunk
                  if (!firstTokenReceived) {
                    firstTokenReceived = true;
                    const timeToFirstToken = Date.now() - firstTokenTime;
                    voiceLogger.timing('OpenAI time-to-first-token', timeToFirstToken, { 
                      conversationId: conversationIdRef.current, 
                      chatId 
                    });
                    voiceLogger.log('OpenAI', 'First token received', { 
                      chatId, 
                      conversationId: conversationIdRef.current, 
                      timeToFirstToken 
                    });
                    
                    // CRITICAL FIX: Prepare TTS immediately when first token arrives
                    // This ensures TTS starts speaking in parallel with OpenAI streaming
                    if (voiceHook.isActive && voiceHook.prepareTTS) {
                      voiceHook.prepareTTS();
                    }
                  }
                  
                  fullContent += data.content;
                  
                  // CRITICAL: In voice mode, don't update message display immediately
                  // Let onTextSpoken callback handle it (synchronized with audio)
                  if (!voiceHook.isActive) {
                    setStreamingAIContent(fullContent); // Update streaming content for UI
                    setMessages((prev) =>
                      prev.map(msg =>
                        msg.id === messageId
                          ? { ...msg, content: fullContent }
                          : msg
                      )
                    );
                  }
                  
                  // Stream to TTS immediately (will buffer but start speaking quickly)
                  if (voiceHook.isActive) {
                    voiceHook.streamToTTS(data.content);
                  }
                } else if (data.error) {
                  throw new Error(data.error);
                }
              } catch (e) {
                // Skip invalid JSON or parsing errors
                console.error('Error parsing stream data:', e);
              }
            }
          }
        }
      }

      // Note: ICP analysis is already handled in the streaming handler above
      // when data.done is true and data.message is received

      // Reload ICP data to get updated progress
      if (chatId) {
        await loadICPData(chatId);
      }

      // Reload chats to update last message
      if (sessionId) loadChats(sessionId);
    } catch (error: any) {
      // Check if error is due to abort (barge-in)
      if (error.name === 'AbortError') {
        voiceLogger.log('OpenAI', 'Stream aborted due to barge-in', { 
          conversationId: conversationIdRef.current, 
          chatId 
        });
        // Don't show error message for intentional abort
        return;
      }
      
      voiceLogger.error('OpenAI', error instanceof Error ? error : new Error(String(error)), { 
        conversationId: conversationIdRef.current, 
        chatId 
      });
      console.error('Error getting AI response:', error);
      // Show error message to user
      const errorMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant' as const,
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      currentAbortControllerRef.current = null; // Clear abort controller
      voiceHook.setOpenAIAbortController(null); // Clear in voice hook
    }
  }, [sessionId, selectedChatId, chats, icpData, voiceHook, loadChats, loadICPData]);

  // Store handleSendMessage in ref for voice hook
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Wrapper for startConversation to set conversation context
  const handleStartConversation = useCallback(async () => {
    // Generate conversationId when conversation starts (not on first message)
    if (!conversationIdRef.current) {
      conversationIdRef.current = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      voiceLogger.setConversationContext(conversationIdRef.current, conversationChatIdRef.current);
      voiceLogger.log('Conversation', 'Starting', { 
        conversationId: conversationIdRef.current, 
        chatId: conversationChatIdRef.current 
      });
    }
    
    // Call voice hook's startConversation
    await voiceHook.startConversation();
  }, [voiceHook]);

  // Wrapper for endConversation to clear conversation context
  const handleEndConversation = useCallback(async () => {
    voiceLogger.log('Conversation', 'Ending conversation', { 
      conversationId: conversationIdRef.current, 
      chatId: conversationChatIdRef.current 
    });
    
    // CRITICAL FIX: Only clear conversationId, NOT chatId
    // This preserves the chat across pause/resume cycles
    // Only clear chatId if user explicitly wants a new conversation
    conversationIdRef.current = null;
    // DO NOT clear conversationChatIdRef.current here - preserve chat across pause/resume
    voiceLogger.clearContext();
    
    // Call voice hook's endConversation
    voiceHook.endConversation();
  }, [voiceHook]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {isSidebarOpen && (
          <Sidebar
            isSidebarOpen={isSidebarOpen}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            chats={chats}
            onNewChat={handleNewChat}
            onSelectChat={handleSelectChat}
            onDeleteChat={handleDeleteChat}
            selectedChatId={selectedChatId}
          />
        )}

        {/* Center Chat Area */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <ChatHeader
            isSidebarOpen={isSidebarOpen}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            progress={progress}
          />
          <ChatArea 
            messages={messages} 
            isLoading={isLoading}
            voiceState={voiceHook.state}
            isVoiceActive={voiceHook.isActive}
            voiceTranscript={voiceHook.transcript}
            voiceLiveTranscript={voiceHook.liveTranscript}
          />
          <ChatInput onSend={handleSendMessage} disabled={isLoading || voiceHook.isActive} voiceActive={voiceHook.isActive} />
        </div>

        {/* Right Voice Panel - Hidden on small screens */}
        <div className="hidden lg:block">
          <VoicePanel 
            sessionId={sessionId}
            streamingAIContent={streamingAIContent}
            isAILoading={isLoading}
            voiceState={voiceHook.state}
            isConversationActive={voiceHook.isActive}
            transcript={voiceHook.transcript}
            liveTranscript={voiceHook.liveTranscript}
            startConversation={handleStartConversation}
            endConversation={handleEndConversation}
            pauseConversation={voiceHook.pauseConversation}
            resumeConversation={voiceHook.resumeConversation}
            detectSpeechStart={voiceHook.detectSpeechStart}
            detectSpeechEnd={voiceHook.detectSpeechEnd}
            handlePauseDuringSpeech={voiceHook.handlePauseDuringSpeech}
            getStreamRef={voiceHook.getStreamRef}
          />
        </div>
      </div>
    </div>
  );
}

