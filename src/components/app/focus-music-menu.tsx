"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUS_VIDEO_ID = "xAR6N9N8e6U";
const FOCUS_START_SECONDS = 2027;
const FOCUS_LOCAL_MP3 = "/media/focus.mp3";

/** Focus plays audio only — no on-screen video player. */
const FOCUS_AUDIO_ONLY = true;

function youtubeEmbedSrc(session: number) {
  const params = new URLSearchParams({
    start: String(FOCUS_START_SECONDS),
    autoplay: "1",
    controls: "0",
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
    enablejsapi: "1",
  });
  return `https://www.youtube.com/embed/${FOCUS_VIDEO_ID}?${params}&pv=${session}`;
}

export function FocusMusicMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"youtube" | "local" | null>(null);
  const [playSession, setPlaySession] = useState(0);
  const [portalReady, setPortalReady] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const youtubeActive = playing && mode === "youtube";

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  function stopFocus() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlaying(false);
    setMode(null);
  }

  async function tryLocalMp3() {
    const probe = await fetch(FOCUS_LOCAL_MP3, { method: "HEAD" });
    if (!probe.ok) return false;

    const audio = new Audio(FOCUS_LOCAL_MP3);
    audioRef.current = audio;
    try {
      audio.currentTime = FOCUS_START_SECONDS;
    } catch {
      // file may be shorter or stream may not allow seek before play
    }
    await audio.play();
    try {
      if (audio.currentTime < FOCUS_START_SECONDS - 2) {
        audio.currentTime = FOCUS_START_SECONDS;
      }
    } catch {
      // ignore
    }
    setMode("local");
    setPlaying(true);
    return true;
  }

  async function startFocus() {
    setMenuOpen(false);
    stopFocus();

    try {
      if (await tryLocalMp3()) return;
    } catch {
      // fall through to YouTube audio
    }

    setPlaySession((n) => n + 1);
    setMode("youtube");
    setPlaying(true);
  }

  function toggleFocus() {
    if (playing) {
      stopFocus();
    } else {
      void startFocus();
    }
  }

  return (
    <>
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          aria-label="Focus music"
          aria-expanded={menuOpen}
          title="Focus music"
          className={cn(
            "rounded-md p-1 text-[var(--pv-muted-2)] transition hover:bg-[var(--pv-hover)] hover:text-[var(--pv-fg)]",
            playing && "text-[var(--pv-accent-strong)]"
          )}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Music size={17} strokeWidth={2.2} />
        </button>
        {menuOpen && (
          <div
            className="absolute left-0 top-full z-[70] mt-1 min-w-[11rem] rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-card)] py-1 shadow-lg"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--pv-fg-soft)] hover:bg-[var(--pv-hover)]"
              onClick={toggleFocus}
            >
              {playing ? "Focus · stop" : "Focus"}
            </button>
          </div>
        )}
      </div>

      {FOCUS_AUDIO_ONLY &&
        youtubeActive &&
        portalReady &&
        createPortal(
          <div
            className="pointer-events-none fixed overflow-hidden opacity-0"
            style={{ left: -10000, top: 0, width: 200, height: 200 }}
            aria-hidden
          >
            <iframe
              key={playSession}
              title="Focus music"
              className="h-full w-full border-0"
              src={youtubeEmbedSrc(playSession)}
              allow="autoplay; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>,
          document.body
        )}
    </>
  );
}
