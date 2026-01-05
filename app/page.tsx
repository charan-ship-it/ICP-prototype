"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import ChatHeader from "@/components/ChatHeader";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import ChatInput from "@/components/ChatInput";
import ICPConfirmationCard from "@/components/ICPConfirmationCard";

// Dynamically import heavy components that aren't needed immediately
const VoicePanel = dynamic(() => import("@/components/VoicePanel"), {
  ssr: false, // Voice panel doesn't need SSR
  loading: () => <div className="hidden lg:block w-80" />, // Placeholder to maintain layout
});

const ICPDocumentViewer = dynamic(() => import("@/components/ICPDocumentViewer"), {
  ssr: false, // Document viewer doesn't need SSR
});
import { getOrCreateSessionId } from "@/lib/session";
import { ChatListItem, MessageDisplay } from "@/types/chat";
import { ICPData, calculateProgress } from "@/types/icp";
import { analyzeMessageForICP, updateSectionCompletion, isValidCompanyName } from "@/lib/icp-analyzer";
import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import { voiceLogger } from "@/lib/voiceLogger";
import { ToastContainer, Toast } from "@/components/Toast";

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
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const currentAbortControllerRef = useRef<AbortController | null>(null);
  const handleSendMessageRef = useRef<((content: string) => Promise<void>) | null>(null);
  const conversationChatIdRef = useRef<string | null>(null); // Stable chatId for voice conversation
  const conversationIdRef = useRef<string | null>(null); // Unique ID for this conversation session
  const lastAIMessageIdRef = useRef<string | null>(null); // Store the last AI message ID from server
  const currentSummaryRef = useRef<string | null>(null); // Store summary for current message (for voice mode)
  const currentSummaryMessageIdRef = useRef<string | null>(null); // Store the summary message ID
  const voiceStreamingMessageIdRef = useRef<string | null>(null); // Store the message ID for streaming voice text
  const lastSpokenTextRef = useRef<{ messageId: string; text: string } | null>(null); // Track last spoken text for idempotent updates

  // Initialize voice hook (will use handleSendMessageRef)
  const voiceHook = useElevenLabsVoice({
    sessionId,
    onTranscriptComplete: async (text) => {
      // PREVENT DOUBLE VOICE: Ignore voice commands while processing PDF
      // This prevents the "2 voices" issue where the file upload triggers a response
      // AND the voice input (or noise) triggers a second response simultaneously.
      if (isProcessingPDF) {
        voiceLogger.log('STT', 'Ignoring voice command during PDF processing', {
          conversationId: conversationIdRef.current,
          chatId: conversationChatIdRef.current
        });
        console.log('[app/page.tsx] onTranscriptComplete: Ignoring text because PDF is processing');
        return;
      }

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
      // Only UPDATE existing message, never create
      const messageId = lastAIMessageIdRef.current || voiceStreamingMessageIdRef.current;
      if (!messageId) {
        console.warn('[onTextSpoken] No message ID - message should have been created at stream start');
        return;
      }

      // Combine summary with AI response if we have a summary
      const summary = currentSummaryRef.current;
      const displayContent = summary
        ? `${summary}\n\n${spokenText}`
        : spokenText;

      if (!displayContent || !displayContent.trim()) {
        return;
      }

      // CRITICAL: Check if this is duplicate (same text for same message)
      if (lastSpokenTextRef.current?.messageId === messageId &&
        lastSpokenTextRef.current?.text === spokenText) {
        // Identical update - ignore (idempotent)
        return;
      }

      // Update last spoken text
      lastSpokenTextRef.current = { messageId, text: spokenText };

      // Update existing message
      setMessages((prev) => {
        const existingIndex = prev.findIndex(msg => msg.id === messageId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            content: displayContent,
            timestamp: new Date(),
          };
          return updated;
        }
        // Message should exist - log warning
        console.warn('[onTextSpoken] Message not found, should have been created at stream start');
        return prev;
      });

      // Also update streaming content for VoicePanel if needed
      setStreamingAIContent(displayContent);
    },
    onSpeakingComplete: (finalText) => {
      // Finalize the message with complete text (message was already created/updated by onTextSpoken)
      console.log('[onSpeakingComplete] Voice finished, finalizing message:', finalText.length, 'chars');

      // Combine summary with AI response if we have a summary
      const summary = currentSummaryRef.current;
      const fullContent = summary
        ? `${summary}\n\n${finalText}`
        : finalText;

      if (!fullContent || !fullContent.trim()) {
        console.log('[onSpeakingComplete] No text to finalize');
        return;
      }

      // CRITICAL: Find the most recent assistant message that was created during streaming
      // This ensures we update the correct message, not create a duplicate
      setMessages((prev) => {
        // Try to find the message by checking refs first (most reliable)
        const serverMessageId = lastAIMessageIdRef.current;
        const summaryMessageId = currentSummaryMessageIdRef.current;
        const streamingMessageId = voiceStreamingMessageIdRef.current;

        // Priority: server ID > summary ID > streaming ID > find last assistant message
        let messageId = serverMessageId || summaryMessageId || streamingMessageId;

        // If we have an ID, try to find and update that message
        if (messageId) {
          const existingIndex = prev.findIndex(msg => msg.id === messageId);
          if (existingIndex >= 0) {
            // Update existing message with final content
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              content: fullContent,
              timestamp: new Date(),
            };
            return updated;
          }
        }

        // If no ID or message not found, find the last assistant message (should be the one we just created)
        // This handles edge cases where refs might be cleared
        const lastAssistantIndex = prev.map((msg, idx) => ({ msg, idx }))
          .filter(({ msg }) => msg.role === 'assistant')
          .pop()?.idx;

        if (lastAssistantIndex !== undefined && lastAssistantIndex >= 0) {
          // Update the last assistant message
          const updated = [...prev];
          updated[lastAssistantIndex] = {
            ...updated[lastAssistantIndex],
            content: fullContent,
            timestamp: new Date(),
          };
          return updated;
        }

        // Last resort: create new message (shouldn't happen, but handle it)
        console.warn('[onSpeakingComplete] No existing message found, creating new one');
        return [...prev, {
          id: messageId || `voice-response-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant' as const,
          content: fullContent,
          timestamp: new Date(),
        }];
      });

      // Clear the stored refs after using them
      lastAIMessageIdRef.current = null;
      currentSummaryRef.current = null;
      currentSummaryMessageIdRef.current = null;
      voiceStreamingMessageIdRef.current = null;
      setStreamingAIContent(''); // Clear streaming content
    },
    onBargeIn: () => {
      console.log('[app/page.tsx] Barge-in detected, aborting OpenAI stream');
      if (currentAbortControllerRef.current) {
        currentAbortControllerRef.current.abort();
        currentAbortControllerRef.current = null;
      }
      // Clear streaming message ID on barge-in
      voiceStreamingMessageIdRef.current = null;
    },
    onError: (error) => {
      console.error('[app/page.tsx] Voice hook error:', error);
      showToast(error.message || 'Voice error occurred', 'error');
      // Add error message to chat
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `I encountered an error: ${error.message || 'An unexpected error occurred'}. Please try again.`,
        timestamp: new Date(),
      }]);
    },
  });

  // Toast helper functions
  const showToast = (message: string, type: Toast['type'] = 'error', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // Error handler helper
  const handleError = (error: unknown, context: string, showInChat = true) => {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    const fullMessage = `${context}: ${errorMessage}`;
    console.error(fullMessage, error);

    showToast(errorMessage, 'error');

    if (showInChat) {
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `I encountered an error: ${errorMessage}. Please try again.`,
        timestamp: new Date(),
      }]);
    }
  };

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
        handleError(error, 'Failed to initialize session', false);
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
      handleError(error, 'Error loading chats', false);
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
      handleError(error, 'Error creating chat', true);
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
      handleError(error, 'Error loading ICP data', false);
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
      handleError(error, 'Error loading chat', true);
      setMessages([]);
      setIcpData(null);
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Edit a chat (rename)
  const handleEditChat = async (chatId: string, newTitle: string) => {
    if (!sessionId || !newTitle.trim()) return;

    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (!response.ok) throw new Error('Failed to update chat');

      // Reload chats list
      loadChats(sessionId);
    } catch (error) {
      handleError(error, 'Error updating chat', true);
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
      handleError(error, 'Error deleting chat', false);
    }
  };

  // Delete all chats
  const handleDeleteAllChats = async () => {
    if (!sessionId) return;

    // Confirm with user
    if (!confirm('Are you sure you want to delete all chats? This action cannot be undone.')) {
      return;
    }

    // CRITICAL FIX: If voice is active, end it before deleting all chats
    if (voiceHook.isActive) {
      console.log('[handleDeleteAllChats] Voice active - ending voice mode before deleting all chats');
      await voiceHook.endConversation();
      conversationChatIdRef.current = null;
      conversationIdRef.current = null;
    }

    try {
      const response = await fetch(`/api/chats?session_id=${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete all chats');

      // Clear selection and messages
      setSelectedChatId(undefined);
      setMessages([]);
      setIcpData(null);
      setProgress(0);

      // Reload chats list (will be empty)
      loadChats(sessionId);
    } catch (error) {
      handleError(error, 'Error deleting all chats', true);
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

    // CRITICAL FIX: If voice mode is starting and we have a selectedChatId, use it
    // This ensures voice mode uses the existing chat where documents were uploaded
    if (!chatId && voiceHook.isActive && selectedChatId) {
      chatId = selectedChatId;
      conversationChatIdRef.current = selectedChatId || null;
      voiceLogger.log('ChatId', 'Syncing chatId from selectedChatId for voice mode', {
        conversationId: conversationIdRef.current,
        chatId
      });
    }

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
    let processedICPData: ICPData | null = null; // Track fresh data from PDF processing

    if (file) {
      // Start file processing
      if (voiceHook.isActive) {
        voiceHook.pauseMicrophone(); // Pause VAD during processing
      }
      if (file.type === 'application/pdf') {
        setIsProcessingPDF(true);
      }

      try {
        console.log('Processing file:', file.name);

        if (file.type === 'application/pdf') {
          setIsProcessingPDF(true);

          if (!chatId) {
            // If no chatId, wait for it (should be created by now)
            if (!selectedChatId) {
              throw new Error('ChatId is required for file processing');
            }
          }

          // Don't add text message - ChatArea will show the animation indicator

          const formData = new FormData();
          formData.append('file', file);
          formData.append('chatId', chatId!);

          const processResponse = await fetch('/api/files/process-pdf', {
            method: 'POST',
            body: formData,
          });

          if (!processResponse.ok) {
            const errorData = await processResponse.json().catch(() => ({}));
            const errorMessage = errorData.message || errorData.error || 'Failed to process PDF';
            const errorDetails = errorData.details ? ` (${errorData.details})` : '';
            console.error('[PDF Processing] Server error:', errorData);
            throw new Error(`${errorMessage}${errorDetails}`);
          }

          const processData = await processResponse.json();
          console.log('[PDF Processing] Full response:', {
            hasSummary: !!processData.summary,
            hasExtractedFields: !!processData.extractedFields,
            hasIcpData: !!processData.icpData,
            filledSections: processData.filledSections,
          });

          icpExtraction = {
            summary: processData.summary,
            extractedFields: processData.extractedFields,
            filledSections: processData.filledSections,
          };

          // Update ICP data in state - show panel if we have ANY extraction
          const hasExtractedData = processData.extractedFields && Object.keys(processData.extractedFields).length > 0;

          if (processData.icpData || hasExtractedData) {
            // Use icpData if available, otherwise construct from extractedFields
            const dataToShow = processData.icpData || {
              chat_id: chatId,
              ...processData.extractedFields,
            };

            // CRITICAL: Capture the fresh data to use in subsequent logic
            processedICPData = dataToShow;

            console.log('[PDF Processing] Setting pending ICP data:', dataToShow);

            // Sync conversationChatIdRef variables
            if (!voiceHook.isActive && chatId) {
              conversationChatIdRef.current = chatId;
            }

            // Store as pending data for user to confirm via cards
            setPendingICPData(dataToShow);
            setIcpData(dataToShow);

            // Re-calculate progress based on the new data
            const newProgress = calculateProgress(dataToShow);
            setProgress(newProgress);

            setShowICPCards(true);
            console.log('[PDF Processing] showICPCards set to true');
          } else {
            console.warn('[PDF Processing] No icpData or extractedFields in response!', processData);
          }

          // Store extracted text for AI context
          if (processData.extractedText) {
            finalContent = content
              ? `${content}\n\n=== DOCUMENT CONTENT (AUTHORITATIVE SOURCE) ===\n[Document: ${file.name}]\n\n${processData.extractedText}\n\n=== END DOCUMENT CONTENT ===\n\nIMPORTANT: All information in the document above is COMPLETE and AUTHORITATIVE. Extract all ICP information from it directly. Do NOT ask the user to repeat information that is already in this document.`
              : `=== DOCUMENT CONTENT (AUTHORITATIVE SOURCE) ===\n[Document: ${file.name}]\n\n${processData.extractedText}\n\n=== END DOCUMENT CONTENT ===\n\nIMPORTANT: All information in the document above is COMPLETE and AUTHORITATIVE. Extract all ICP information from it directly. Do NOT ask the user to repeat information that is already in this document.`;
          }

          // Remove processing message and show completion
          setMessages((prev) => prev.filter(msg => !msg.id?.startsWith('pdf-processing-')));
          setIsProcessingPDF(false);

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
        setIsProcessingPDF(false);
        // Remove processing message
        setMessages((prev) => prev.filter(msg => !msg.id?.startsWith('pdf-processing-')));
        handleError(error, 'Error processing file', true);
        const errorMessage = error instanceof Error ? error.message : 'Failed to process file';
        finalContent = content
          ? `${content}\n\n[Error processing file: ${errorMessage}]`
          : `[Error processing file: ${errorMessage}]`;
      } finally {
        // ALWAYS resume microphone if voice was active
        if (voiceHook.isActive) {
          voiceHook.resumeMicrophone();
        }
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

      let userMessage: any;

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

        // If chat not found (404), try to create a new chat and retry
        if (userResponse.status === 404 && errorData?.error === 'Chat not found') {
          console.log('[handleSendMessage] Chat not found, creating new chat and retrying...');

          if (!sessionId) {
            throw new Error('Session ID is required to create a new chat');
          }

          // Create a new chat
          const newChatResponse = await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
          });

          if (!newChatResponse.ok) {
            throw new Error('Failed to create new chat');
          }

          const newChat = await newChatResponse.json();
          chatId = newChat.id;

          // Update refs and state
          conversationChatIdRef.current = chatId || null;
          setSelectedChatId(chatId);
          setMessages([]);

          // Add new chat to list
          setChats((prev) => [
            {
              id: newChat.id,
              title: newChat.title,
              timestamp: newChat.timestamp ? new Date(newChat.timestamp) : undefined,
            },
            ...prev,
          ]);

          // Retry saving the message with the new chatId
          const retryResponse = await fetch(`/api/chats/${chatId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'user',
              content: messageContent,
            }),
          });

          if (!retryResponse.ok) {
            const retryErrorData = await retryResponse.json().catch(() => ({}));
            throw new Error(retryErrorData?.error || retryErrorData?.details || 'Failed to save message after creating new chat');
          }

          userMessage = await retryResponse.json();
        } else {
          // For other errors, throw normally
          console.error('Failed to save message:', {
            status: userResponse.status,
            statusText: userResponse.statusText,
            errorData,
            chatId,
          });

          const errorMessage = errorData?.error || errorData?.details || errorData?.message || `Failed to save message (${userResponse.status})`;
          throw new Error(errorMessage);
        }
      } else {
        // Normal case: response is OK
        userMessage = await userResponse.json();
      }

      console.log('[handleSendMessage] User message saved to database:', {
        messageId: userMessage.id,
        contentLength: userMessage.content?.length || 0,
        chatId
      });

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
        // Always update ICP data, even if nothing detected (to ensure it exists and recalculate progress)
        // CRITICAL FIX: Use fresh processedICPData if we just parsed a PDF, otherwise use state
        const currentICP: ICPData = processedICPData || icpData || { chat_id: chatId! };

        // Preserve existing completion flags BEFORE updating
        // These flags may have been set by PDF processing or user confirmation
        const preservedCompletionFlags = {
          company_basics_complete: currentICP.company_basics_complete === true,
          target_customer_complete: currentICP.target_customer_complete === true,
          problem_pain_complete: currentICP.problem_pain_complete === true,
          buying_process_complete: currentICP.buying_process_complete === true,
          budget_decision_complete: currentICP.budget_decision_complete === true,
        };

        // Merge detected ICP data, but preserve existing valid fields
        // Don't overwrite existing company_name if new extraction is invalid or empty
        const updatedICP: Partial<ICPData> = {
          ...currentICP,
        };

        // Only update fields if detected value is valid and existing value is not already valid
        for (const [key, value] of Object.entries(detectedICP)) {
          if (value !== undefined && value !== null && value !== '') {
            // Special handling for company_name - don't overwrite if existing is valid
            if (key === 'company_name' && currentICP.company_name) {
              // Use proper validation function
              const existingIsValid = isValidCompanyName(currentICP.company_name);
              const newIsValid = isValidCompanyName(value as string);

              // Only overwrite if existing is invalid AND new is valid
              if (existingIsValid && !newIsValid) {
                // Keep existing valid company name, reject invalid new one
                continue;
              }
              // If existing is invalid but new is valid, allow update
              // If both are valid, prefer existing (don't overwrite)
              if (existingIsValid && newIsValid) {
                continue;
              }
            }
            // For other fields, update if detected value is valid
            updatedICP[key as keyof ICPData] = value as any;
          }
        }

        // Update section completion
        const completedICP = updateSectionCompletion(updatedICP as ICPData);

        // Restore preserved flags - if a section was already marked complete,
        // keep it complete even if updateSectionCompletion recalculated it as false
        if (preservedCompletionFlags.company_basics_complete) {
          completedICP.company_basics_complete = true;
        }
        if (preservedCompletionFlags.target_customer_complete) {
          completedICP.target_customer_complete = true;
        }
        if (preservedCompletionFlags.problem_pain_complete) {
          completedICP.problem_pain_complete = true;
        }
        if (preservedCompletionFlags.buying_process_complete) {
          completedICP.buying_process_complete = true;
        }
        if (preservedCompletionFlags.budget_decision_complete) {
          completedICP.budget_decision_complete = true;
        }

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
        handleError(error, 'Error updating ICP data', false);
        // Don't fail the message send if ICP update fails
      }

      // Update chat title if this is the first message (title is still "New Chat")
      const currentChat = chats.find(c => c.id === chatId);
      let titleUpdated = false;
      if (currentChat?.title === 'New Chat') {
        // Use first 50 characters of message as title
        const newTitle = content.length > 50 ? content.substring(0, 50) + '...' : content;
        try {
          await fetch(`/api/chats/${chatId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle }),
          });
          titleUpdated = true;
        } catch (error) {
          handleError(error, 'Error updating chat title', false);
        }
      }

      // Reload chats only if title was updated (to refresh the title in sidebar)
      // Otherwise, the chat list doesn't need immediate update after user message
      if (sessionId && titleUpdated) {
        loadChats(sessionId);
      }
    } catch (error) {
      handleError(error, 'Error sending message', true);
      return;
    }

    // Clear previous AI message ID ref for new message
    lastAIMessageIdRef.current = null;
    currentSummaryRef.current = null;
    currentSummaryMessageIdRef.current = null;
    voiceStreamingMessageIdRef.current = null;

    // Only set loading state for text mode - voice mode handles its own state transitions
    if (!voiceHook.isActive) {
      setIsLoading(true);
    }

    // Create abort controller for barge-in support
    // Will be replaced by voice hook's turn management if active
    let abortController = new AbortController();
    currentAbortControllerRef.current = abortController;

    // Set abort controller in voice hook immediately for barge-in support
    voiceHook.setOpenAIAbortController(abortController);

    // Track OpenAI timing (must be in scope for stream completion)
    const openaiStartTime = Date.now();
    // Track if ICP data was updated during the response to avoid redundant reloads
    let icpDataUpdated = false;
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
    let timeoutId: NodeJS.Timeout | undefined;
    try {
      console.log('[AI Request] Starting API call to /api/ai/chat', { chatId });
      const aiResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
        signal: abortController.signal,
      });

      console.log('[AI Request] Response status:', aiResponse.status, aiResponse.statusText);

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json().catch(() => ({}));
        console.error('AI API error:', errorData);
        throw new Error(errorData.error || 'Failed to get AI response');
      }

      // CRITICAL: Create assistant message IMMEDIATELY when stream starts
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: MessageDisplay = {
        id: assistantMessageId,
        role: 'assistant',
        content: '', // Empty initially
        timestamp: new Date(),
        icpExtraction: icpExtraction,
      };

      // Add to messages immediately
      setMessages((prev) => [...prev, assistantMessage]);

      // Store for voice mode
      lastAIMessageIdRef.current = assistantMessageId;
      voiceStreamingMessageIdRef.current = assistantMessageId;

      // CRITICAL FIX: Start new assistant turn BEFORE getting reader
      // This ensures turnId is captured before any async operations
      let capturedTurnId: number | undefined;
      if (voiceHook.isActive && voiceHook.startNewAssistantTurn) {
        // Access ref directly to get current turnId before incrementing
        const currentTurnIdBefore = (voiceHook as any).currentAssistantTurnRef?.current?.turnId;
        console.log('[Turn Management] Calling startNewAssistantTurn BEFORE SSE read', {
          messageId: assistantMessageId,
          currentTurnIdBefore
        });
        capturedTurnId = voiceHook.startNewAssistantTurn(assistantMessageId);
        console.log('[Turn Management] Turn created, capturedTurnId:', capturedTurnId);

        // Use the abortController from the turn management (for proper barge-in cancellation)
        // The turn management creates a new AbortController for each turn
        const turnAbortController = (voiceHook as any).currentAssistantTurnRef?.current?.abortController;
        if (turnAbortController) {
          abortController = turnAbortController;
          currentAbortControllerRef.current = abortController;
          voiceHook.setOpenAIAbortController(abortController);
        }
      }

      // Handle streaming response
      const reader = aiResponse.body?.getReader();
      if (!reader) {
        console.error('[AI Request] No response body reader available');
        throw new Error('Failed to get response reader');
      }
      // CRITICAL FIX: Read currentTurnId directly from ref to avoid getter closure issues
      // Note: TurnId may change if barge-in occurred, which is expected behavior
      // We don't need to log this as an error - the stream will be stopped naturally if turn changed
      const currentTurnIdAtStart = voiceHook.isActive
        ? (voiceHook as any).currentAssistantTurnRef?.current?.turnId
        : undefined;

      // Only log mismatch for debugging, not as an error (barge-in can cause this)
      if (voiceHook.isActive && capturedTurnId !== undefined && capturedTurnId !== currentTurnIdAtStart) {
        console.log('[AI Request] TurnId changed before stream start (likely barge-in)', {
          capturedTurnId,
          currentTurnIdAtStart
        });
      }

      const decoder = new TextDecoder();
      let fullContent = '';

      let messageId = assistantMessageId; // Use the same ID
      let firstTokenReceived = false;
      const firstTokenTime = Date.now();

      // Store summary for voice mode if we have ICP extraction
      const initialContent = icpExtraction?.summary || '';
      if (initialContent && voiceHook.isActive) {
        currentSummaryRef.current = initialContent;
        currentSummaryMessageIdRef.current = messageId;
      } else {
        currentSummaryRef.current = null;
        currentSummaryMessageIdRef.current = null;
      }

      // Update message with initial content if we have a summary
      if (initialContent) {
        setMessages((prev) =>
          prev.map(msg =>
            msg.id === messageId
              ? { ...msg, content: initialContent }
              : msg
          )
        );
        setStreamingAIContent(initialContent);
      }

      // Add timeout to prevent getting stuck (5 minutes max)
      const timeoutDuration = 5 * 60 * 1000; // 5 minutes
      timeoutId = setTimeout(() => {
        console.error('[OpenAI Stream] Timeout after 5 minutes, aborting stream');
        reader.cancel();
        abortController.abort();
        setIsLoading(false);
        const timeoutMessage = {
          id: `timeout-${Date.now()}`,
          role: 'assistant' as const,
          content: 'Sorry, the response took too long. Please try again.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, timeoutMessage]);
      }, timeoutDuration);

      // Read stream
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('[OpenAI Stream] Stream done');
            clearTimeout(timeoutId);
            break;
          }

          // Check if aborted (barge-in)
          if (abortController.signal.aborted) {
            console.log('[OpenAI Stream] Aborted due to barge-in');
            clearTimeout(timeoutId);
            break;
          }

          // CRITICAL FIX: Check if still current turn (for barge-in)
          // Only check if we captured a turnId and voice is active
          // Access ref directly to avoid getter closure issues
          if (voiceHook.isActive && capturedTurnId !== undefined) {
            const currentTurnId = (voiceHook as any).currentAssistantTurnRef?.current?.turnId;
            if (currentTurnId !== undefined && currentTurnId !== capturedTurnId) {
              console.log('[Stream] Turn changed, stopping stream', {
                capturedTurnId,
                currentTurnId,
                reason: 'Turn ID mismatch - barge-in or new turn started'
              });
              clearTimeout(timeoutId);
              break;
            }
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

                  // CRITICAL: In voice mode, handle summary properly
                  // If summary was already shown, update that message instead of creating new one
                  if (voiceHook.isActive) {
                    // Store the server message ID
                    lastAIMessageIdRef.current = data.message.id;

                    // If we have a summary that was already shown, use that message ID
                    // Otherwise, use the server message ID
                    if (currentSummaryMessageIdRef.current) {
                      lastAIMessageIdRef.current = currentSummaryMessageIdRef.current;
                    }
                  } else {
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
                  }

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
                    if (Object.keys(detectedICP).length > 0 && chatId) {
                      const currentICP: ICPData = icpData || { chat_id: chatId };

                      // Preserve existing completion flags BEFORE updating
                      // These flags may have been set by PDF processing or user confirmation
                      const preservedCompletionFlags = {
                        company_basics_complete: currentICP.company_basics_complete === true,
                        target_customer_complete: currentICP.target_customer_complete === true,
                        problem_pain_complete: currentICP.problem_pain_complete === true,
                        buying_process_complete: currentICP.buying_process_complete === true,
                        budget_decision_complete: currentICP.budget_decision_complete === true,
                      };

                      const updatedICP = {
                        ...currentICP,
                        ...detectedICP,
                      };
                      const completedICP = updateSectionCompletion(updatedICP as ICPData);

                      // Restore preserved flags - if a section was already marked complete,
                      // keep it complete even if updateSectionCompletion recalculated it as false
                      if (preservedCompletionFlags.company_basics_complete) {
                        completedICP.company_basics_complete = true;
                      }
                      if (preservedCompletionFlags.target_customer_complete) {
                        completedICP.target_customer_complete = true;
                      }
                      if (preservedCompletionFlags.problem_pain_complete) {
                        completedICP.problem_pain_complete = true;
                      }
                      if (preservedCompletionFlags.buying_process_complete) {
                        completedICP.buying_process_complete = true;
                      }
                      if (preservedCompletionFlags.budget_decision_complete) {
                        completedICP.budget_decision_complete = true;
                      }

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
                        icpDataUpdated = true; // Mark that ICP was updated
                      } else {
                        console.warn('[ICP Update] Failed to save ICP data:', icpResponse.status);
                      }
                    }
                  } catch (error) {
                    console.error('Error extracting ICP from AI response:', error);
                    // Don't let ICP update errors break the stream
                  }

                  // Reload chats (ICP data already updated above, no need to reload)
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

                    // TTS preparation is handled by streamToTTS() - single source of truth
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
      } catch (streamError: any) {
        console.error('[OpenAI Stream] Stream reading error:', streamError);
        clearTimeout(timeoutId);
        // If reader error, try to cancel it
        try {
          reader.cancel();
        } catch (cancelError) {
          // Ignore cancel errors
        }
        throw streamError;
      }

      // Note: ICP analysis is already handled in the streaming handler above
      // when data.done is true and data.message is received

      // Reload ICP data only if it wasn't already updated during the response
      if (chatId && !icpDataUpdated) {
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
        setIsLoading(false);
        currentAbortControllerRef.current = null;
        voiceHook.setOpenAIAbortController(null);
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
        content: error.message?.includes('timeout') || error.message?.includes('took too long')
          ? 'Sorry, the response took too long. Please try again.'
          : 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      // CRITICAL: Always reset loading state, even if there was an error
      // Only reset if we set it (i.e., not in voice mode)
      if (!voiceHook.isActive) {
        setIsLoading(false);
      }
      currentAbortControllerRef.current = null; // Clear abort controller
      voiceHook.setOpenAIAbortController(null); // Clear in voice hook
      // Clear timeout if it still exists (in case stream completed normally)
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
    // Don't clear context immediately - preserve it for final logging
    // Context will be cleared when a new conversation starts
    // This prevents "unknown" IDs in logs after conversation ends

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
    setPendingICPData((prev) => {
      if (!prev) return null;
      return { ...prev, [field]: value };
    });
  }, []);

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
      handleError(error, 'Error confirming all ICP sections', false);
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
      handleError(error, 'Error generating document', true);
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
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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
            onEditChat={handleEditChat}
            onDeleteAllChats={handleDeleteAllChats}
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
            isProcessingPDF={isProcessingPDF}
            isTranscribing={voiceHook.isTranscribing}
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
            disabled={false}
            voiceActive={voiceHook.isActive}
          />

          {/* VAD Debug Overlay - Only visible when voice is active */}
          {voiceHook.isActive && voiceHook.vadStats && (
            <div className="fixed bottom-6 right-6 bg-black/90 text-green-400 p-3 rounded-lg text-xs font-mono z-[100] border border-green-900 shadow-xl pointer-events-none select-none backdrop-blur-sm min-w-[140px]">
              <div className="text-center mb-1 text-gray-500 font-bold border-b border-gray-800 pb-1">VAD DEBUG</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <div className="text-gray-500">Energy:</div>
                <div className="text-right font-medium">{(voiceHook.vadStats.energy || 0).toFixed(4)}</div>

                <div className="text-gray-500">Thresh:</div>
                <div className="text-right font-medium text-yellow-500/80">{(voiceHook.vadStats.threshold || 0).toFixed(4)}</div>

                <div className="text-gray-500">State:</div>
                <div className={`text-right font-bold ${voiceHook.vadStats.isSpeaking ? "text-red-500 animate-pulse" : "text-gray-600"}`}>
                  {voiceHook.vadStats.isSpeaking ? "SPEAKING" : "SILENT"}
                </div>
              </div>
            </div>
          )}
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

