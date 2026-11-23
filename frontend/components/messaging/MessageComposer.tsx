'use client';

import { useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';

interface MessageComposerProps {
  disabled?: boolean;
  uploading: boolean;
  placeholder?: string;
  onSend: (content: string, files: File[]) => Promise<void>;
  onTyping: () => void;
}

export default function MessageComposer({
  disabled,
  uploading,
  placeholder = 'Type a message...',
  onSend,
  onTyping,
}: MessageComposerProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSend =
    !disabled && !uploading && (value.trim().length > 0 || files.length > 0);

  const submit = async () => {
    if (!canSend) return;
    const content = value;
    const attachments = files;
    setValue('');
    setFiles([]);
    try {
      await onSend(content, attachments);
    } catch {
      setValue(content);
      setFiles(attachments);
    }
  };

  return (
    <div className="border-t border-white/10 bg-white/5 p-3 sm:p-4">
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-black/20 py-1 pl-3 pr-1 text-xs text-neutral-200/80"
            >
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() =>
                  setFiles((prev) => prev.filter((_, item) => item !== index))
                }
                className="rounded-full p-1 hover:bg-white/10 cursor-pointer"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            if (selected.length) setFiles((prev) => [...prev, ...selected]);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          aria-label="Attach file"
          title="Attach file"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-neutral-200/70 hover:bg-white/10 hover:text-white disabled:opacity-40 cursor-pointer"
        >
          <Paperclip size={18} />
        </button>
        <textarea
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(event) => {
            setValue(event.target.value);
            onTyping();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-neutral-200/40 focus:border-brand-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          aria-label="Send message"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-white transition-colors hover:bg-brand-accent/80 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <Send size={17} />
        </button>
      </div>
      {uploading && (
        <p className="mt-2 text-xs text-brand-orange">
          Uploading attachments...
        </p>
      )}
    </div>
  );
}
