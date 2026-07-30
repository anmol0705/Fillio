'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendMessage } from '@/actions/tasks';
import type { TaskMessageWithSender } from '@/types';

interface Props {
  taskId:        string;
  currentUserId: string;
  initialMessages: TaskMessageWithSender[];
}

export function TaskChat({ taskId, currentUserId, initialMessages }: Props) {
  const [messages, setMessages]    = useState<TaskMessageWithSender[]>(initialMessages);
  const [body, setBody]            = useState('');
  const [error, setError]          = useState('');
  const [isPending, startTransition] = useTransition();

  const bottomRef   = useRef<HTMLDivElement>(null);
  // Tracks IDs of messages we sent ourselves so we can skip the Realtime echo
  const sentIds     = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Auto-scroll to bottom whenever the message list grows
  // ---------------------------------------------------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Supabase Realtime subscription
  //
  // We subscribe to INSERT events on task_messages filtered by task_id.
  // When a new row arrives:
  //   - If its ID is in sentIds (we sent it, already in state) → skip (dedup)
  //   - Otherwise → append to messages list
  //
  // The channel is cleaned up when the component unmounts (navigation away).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`task-chat-${taskId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'task_messages',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string; task_id: string; org_id: string;
            sender_id: string; body: string; created_at: string;
          };

          // Skip the echo of our own message — we already added it optimistically
          if (sentIds.current.has(row.id)) {
            sentIds.current.delete(row.id);
            return;
          }

          // Message from another user — append with a placeholder sender name.
          // The full name isn't in the CDC payload, so we show a fallback until
          // the user refreshes or opens a new session (acceptable for now).
          setMessages((prev) => [
            ...prev,
            {
              ...row,
              created_at: new Date(row.created_at),
              sender: { id: row.sender_id, full_name: 'Team member' },
            },
          ]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || isPending) return;
    setError('');

    const optimisticMsg: TaskMessageWithSender = {
      id:         crypto.randomUUID(),
      task_id:    taskId,
      org_id:     '',           // not needed for rendering
      sender_id:  currentUserId,
      body:       body.trim(),
      created_at: new Date(),
      sender:     { id: currentUserId, full_name: 'You' },
    };

    // Add to UI immediately so the sender doesn't wait for the server
    setMessages((prev) => [...prev, optimisticMsg]);
    const draft = body.trim();
    setBody('');

    startTransition(async () => {
      const res = await sendMessage(taskId, draft);
      if ('error' in res) {
        // Remove the optimistic message and show the error
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        setError(res.error);
        setBody(draft); // restore so user can retry
        return;
      }
      // Server confirmed — register real ID so Realtime echo is skipped,
      // then replace the optimistic placeholder with the real row
      sentIds.current.add(res.data.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...res.data, sender: { id: currentUserId, full_name: 'You' } }
            : m
        )
      );
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd + Enter submits; plain Enter adds a newline
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full min-h-[400px] max-h-[600px]">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No messages yet. Start the conversation.
          </p>
        )}

        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
            >
              {/* Sender + time */}
              <div className={`flex items-center gap-1.5 mb-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                <span className="text-xs font-medium text-foreground">
                  {isOwn ? 'You' : msg.sender.full_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(msg.created_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                  isOwn
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted text-foreground rounded-tl-sm'
                }`}
              >
                {msg.body}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 px-1 pb-1">{error}</p>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-3 border-t border-border">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Ctrl+Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={isPending || !body.trim()}
          className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[40px]"
        >
          Send
        </button>
      </form>
    </div>
  );
}
