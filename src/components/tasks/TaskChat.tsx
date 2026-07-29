'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addTaskMessage } from '@/actions/tasks';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { Send } from 'lucide-react';
import type { Profile } from '@/types';

export type MessageWithSender = {
  id: string;
  task_id?: string;
  sender_id: string;
  content: string | null;
  file_url?: string | null;
  file_name?: string | null;
  created_at: Date;
  sender: Pick<Profile, 'id' | 'full_name'>;
};

interface Props {
  taskId: string;
  currentUserId: string;
  initialMessages: MessageWithSender[];
}

export function TaskChat({ taskId, currentUserId, initialMessages }: Props) {
  const [messages, setMessages] = useState<MessageWithSender[]>(initialMessages);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // createClient() is stable across renders — no need to memoize
  const supabase = createClient();

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Supabase Realtime subscription — one channel per taskId
  useEffect(() => {
    const channel = supabase
      .channel(`task-chat-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_messages',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          // CDC payload has the raw DB row shape
          const row = payload.new as {
            id: string;
            task_id: string;
            sender_id: string;
            content: string | null;
            file_url: string | null;
            file_name: string | null;
            created_at: string;
          };
          setMessages((prev) => {
            // Guard against duplicates (e.g. own message echoed back via CDC)
            if (prev.some((m) => m.id === row.id)) return prev;
            const withSender: MessageWithSender = {
              id: row.id,
              task_id: row.task_id,
              sender_id: row.sender_id,
              content: row.content,
              file_url: row.file_url,
              file_name: row.file_name,
              // created_at comes as ISO string from CDC — convert to Date
              created_at: new Date(row.created_at),
              // Sender profile is not available from CDC; use stub.
              // Initials fall back to the last 2 chars of sender_id.
              sender: { id: row.sender_id, full_name: '' },
            };
            return [...prev, withSender];
          });
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(JSON.stringify({ level: 'error', component: 'TaskChat', status, err: err?.message }));
        }
      });

    // CRITICAL: clean up on unmount to prevent zombie subscriptions
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setContent('');
    try {
      const result = await addTaskMessage({ task_id: taskId, content: trimmed });
      if ('error' in result) {
        // Restore content so the user doesn't lose their message
        setContent(trimmed);
        console.error('[TaskChat] addTaskMessage error:', result.error);
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-[400px] lg:h-[500px]">
      <h2 className="text-sm font-semibold mb-3 flex-shrink-0">Discussion</h2>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === currentUserId;
            const name = msg.sender?.full_name ?? '';
            const initials = name
              ? name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
              : msg.sender_id.slice(-2).toUpperCase();

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div
                  className={`max-w-[75%] flex flex-col gap-0.5 ${
                    isOwn ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      isOwn
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(msg.created_at), 'h:mm a')}
                  </span>
                </div>
              </div>
            );
          })
        )}
        {/* Sentinel element — scrolled into view on each new message */}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-2 mt-3 flex-shrink-0">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="resize-none text-sm"
          disabled={sending}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!content.trim() || sending}
          className="self-end min-h-[44px] min-w-[44px]"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
