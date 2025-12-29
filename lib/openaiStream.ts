/**
 * OpenAI streaming helper with abort support
 */

export interface OpenAIStreamOptions {
  chatId: string;
  signal?: AbortSignal;
  onChunk?: (content: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

export async function streamOpenAIResponse(options: OpenAIStreamOptions): Promise<string> {
  const { chatId, signal, onChunk, onComplete, onError } = options;

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'OpenAI request failed');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            onComplete?.(fullContent);
            return fullContent;
          }

          try {
            const json = JSON.parse(data);
            const content = json.choices[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              onChunk?.(fullContent);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    onComplete?.(fullContent);
    return fullContent;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw error; // Re-throw abort errors
    }
    const err = error instanceof Error ? error : new Error('Stream error');
    onError?.(err);
    throw err;
  }
}

