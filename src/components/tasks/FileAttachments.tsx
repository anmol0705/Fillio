'use client';

import { useState, useTransition, useRef } from 'react';
import { Paperclip, Download, Trash2, Upload, FileText, Image, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadFile, deleteFile, getSignedUrl } from '@/actions/files';
import type { TaskFileWithUploader, AccessLevel } from '@/types';

interface Props {
  taskId:    string;
  myAccess:  AccessLevel | null;
  initial:   TaskFileWithUploader[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/'))       return <Image  className="w-4 h-4 shrink-0 text-blue-500" />;
  if (mime === 'application/pdf')      return <FileText className="w-4 h-4 shrink-0 text-red-500" />;
  return <File className="w-4 h-4 shrink-0 text-muted-foreground" />;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)    return 'just now';
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function FileAttachments({ taskId, myAccess, initial }: Props) {
  const [files, setFiles]            = useState<TaskFileWithUploader[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = myAccess === 'owner' || myAccess === 'editor';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');

    // Client-side size check before hitting the server
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('File exceeds 20 MB limit');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const res = await uploadFile(taskId, formData);
      if (res.error !== null) {
        setUploadError(res.error);
      } else {
        setFiles((prev) => [res.data, ...prev]);
      }
      // Reset input so same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  async function handleDownload(fileId: string) {
    setDownloading(fileId);
    try {
      const res = await getSignedUrl(fileId);
      if (res.error !== null) {
        alert(res.error);
        return;
      }
      // Open signed URL in new tab — browser handles download/preview
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(null);
    }
  }

  function handleDelete(fileId: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;

    startTransition(async () => {
      const res = await deleteFile(fileId);
      if (res.error !== null) {
        alert(res.error);
        return;
      }
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />
          Attachments
          {files.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">({files.length})</span>
          )}
        </h2>

        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              disabled={isPending}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              disabled={isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3 h-3" />
              {isPending ? 'Uploading…' : 'Attach file'}
            </Button>
          </>
        )}
      </div>

      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}

      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No files attached yet.{canUpload ? ' Click "Attach file" to upload.' : ''}
        </p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent/30 transition-colors group"
            >
              <FileIcon mime={f.mime_type} />

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate leading-tight">{f.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(f.file_size)} · {f.uploader.full_name} · {timeAgo(f.created_at)}
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Download"
                  disabled={downloading === f.id}
                  onClick={() => handleDownload(f.id)}
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>

                {(myAccess === 'owner' || f.uploaded_by === f.uploader.id) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Delete"
                    disabled={isPending}
                    onClick={() => handleDelete(f.id, f.file_name)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
