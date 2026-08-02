'use client';

import { useRef, useEffect, useState } from 'react';
import { useChat } from 'ai/react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from 'ai';

// ─── Tool call indicator ────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  get_overdue_tasks:       'Looking up overdue tasks',
  get_upcoming_deadlines:  'Checking upcoming deadlines',
  get_client_task_history: 'Fetching client history',
  get_team_workload:       'Checking team workload',
  preview_task:            'Preparing task preview',
  create_task:             'Creating task',
};

function ToolChip({ toolName, done }: { toolName: string; done: boolean }) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      done
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
    )}>
      {done ? <span>✓</span> : <Loader2 className="w-3 h-3 animate-spin" />}
      <span>{label}{done ? '' : '…'}</span>
    </div>
  );
}

// ─── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
      {/* Tool invocations (assistant only) */}
      {!isUser && message.toolInvocations && message.toolInvocations.length > 0 && (
        <div className="flex flex-col gap-1">
          {message.toolInvocations.map((inv, i) => (
            <ToolChip
              key={i}
              toolName={inv.toolName}
              done={inv.state === 'result'}
            />
          ))}
        </div>
      )}

      {/* Text content */}
      {message.content && (
        <div className={cn(
          'rounded-2xl px-3.5 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm',
        )}>
          {message.content}
        </div>
      )}
    </div>
  );
}

// ─── Empty state / suggestions ───────────────────────────────────────────────

const SUGGESTIONS = [
  'What tasks are overdue?',
  "What's due this week?",
  'How is the team workload?',
  'Show Sharma & Co task history',
];

function EmptyState({ onSuggestion }: { onSuggestion: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-5">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-sm">Ask anything about your work</p>
        <p className="text-xs text-muted-foreground mt-1">
          Overdue items, deadlines, client history, team workload
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="text-xs text-left rounded-lg border px-3 py-2.5 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────

export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: '/api/ai/chat',
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  function handleSuggestion(q: string) {
    setInput(q);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) handleSubmit(e as unknown as React.FormEvent);
    }
  }

  const lastMessage = messages[messages.length - 1];
  const showTyping  = isLoading && lastMessage?.role === 'user';

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full shadow-lg',
          'flex items-center justify-center transition-all duration-200',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          open && 'scale-90',
        )}
        aria-label="Open AI assistant"
      >
        {open ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Slide-over panel */}
      <div className={cn(
        'fixed z-50 flex flex-col bg-background border-l border-t shadow-2xl',
        'transition-transform duration-300 ease-in-out',
        // Mobile: slides up from bottom
        'bottom-0 right-0 w-full rounded-t-2xl h-[82vh]',
        // Desktop: slides in from right, full height
        'sm:w-[400px] sm:h-screen sm:rounded-none sm:top-0',
        open
          ? 'translate-y-0 sm:translate-x-0'
          : 'translate-y-full sm:translate-y-0 sm:translate-x-full',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Filio Assistant</p>
              <p className="text-[10px] text-muted-foreground">Powered by Claude</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0
            ? <EmptyState onSuggestion={handleSuggestion} />
            : messages.map(m => <MessageBubble key={m.id} message={m} />)
          }

          {showTyping && (
            <div className="flex items-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                <div className="flex gap-1">
                  {[0, 150, 300].map(delay => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="shrink-0 border-t px-3 py-3 flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder="Ask about tasks, deadlines, clients…"
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-32 overflow-y-auto"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="w-9 h-9 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </>
  );
}
