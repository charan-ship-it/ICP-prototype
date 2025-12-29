"use client";

import { MessageCircle, Sparkles, Mic, Brain, Volume2, FileText } from "lucide-react";
import FileAttachmentCard from "./FileAttachmentCard";
import ICPConfirmationCard from "./ICPConfirmationCard";
import { MessageDisplay } from "@/types/chat";
import { ICPData } from "@/types/icp";

interface Message extends MessageDisplay {}

interface ChatAreaProps {
  messages?: Message[];
  isLoading?: boolean;
  voiceState?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  isVoiceActive?: boolean;
  voiceTranscript?: string;
  voiceLiveTranscript?: string;
  onConfirmSection?: (section: string) => void;
  onEditField?: (field: keyof import("@/types/icp").ICPData, value: string) => void;
}

// Helper function to get section fields from extracted ICP data
function getSectionFields(section: string, extractedFields: any): { key: keyof ICPData; label: string; value: string | undefined }[] {
  const sectionMap: Record<string, { key: keyof ICPData; label: string }[]> = {
    'Company Basics': [
      { key: 'company_name', label: 'Company Name' },
      { key: 'company_size', label: 'Company Size' },
      { key: 'industry', label: 'Industry' },
      { key: 'location', label: 'Location' },
    ],
    'Target Customer': [
      { key: 'target_customer_type', label: 'Customer Type' },
      { key: 'target_demographics', label: 'Demographics' },
      { key: 'target_psychographics', label: 'Psychographics' },
    ],
    'Problem & Pain': [
      { key: 'main_problems', label: 'Main Problems' },
      { key: 'pain_points', label: 'Pain Points' },
      { key: 'current_solutions', label: 'Current Solutions' },
    ],
    'Buying Process': [
      { key: 'decision_makers', label: 'Decision Makers' },
      { key: 'buying_process_steps', label: 'Buying Process Steps' },
      { key: 'evaluation_criteria', label: 'Evaluation Criteria' },
    ],
    'Budget & Decision Maker': [
      { key: 'budget_range', label: 'Budget Range' },
      { key: 'decision_maker_role', label: 'Decision Maker Role' },
      { key: 'approval_process', label: 'Approval Process' },
    ],
  };
  
  const fields = sectionMap[section] || [];
  return fields.map(f => ({
    ...f,
    value: extractedFields[f.key],
  })).filter(f => f.value);
}

export default function ChatArea({ 
  messages = [], 
  isLoading = false,
  voiceState = 'idle',
  isVoiceActive = false,
  voiceTranscript = '',
  voiceLiveTranscript = '',
  onConfirmSection,
  onEditField,
}: ChatAreaProps) {
  // Show empty state if no messages and voice is not active
  if (messages.length === 0 && !isVoiceActive) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">Start a conversation</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Ask me anything about building your Ideal Customer Profile. I'm here to help you understand your customers better.
          </p>
          <div className="space-y-2 text-left">
            <p className="text-xs font-medium text-muted-foreground">Try asking:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-primary"></span>
                What is an Ideal Customer Profile?
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-primary"></span>
                How do I identify my target customers?
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-primary"></span>
                What questions should I ask to build an ICP?
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto bg-background p-6 md:p-8">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex w-full animate-in fade-in slide-in-from-bottom-2 ${
            message.role === "user" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground border border-border/50"
          }`}
          >
            {message.role === "assistant" && (
              <div className="mb-2 flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">AI Assistant</span>
              </div>
            )}
            
            {/* Show file attachment card for user messages with files */}
            {message.role === "user" && message.fileAttachment && (
              <div className="mb-2">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {message.fileAttachment.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(message.fileAttachment.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            
            {/* Temporarily disabled - showing wrong values
            {message.role === "assistant" && message.icpExtraction && message.icpExtraction.filledSections && message.icpExtraction.filledSections.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Auto-filled ICP sections (please confirm or edit):
                </p>
                {message.icpExtraction.filledSections.map((section) => {
                  const fields = getSectionFields(section, message.icpExtraction!.extractedFields);
                  if (fields.length === 0) return null;
                  
                  return (
                    <ICPConfirmationCard
                      key={section}
                      section={section}
                      fields={fields}
                      onConfirm={() => {
                        if (onConfirmSection) {
                          onConfirmSection(section);
                        }
                      }}
                      onEdit={(field, value) => {
                        if (onEditField) {
                          onEditField(field, value);
                        }
                      }}
                    />
                  );
                })}
              </div>
            )}
            */}
            {message.timestamp && (
              <p className={`mt-2 text-xs ${message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>
      ))}
      
      {/* Voice Mode Active Indicators */}
      {isVoiceActive && (
        <>
          {/* Listening State - Show live transcript */}
          {voiceState === 'listening' && (voiceTranscript || voiceLiveTranscript) && (
            <div className="flex w-full justify-end animate-in fade-in slide-in-from-bottom-2">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 bg-primary/10 border-2 border-primary/30">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="h-3.5 w-3.5 text-primary animate-pulse" />
                  <span className="text-xs font-medium text-primary">You (speaking...)</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground">
                  {voiceTranscript && <span className="opacity-70">{voiceTranscript} </span>}
                  {voiceLiveTranscript && <span className="font-medium">{voiceLiveTranscript}</span>}
                </p>
              </div>
            </div>
          )}
          
          {/* Thinking State */}
          {voiceState === 'thinking' && (
            <div className="flex w-full justify-start animate-in fade-in">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-yellow-500/10 px-4 py-3 border-2 border-yellow-500/30">
                <div className="flex items-center gap-3">
                  <Brain className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-yellow-600 dark:bg-yellow-500 [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-yellow-600 dark:bg-yellow-500 [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-yellow-600 dark:bg-yellow-500"></div>
                  </div>
                  <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Speaking State */}
          {voiceState === 'speaking' && (
            <div className="flex w-full justify-start animate-in fade-in">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-green-500/10 px-4 py-3 border-2 border-green-500/30">
                <div className="flex items-center gap-3">
                  <Volume2 className="h-4 w-4 text-green-600 dark:text-green-500 animate-pulse" />
                  <div className="flex gap-1">
                    <div className="h-3 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
                    <div className="h-4 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                    <div className="h-5 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.4s]" />
                    <div className="h-4 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                    <div className="h-3 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
                  </div>
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">AI is speaking...</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Text mode loading indicator */}
      {isLoading && !isVoiceActive && (
        <div className="flex w-full justify-start">
          <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-muted px-4 py-3 border border-border/50">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"></div>
              </div>
              <span className="text-xs text-muted-foreground">AI is thinking...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
