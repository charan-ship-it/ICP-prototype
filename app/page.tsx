"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ChatHeader from "@/components/ChatHeader";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import VoicePanel from "@/components/VoicePanel";
import ChatInput from "@/components/ChatInput";
import ICPDocumentViewer from "@/components/ICPDocumentViewer";
import ICPConfirmationCard from "@/components/ICPConfirmationCard";
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
  const [confirmedSections, setConfirmedSections] = useState<Set<string>>(new Set());
  const [generatedDocument, setGeneratedDocument] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingICPData, setPendingICPData] = useState<ICPData | null>(null);
  const [showICPCards, setShowICPCards] = useState(false);
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
      // CRITICAL FIX: Only update messages if voice is actually active
      // This prevents unnecessary updates when voice mode is off
      if (!voiceHook.isActive) {
        return; // Don't update if voice not active
      }
      
      // CRITICAL: Update message display with text that's being spoken
      // This synchronizes text display with audio playback
      try {
        setStreamingAIContent(spokenText);
        setMessages((prev) => {
          // Find the most recent assistant message (streaming message)
          // Search from the end to find the last assistant message
          let lastAssistantIndex = -1;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === 'assistant') {
              lastAssistantIndex = i;
              break;
            }
          }
          
          if (lastAssistantIndex >= 0) {
            // Update existing assistant message
            const updated = [...prev];
            updated[lastAssistantIndex] = { ...updated[lastAssistantIndex], content: spokenText };
            return updated;
          }
          
          // If no assistant message exists, create one
          // This can happen if TTS starts before OpenAI stream creates the message
          console.log('[onTextSpoken] No assistant message found, creating one with text length:', spokenText.length);
          return [...prev, {
            id: `spoken-${Date.now()}`,
            role: 'assistant' as const,
            content: spokenText,
            timestamp: new Date(),
          }];
        });
      } catch (error) {
        console.error('[onTextSpoken] Error updating message:', error);
      }
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

    // CRITICAL FIX: If voice is active, end it before creating new chat
    // This prevents conflicts between voice and new chat
    if (voiceHook.isActive) {
      console.log('[handleNewChat] Voice active - ending voice mode before creating new chat');
      await voiceHook.endConversation();
      conversationChatIdRef.current = null;
      conversationIdRef.current = null;
    }

    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) throw new Error('Failed to create chat');

      const newChat = await response.json();
      setSelectedChatId(newChat.id);
      // CRITICAL FIX: Sync conversationChatIdRef for new chat
      conversationChatIdRef.current = newChat.id;
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
        console.log('[Load ICP Data] Loaded:', {
          company_basics_complete: data.company_basics_complete,
          target_customer_complete: data.target_customer_complete,
          problem_pain_complete: data.problem_pain_complete,
          buying_process_complete: data.buying_process_complete,
          budget_decision_complete: data.budget_decision_complete,
        });
        setIcpData(data);
        const progress = calculateProgress(data);
        console.log('[Load ICP Data] Progress:', progress);
        setProgress(progress);
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
    // CRITICAL FIX: If voice is active, end it before switching chats
    // This prevents messages going to wrong chats
    if (voiceHook.isActive) {
      console.log('[handleSelectChat] Voice active - ending voice mode before switching chats');
      await voiceHook.endConversation();
      // Clear voice conversation refs since we're switching to a different chat
      conversationChatIdRef.current = null;
      conversationIdRef.current = null;
    }
    
    setSelectedChatId(chatId);
    // CRITICAL FIX: Sync conversationChatIdRef when voice is NOT active
    // This ensures both systems use the same chatId
    if (!voiceHook.isActive) {
      conversationChatIdRef.current = chatId;
    }
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
      const messagesWithDates: MessageDisplay[] = messagesData.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined,
        fileAttachment: msg.file_attachment ? JSON.parse(msg.file_attachment) : undefined,
        icpExtraction: msg.icp_extraction ? JSON.parse(msg.icp_extraction) : undefined,
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

  const handleSendMessage = useCallback(async (content: string, file?: File) => {
    console.log('[handleSendMessage] Called with:', {
      contentLength: content?.length,
      hasFile: !!file,
      sessionId,
      selectedChatId,
      voiceActive: voiceHook.isActive,
    });
    
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

    // Process file if attached
    let finalContent = content;
    let fileAttachment: { name: string; size: number; type: string } | undefined;
    let icpExtraction: { summary: string; extractedFields: any; filledSections: string[] } | undefined;
    
    if (file) {
      try {
        console.log('Processing file:', file.name);
        
        if (file.type === 'application/pdf') {
          // Process PDF: extract text, parse ICP fields, auto-fill ICP data
          if (!chatId) {
            throw new Error('ChatId is required for file processing');
          }
          const formData = new FormData();
          formData.append('file', file);
          formData.append('chatId', chatId);
          
          const processResponse = await fetch('/api/files/process-pdf', {
            method: 'POST',
            body: formData,
          });
          
          if (!processResponse.ok) {
            const errorData = await processResponse.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || 'Failed to process PDF');
          }
          
          const processData = await processResponse.json();
          icpExtraction = {
            summary: processData.summary,
            extractedFields: processData.extractedFields,
            filledSections: processData.filledSections,
          };
          
          // Update ICP data in state
          if (processData.icpData) {
            console.log('[PDF Processing] Updated ICP data:', processData.icpData);
            
            // Store as pending data for user to confirm via cards
            setPendingICPData(processData.icpData);
            setShowICPCards(true);
            
            // Also update current ICP data for progress calculation
            setIcpData(processData.icpData);
            const newProgress = calculateProgress(processData.icpData);
            console.log('[PDF Processing] New progress:', newProgress);
            setProgress(newProgress);
          }
          
          // Store extracted text for AI context (don't show to user)
          if (processData.extractedText) {
            finalContent = content 
              ? `${content}\n\n[Document content from ${file.name}]:\n${processData.extractedText}`
              : `[Document content from ${file.name}]:\n${processData.extractedText}`;
          }
        } else {
          // For text files, just read content (no ICP extraction)
          const reader = new FileReader();
          const fileContent = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => {
              try {
                const text = e.target?.result as string;
                const maxLength = 50000;
                const truncated = text.length > maxLength 
                  ? text.substring(0, maxLength) + '\n\n... (file truncated - too large)'
                  : text;
                resolve(truncated);
              } catch (error) {
                reject(error);
              }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });
          
          // For text files, include content in message
          finalContent = content 
            ? `${content}\n\n[File: ${file.name}]\n\n${fileContent}`
            : `[File: ${file.name}]\n\n${fileContent}`;
        }
        
        // Store file attachment info
        fileAttachment = {
          name: file.name,
          size: file.size,
          type: file.type,
        };
      } catch (error) {
        console.error('Error processing file:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to process file';
        finalContent = content 
          ? `${content}\n\n[Error processing file: ${errorMessage}]`
          : `[Error processing file: ${errorMessage}]`;
      }
    }

    // Save user message
    // For PDFs, finalContent now includes the extracted text for AI context
    // For text files, finalContent includes the file content
    const messageContent = finalContent || content || '[File attachment]';
    
    try {
      const userResponse = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          role: 'user', 
          content: messageContent,
        }),
      });

      if (!userResponse.ok) {
        let errorData: any = {};
        try {
          const text = await userResponse.text();
          if (text) {
            errorData = JSON.parse(text);
          }
        } catch (e) {
          // Response might not be JSON
          console.warn('Error response is not JSON:', e);
        }
        
        console.error('Failed to save message:', {
          status: userResponse.status,
          statusText: userResponse.statusText,
          errorData,
          chatId,
        });
        
        const errorMessage = errorData?.error || errorData?.details || errorData?.message || `Failed to save message (${userResponse.status})`;
        throw new Error(errorMessage);
      }
      
      const userMessage = await userResponse.json();
      
      // Convert timestamp to Date object
      const userMessageWithDate: MessageDisplay = {
        id: userMessage.id,
        role: userMessage.role,
        content: fileAttachment ? `[File: ${fileAttachment.name}]` : userMessage.content,
        timestamp: userMessage.timestamp ? new Date(userMessage.timestamp) : new Date(),
        fileAttachment,
        icpExtraction,
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
    
    // If we have ICP extraction from PDF, modify the system prompt or add context
    // The AI will use the summary we generated
    let aiPromptContext = '';
    if (icpExtraction && icpExtraction.summary) {
      // The backend already processed the PDF and filled ICP data
      // We'll let the AI know about this in the conversation
      aiPromptContext = icpExtraction.summary;
    }
    
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
      // If we have ICP extraction, start with the summary
      const initialContent = icpExtraction?.summary || '';
      const streamingMessage: MessageDisplay = {
        id: messageId,
        role: 'assistant',
        content: initialContent,
        timestamp: new Date(),
        icpExtraction: icpExtraction,
      };
      setMessages((prev) => [...prev, streamingMessage]);
      
      // If we have a summary, also update streaming content
      if (initialContent) {
        setStreamingAIContent(initialContent);
      }

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
                  // If we have ICP extraction, combine summary with AI response
                  const aiResponseContent = data.message.content;
                  const finalContent = icpExtraction?.summary 
                    ? `${icpExtraction.summary}\n\n${aiResponseContent}`
                    : aiResponseContent;
                  
                  const finalMessage: MessageDisplay = {
                    id: data.message.id,
                    role: data.message.role,
                    content: finalContent,
                    timestamp: new Date(data.message.created_at),
                    icpExtraction: icpExtraction,
                  };
                  setMessages((prev) => 
                    prev.map(msg => msg.id === messageId ? finalMessage : msg)
                  );
                  setStreamingAIContent(''); // Clear streaming content when done
                  
                  // If we have ICP extraction from PDF, show confirmation cards
                  // This will be handled in ChatArea component
                  
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
                        console.log('[ICP Update] Saved ICP data:', {
                          company_basics_complete: savedICP.company_basics_complete,
                          target_customer_complete: savedICP.target_customer_complete,
                          problem_pain_complete: savedICP.problem_pain_complete,
                          buying_process_complete: savedICP.buying_process_complete,
                          budget_decision_complete: savedICP.budget_decision_complete,
                        });
                        setIcpData(savedICP);
                        const newProgress = calculateProgress(savedICP);
                        console.log('[ICP Update] New progress:', newProgress);
                        setProgress(newProgress);
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
                  
                  // Combine summary with streaming content if we have ICP extraction
                  const displayContent = icpExtraction?.summary 
                    ? `${icpExtraction.summary}\n\n${fullContent}`
                    : fullContent;
                  
                  // CRITICAL: In voice mode, don't update message display immediately
                  // Let onTextSpoken callback handle it (synchronized with audio)
                  if (!voiceHook.isActive) {
                    setStreamingAIContent(displayContent); // Update streaming content for UI
                    setMessages((prev) =>
                      prev.map(msg =>
                        msg.id === messageId
                          ? { ...msg, content: displayContent, icpExtraction: icpExtraction }
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

  // Handle ICP section confirmation
  const handleConfirmSection = useCallback(async (section: string) => {
    if (!selectedChatId || !pendingICPData) return;
    
    try {
      // Update the database with the confirmed section data
      const response = await fetch(`/api/chats/${selectedChatId}/icp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingICPData),
      });
      
      if (response.ok) {
        const updatedData = await response.json();
        setIcpData(updatedData);
        setProgress(calculateProgress(updatedData));
        
        // Mark section as confirmed
        setConfirmedSections((prev) => new Set(prev).add(section));
        
        console.log(`[ICP Confirmation] Section "${section}" confirmed and saved`);
      }
    } catch (error) {
      console.error('Error confirming ICP section:', error);
    }
  }, [selectedChatId, pendingICPData]);

  // Handle ICP field edit
  const handleEditField = useCallback((field: keyof ICPData, value: string) => {
    if (!pendingICPData) return;
    
    setPendingICPData((prev) => {
      if (!prev) return null;
      return { ...prev, [field]: value };
    });
  }, [pendingICPData]);

  // Handle confirming all sections at once
  const handleConfirmAllSections = useCallback(async () => {
    if (!selectedChatId || !pendingICPData) return;
    
    try {
      const response = await fetch(`/api/chats/${selectedChatId}/icp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingICPData),
      });
      
      if (response.ok) {
        const updatedData = await response.json();
        setIcpData(updatedData);
        setProgress(calculateProgress(updatedData));
        
        // Hide cards after confirmation
        setShowICPCards(false);
        setPendingICPData(null);
        
        console.log('[ICP Confirmation] All sections confirmed and saved');
        
        // Reload ICP data to ensure state is fresh
        await loadICPData(selectedChatId);
      }
    } catch (error) {
      console.error('Error confirming all ICP sections:', error);
    }
  }, [selectedChatId, pendingICPData, loadICPData]);

  // Generate ICP document
  const handleGenerateDocument = useCallback(async () => {
    if (!selectedChatId || isGenerating) return;
    
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/chats/${selectedChatId}/generate-document`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate document');
      }
      
      const data = await response.json();
      setGeneratedDocument(data.document);
    } catch (error) {
      console.error('Error generating document:', error);
      alert('Failed to generate document. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedChatId, isGenerating]);

  // Check if ICP is complete
  const isICPComplete = icpData?.company_basics_complete && 
                        icpData?.target_customer_complete && 
                        icpData?.problem_pain_complete && 
                        icpData?.buying_process_complete && 
                        icpData?.budget_decision_complete;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Document Viewer Modal */}
      {generatedDocument && (
        <ICPDocumentViewer
          document={generatedDocument}
          chatId={selectedChatId || ''}
          onClose={() => setGeneratedDocument(null)}
        />
      )}
      
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
          />
          {/* ICP Confirmation Cards */}
          {showICPCards && pendingICPData && (
            <div className="px-4 py-3 border-t border-border bg-muted/20 max-h-[400px] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Review Extracted ICP Data</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmAllSections}
                    className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors font-medium"
                  >
                    Confirm All
                  </button>
                  <button
                    onClick={() => setShowICPCards(false)}
                    className="px-3 py-1.5 text-xs bg-muted text-foreground rounded hover:bg-muted/80 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {/* Company Basics */}
                {(pendingICPData.company_name || pendingICPData.industry || pendingICPData.company_size || pendingICPData.location) && (
                  <ICPConfirmationCard
                    section="Company Basics"
                    fields={[
                      { key: 'company_name', label: 'Company Name', value: pendingICPData.company_name },
                      { key: 'industry', label: 'Industry', value: pendingICPData.industry },
                      { key: 'company_size', label: 'Company Size', value: pendingICPData.company_size },
                      { key: 'location', label: 'Location', value: pendingICPData.location },
                    ]}
                    onConfirm={() => handleConfirmSection('company_basics')}
                    onEdit={handleEditField}
                  />
                )}
                
                {/* Target Customer */}
                {(pendingICPData.target_customer_type || pendingICPData.target_demographics || pendingICPData.target_psychographics) && (
                  <ICPConfirmationCard
                    section="Target Customer"
                    fields={[
                      { key: 'target_customer_type', label: 'Customer Type', value: pendingICPData.target_customer_type },
                      { key: 'target_demographics', label: 'Demographics', value: pendingICPData.target_demographics },
                      { key: 'target_psychographics', label: 'Psychographics', value: pendingICPData.target_psychographics },
                    ]}
                    onConfirm={() => handleConfirmSection('target_customer')}
                    onEdit={handleEditField}
                  />
                )}
                
                {/* Problem & Pain */}
                {(pendingICPData.pain_points || pendingICPData.main_problems || pendingICPData.current_solutions) && (
                  <ICPConfirmationCard
                    section="Problem & Pain"
                    fields={[
                      { key: 'pain_points', label: 'Pain Points', value: pendingICPData.pain_points },
                      { key: 'main_problems', label: 'Main Problems', value: pendingICPData.main_problems },
                      { key: 'current_solutions', label: 'Current Solutions', value: pendingICPData.current_solutions },
                    ]}
                    onConfirm={() => handleConfirmSection('problem_pain')}
                    onEdit={handleEditField}
                  />
                )}
                
                {/* Buying Process */}
                {(pendingICPData.decision_makers || pendingICPData.buying_process_steps || pendingICPData.evaluation_criteria) && (
                  <ICPConfirmationCard
                    section="Buying Process"
                    fields={[
                      { key: 'decision_makers', label: 'Decision Makers', value: pendingICPData.decision_makers },
                      { key: 'buying_process_steps', label: 'Process Steps', value: pendingICPData.buying_process_steps },
                      { key: 'evaluation_criteria', label: 'Evaluation Criteria', value: pendingICPData.evaluation_criteria },
                    ]}
                    onConfirm={() => handleConfirmSection('buying_process')}
                    onEdit={handleEditField}
                  />
                )}
                
                {/* Budget & Decision Maker */}
                {(pendingICPData.budget_range || pendingICPData.decision_maker_role || pendingICPData.approval_process) && (
                  <ICPConfirmationCard
                    section="Budget & Decision Maker"
                    fields={[
                      { key: 'budget_range', label: 'Budget Range', value: pendingICPData.budget_range },
                      { key: 'decision_maker_role', label: 'Decision Maker Role', value: pendingICPData.decision_maker_role },
                      { key: 'approval_process', label: 'Approval Process', value: pendingICPData.approval_process },
                    ]}
                    onConfirm={() => handleConfirmSection('budget_decision')}
                    onEdit={handleEditField}
                  />
                )}
              </div>
            </div>
          )}
          
          {/* Generate Document Button */}
          {isICPComplete && !isLoading && (
            <div className="px-4 py-2 border-t border-border bg-muted/30">
              <button
                onClick={handleGenerateDocument}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium"
              >
                {isGenerating ? (
                  <>
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Generating ICP Document...
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate ICP Document
                  </>
                )}
              </button>
            </div>
          )}
          
          <ChatInput 
            onSend={handleSendMessage} 
            disabled={isLoading || voiceHook.isActive} 
            voiceActive={voiceHook.isActive}
          />
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

