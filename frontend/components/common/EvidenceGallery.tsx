'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export type EvidenceKind = 'image' | 'video' | 'document';

export interface EvidenceGalleryItem {
  id: string;
  label: string;
  type: EvidenceKind;
  url: string;
  uploadedByName?: string;
  uploadedAt?: string;
}

interface EvidenceGalleryProps {
  items: EvidenceGalleryItem[];
  emptyMessage?: string;
  className?: string;
}

const KIND_ICON: Record<EvidenceKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  document: FileText,
};

function isPdf(url: string) {
  return url.toLowerCase().endsWith('.pdf');
}

function formatMeta(item: EvidenceGalleryItem) {
  if (!item.uploadedByName && !item.uploadedAt) return null;
  const date = item.uploadedAt
    ? new Date(item.uploadedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  return [item.uploadedByName, date].filter(Boolean).join(' · ');
}

export function EvidenceGallery({
  items,
  emptyMessage = 'No evidence uploaded.',
  className = '',
}: EvidenceGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  const activeItem = activeIndex != null ? items[activeIndex] : null;

  const close = useCallback(() => {
    setActiveIndex(null);
    setZoom(1);
  }, []);

  const goTo = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => {
        if (prev == null) return prev;
        return (prev + delta + items.length) % items.length;
      });
      setZoom(1);
    },
    [items.length],
  );

  useEffect(() => {
    if (activeIndex == null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') goTo(-1);
      else if (e.key === 'ArrowRight') goTo(1);
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = 'unset';
    };
  }, [activeIndex, close, goTo]);

  if (items.length === 0) {
    return <p className="text-slate-500 text-sm">{emptyMessage}</p>;
  }

  return (
    <>
      <ul className={`grid sm:grid-cols-2 gap-4 ${className}`}>
        {items.map((item, index) => {
          const Icon = KIND_ICON[item.type];
          const meta = formatMeta(item);
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col"
            >
              <button
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                  setZoom(1);
                }}
                className="aspect-video bg-slate-950/80 flex items-center justify-center relative group w-full text-left"
                aria-label={`Preview ${item.label}`}
              >
                {item.type === 'image' ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.url}
                    alt=""
                    className="max-h-full max-w-full object-contain p-4 transition-transform group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500 p-6">
                    <Icon size={40} />
                    <span className="text-xs uppercase tracking-wider">
                      {item.type}
                    </span>
                  </div>
                )}
                <span className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 border border-white/10">
                  <Icon size={14} className="text-white" />
                </span>
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-colors group-hover:bg-black/30 group-hover:opacity-100">
                  <span className="text-xs font-semibold text-white bg-black/60 px-3 py-1.5 rounded-lg">
                    Preview
                  </span>
                </span>
              </button>
              <div className="p-4 space-y-2">
                <p className="text-white font-medium text-sm leading-snug">
                  {item.label}
                </p>
                {meta && <p className="text-xs text-slate-500">{meta}</p>}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs font-semibold text-brand-accent hover:text-brand-accent/80"
                >
                  Open file
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {activeItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`Evidence preview: ${activeItem.label}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10 shrink-0">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {activeItem.label}
                  </p>
                  {formatMeta(activeItem) && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatMeta(activeItem)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {items.length > 1 && (
                    <span className="text-xs text-slate-500 px-2">
                      {(activeIndex ?? 0) + 1} / {items.length}
                    </span>
                  )}
                  {activeItem.type === 'image' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                        disabled={zoom <= 0.5}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40"
                        aria-label="Zoom out"
                      >
                        <ZoomOut size={16} />
                      </button>
                      <span className="text-xs text-slate-500 w-10 text-center">
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                        disabled={zoom >= 3}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40"
                        aria-label="Zoom in"
                      >
                        <ZoomIn size={16} />
                      </button>
                    </>
                  )}
                  <a
                    href={activeItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                    aria-label="Open in new tab"
                  >
                    <ExternalLink size={16} />
                  </a>
                  <a
                    href={activeItem.url}
                    download
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                    aria-label="Download file"
                  >
                    <Download size={16} />
                  </a>
                  <button
                    type="button"
                    onClick={close}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                    aria-label="Close preview"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="relative flex-1 overflow-auto bg-slate-950/60 flex items-center justify-center min-h-[320px]">
                {items.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => goTo(-1)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 text-white z-10"
                      aria-label="Previous evidence"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(1)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 text-white z-10"
                      aria-label="Next evidence"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}

                {activeItem.type === 'image' && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={activeItem.url}
                    alt={activeItem.label}
                    className="max-w-full max-h-full object-contain transition-transform duration-150"
                    style={{ transform: `scale(${zoom})` }}
                  />
                )}

                {activeItem.type === 'video' && (
                  <video
                    key={activeItem.id}
                    src={activeItem.url}
                    controls
                    autoPlay
                    className="max-w-full max-h-full"
                  >
                    Your browser does not support embedded video.
                  </video>
                )}

                {activeItem.type === 'document' &&
                  (isPdf(activeItem.url) ? (
                    <iframe
                      key={activeItem.id}
                      src={activeItem.url}
                      title={activeItem.label}
                      className="w-full h-full min-h-[70vh] bg-white"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-slate-500 p-10 text-center">
                      <FileText size={48} />
                      <p className="text-sm">
                        Inline preview isn&apos;t available for this file type.
                      </p>
                      <a
                        href={activeItem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-brand-accent hover:text-brand-accent/80"
                      >
                        Open file in a new tab
                      </a>
                    </div>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default EvidenceGallery;
