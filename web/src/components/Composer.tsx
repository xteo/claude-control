import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStore } from "../store.js";
import { sendToSession } from "../ws.js";
import { api } from "../api.js";
import { CLAUDE_MODES, CODEX_MODES } from "../utils/backends.js";
import type { ModeOption } from "../utils/backends.js";
import { DictationWaveform } from "./DictationWaveform.js";

let idCounter = 0;

interface ImageAttachment {
  name: string;
  base64: string;
  mediaType: string;
}

interface CommandItem {
  name: string;
  type: "command" | "skill";
}

type ClaudeModeValue = "sandbox-auto" | "sandbox-ask" | "bypassPermissions" | "plan" | "yolo";

interface ClaudeModeMenuOption {
  value: ClaudeModeValue;
  label: string;
  disabled?: boolean;
  hint?: string;
  danger?: boolean;
}

const LOCAL_COMMANDS: CommandItem[] = [{ name: "context", type: "command" }];
const DICTATION_BAR_COUNT = 56;

function readFileAsBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mediaType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function supportsDictationInBrowser(): boolean {
  return typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function mergeComposerText(existing: string, extra: string): string {
  const left = existing.trim();
  const right = extra.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

function toPermissionMode(mode: string): string {
  if (mode === "sandbox-auto") return "bypassPermissions";
  if (mode === "sandbox-ask") return "default";
  if (mode === "yolo") return "bypassPermissions";
  return mode;
}

function defaultWaveform(): number[] {
  return Array.from({ length: DICTATION_BAR_COUNT }, (_, i) => 0.01 + ((i % 5) * 0.005));
}

export function Composer({ sessionId }: { sessionId: string }) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [dictationStatus, setDictationStatus] = useState<"idle" | "recording" | "transcribing">("idle");
  const [dictationLevels, setDictationLevels] = useState<number[]>(() => defaultWaveform());
  const [dictationSeconds, setDictationSeconds] = useState(0);
  const [showStopDictationHint, setShowStopDictationHint] = useState(false);
  const [queueSendAfterTranscription, setQueueSendAfterTranscription] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformRafRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const queuedSendRef = useRef(false);
  const cliConnected = useStore((s) => s.cliConnected);
  const sessionData = useStore((s) => s.sessions.get(sessionId));
  const sdkSession = useStore((s) => s.sdkSessions.find((sdk) => sdk.sessionId === sessionId));
  const previousMode = useStore((s) => s.previousPermissionMode.get(sessionId) || "bypassPermissions");

  const isConnected = cliConnected.get(sessionId) ?? false;
  const currentPermissionMode = sessionData?.permissionMode || "acceptEdits";
  const isPlan = currentPermissionMode === "plan";
  const isCodex = sessionData?.backend_type === "codex";
  const modes: ModeOption[] = isCodex ? CODEX_MODES : CLAUDE_MODES;
  const sandboxMode = sdkSession?.sandboxMode ?? "off";
  const isYoloSession = sdkSession?.dangerouslySkipPermissions === true;
  const isRecording = dictationStatus === "recording";
  const isTranscribing = dictationStatus === "transcribing";
  const canUseMic = supportsDictationInBrowser();

  const claudeDisplayMode: ClaudeModeValue = useMemo(() => {
    if (isPlan) return "plan";
    if (isYoloSession) return "yolo";
    if (sandboxMode === "auto-allow") return "sandbox-auto";
    if (sandboxMode === "ask-first") return "sandbox-ask";
    if (currentPermissionMode === "bypassPermissions" && previousMode === "yolo") return "yolo";
    if (currentPermissionMode === "bypassPermissions") return "bypassPermissions";
    return "sandbox-ask";
  }, [currentPermissionMode, isPlan, isYoloSession, previousMode, sandboxMode]);

  const modeLabel = useMemo(() => {
    if (isCodex) {
      return modes.find((m) => m.value === currentPermissionMode)?.label?.toLowerCase() || currentPermissionMode;
    }
    return modes.find((m) => m.value === claudeDisplayMode)?.label?.toLowerCase() || claudeDisplayMode;
  }, [claudeDisplayMode, currentPermissionMode, isCodex, modes]);

  const claudeModeOptions = useMemo<ClaudeModeMenuOption[]>(() => {
    const sandboxUnavailable = sandboxMode === "off";
    return [
      {
        value: "sandbox-auto",
        label: "Sandbox",
        disabled: sandboxUnavailable,
        hint: sandboxUnavailable ? "Start a new conversation in Sandbox mode" : undefined,
      },
      {
        value: "sandbox-ask",
        label: "Sandbox (Ask)",
        disabled: sandboxUnavailable,
        hint: sandboxUnavailable ? "Start a new conversation in Sandbox mode" : undefined,
      },
      { value: "bypassPermissions", label: "Agent" },
      { value: "plan", label: "Plan" },
      {
        value: "yolo",
        label: "YOLO",
        danger: true,
      },
    ];
  }, [sandboxMode]);

  // Build command list from session data
  const allCommands = useMemo<CommandItem[]>(() => {
    const cmds: CommandItem[] = [...LOCAL_COMMANDS];
    const seen = new Set<string>(cmds.map((cmd) => cmd.name));
    if (sessionData?.slash_commands) {
      for (const cmd of sessionData.slash_commands) {
        if (seen.has(cmd)) continue;
        cmds.push({ name: cmd, type: "command" });
        seen.add(cmd);
      }
    }
    if (sessionData?.skills) {
      for (const skill of sessionData.skills) {
        if (seen.has(skill)) continue;
        cmds.push({ name: skill, type: "skill" });
        seen.add(skill);
      }
    }
    return cmds;
  }, [sessionData?.slash_commands, sessionData?.skills]);

  // Filter commands based on what the user typed after /
  const filteredCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    const match = text.match(/^\/(\S*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    if (query === "") return allCommands;
    return allCommands.filter((cmd) => cmd.name.toLowerCase().includes(query));
  }, [text, slashMenuOpen, allCommands]);

  useEffect(() => {
    queuedSendRef.current = queueSendAfterTranscription;
  }, [queueSendAfterTranscription]);

  // Open/close slash menu based on text
  useEffect(() => {
    const shouldOpen = text.startsWith("/") && /^\/\S*$/.test(text) && allCommands.length > 0;
    if (shouldOpen && !slashMenuOpen) {
      setSlashMenuOpen(true);
      setSlashMenuIndex(0);
    } else if (!shouldOpen && slashMenuOpen) {
      setSlashMenuOpen(false);
    }
  }, [text, allCommands.length, slashMenuOpen]);

  // Keep selected slash item in bounds
  useEffect(() => {
    if (slashMenuIndex >= filteredCommands.length) {
      setSlashMenuIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, slashMenuIndex]);

  // Scroll selected slash command into view
  useEffect(() => {
    if (!menuRef.current || !slashMenuOpen) return;
    const items = menuRef.current.querySelectorAll("[data-cmd-index]");
    const selected = items[slashMenuIndex];
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [slashMenuIndex, slashMenuOpen]);

  // Close mode dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false);
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, []);

  // Dictation timer
  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setDictationSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  // Auto-hide stop hint bubble
  useEffect(() => {
    if (!showStopDictationHint || !isRecording) return;
    const timeout = window.setTimeout(() => setShowStopDictationHint(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [isRecording, showStopDictationHint]);

  // Cleanup dictation resources on unmount
  useEffect(() => {
    return () => {
      if (waveformRafRef.current !== null) {
        window.cancelAnimationFrame(waveformRafRef.current);
        waveformRafRef.current = null;
      }
      mediaRecorderRef.current = null;
      analyserRef.current = null;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  const selectCommand = useCallback((cmd: CommandItem) => {
    setText(`/${cmd.name} `);
    setSlashMenuOpen(false);
    textareaRef.current?.focus();
  }, []);

  function appendSystemMessage(content: string) {
    useStore.getState().appendMessage(sessionId, {
      id: `sys-${Date.now()}-${++idCounter}`,
      role: "system",
      content,
      timestamp: Date.now(),
    });
  }

  function appendContextMessage() {
    const used = sessionData?.context_used_percent;
    const usedClamped = typeof used === "number" ? Math.max(0, Math.min(100, Math.round(used))) : null;
    const remainingClamped = usedClamped === null ? null : Math.max(0, 100 - usedClamped);
    const content = usedClamped === null
      ? "Context usage for this session is not available yet."
      : `Context usage for this session: ${usedClamped}% used (${remainingClamped}% remaining).`;

    appendSystemMessage(content);
  }

  function syncTextareaHeight() {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
  }

  function resetComposerInput() {
    setText("");
    setImages([]);
    setSlashMenuOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function runLocalContextCommand() {
    appendContextMessage();
    resetComposerInput();
    textareaRef.current?.focus();
  }

  function sendUserMessage(rawMessage: string) {
    const msg = rawMessage.trim();
    if (!msg || !isConnected) return;

    const command = msg.startsWith("/") ? msg.slice(1).split(/\s+/)[0]?.toLowerCase() : "";
    if (command === "context") {
      runLocalContextCommand();
      return;
    }

    sendToSession(sessionId, {
      type: "user_message",
      content: msg,
      session_id: sessionId,
      images: images.length > 0 ? images.map((img) => ({ media_type: img.mediaType, data: img.base64 })) : undefined,
    });

    useStore.getState().appendMessage(sessionId, {
      id: `user-${Date.now()}-${++idCounter}`,
      role: "user",
      content: msg,
      images: images.length > 0 ? images.map((img) => ({ media_type: img.mediaType, data: img.base64 })) : undefined,
      timestamp: Date.now(),
    });

    resetComposerInput();
    textareaRef.current?.focus();
  }

  function cleanupDictationResources() {
    if (waveformRafRef.current !== null) {
      window.cancelAnimationFrame(waveformRafRef.current);
      waveformRafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
    recordedChunksRef.current = [];
    setDictationLevels(defaultWaveform());
  }

  async function startDictation() {
    if (!isConnected || isRecording || isTranscribing) return;
    if (!canUseMic) {
      appendSystemMessage("Microphone dictation is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const recorderOptions: MediaRecorderOptions = {};
      if (typeof MediaRecorder.isTypeSupported === "function") {
        const preferredMimeTypes = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ];
        const selectedMimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
        if (selectedMimeType) recorderOptions.mimeType = selectedMimeType;
      }
      const recorder = Object.keys(recorderOptions).length > 0
        ? new MediaRecorder(stream, recorderOptions)
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;

        const timeData = new Uint8Array(analyser.fftSize);
        let lastPaint = 0;
        const tick = (timestamp: number) => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(timeData);
          let sumSquares = 0;
          for (let i = 0; i < timeData.length; i += 1) {
            const centered = (timeData[i] - 128) / 128;
            sumSquares += centered * centered;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);
          const normalized = Math.min(1, Math.max(0.02, rms * 7));

          if (timestamp - lastPaint >= 45) {
            setDictationLevels((prev) => {
              const next = prev.slice(1);
              next.push(normalized);
              return next;
            });
            lastPaint = timestamp;
          }

          waveformRafRef.current = window.requestAnimationFrame(tick);
        };
        waveformRafRef.current = window.requestAnimationFrame(tick);
      }

      recorder.start(140);
      setDictationSeconds(0);
      setQueueSendAfterTranscription(false);
      queuedSendRef.current = false;
      setShowStopDictationHint(true);
      setDictationStatus("recording");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      appendSystemMessage(`Unable to start microphone dictation: ${reason}`);
      cleanupDictationResources();
      setDictationStatus("idle");
    }
  }

  function stopDictationCapture(): Promise<Blob | null> {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return Promise.resolve(null);

    setShowStopDictationHint(false);
    setDictationStatus("transcribing");

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        cleanupDictationResources();
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.addEventListener("stop", finish, { once: true });
      try {
        recorder.stop();
      } catch {
        finish();
      }
    });
  }

  async function transcribeAndApply(blob: Blob, forceSend: boolean) {
    try {
      const preferredLanguage = typeof navigator !== "undefined" && navigator.language
        ? navigator.language.split("-")[0]
        : undefined;
      const result = await api.transcribeAudio(blob, preferredLanguage);
      const transcript = (result.text || "").trim();

      if (!transcript) {
        appendSystemMessage("Dictation captured audio, but no speech was recognized.");
        return;
      }

      const merged = mergeComposerText(text, transcript);
      setText(merged);
      window.requestAnimationFrame(() => syncTextareaHeight());

      if (forceSend || queuedSendRef.current) {
        sendUserMessage(merged);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      appendSystemMessage(`Dictation failed: ${reason}`);
    } finally {
      setDictationStatus("idle");
      setQueueSendAfterTranscription(false);
      queuedSendRef.current = false;
      textareaRef.current?.focus();
    }
  }

  async function stopDictationAndTranscribe(forceSend: boolean) {
    const blob = await stopDictationCapture();
    if (!blob) {
      setDictationStatus("idle");
      if (forceSend || queuedSendRef.current) {
        appendSystemMessage("Dictation stopped without captured audio.");
      }
      setQueueSendAfterTranscription(false);
      queuedSendRef.current = false;
      return;
    }
    await transcribeAndApply(blob, forceSend);
  }

  function handleSend() {
    if (isRecording) {
      void stopDictationAndTranscribe(true);
      return;
    }
    if (isTranscribing) {
      setQueueSendAfterTranscription(true);
      queuedSendRef.current = true;
      return;
    }
    sendUserMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Slash menu navigation
    if (slashMenuOpen && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashMenuIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashMenuIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        selectCommand(filteredCommands[slashMenuIndex]);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const selected = filteredCommands[slashMenuIndex];
        if (selected?.name === "context") {
          runLocalContextCommand();
          return;
        }
        selectCommand(filteredCommands[slashMenuIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }

    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      toggleMode();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }

  function handleInterrupt() {
    sendToSession(sessionId, { type: "interrupt" });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newImages: ImageAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const { base64, mediaType } = await readFileAsBase64(file);
      newImages.push({ name: file.name, base64, mediaType });
    }
    setImages((prev) => [...prev, ...newImages]);
    e.target.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const newImages: ImageAttachment[] = [];
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      const { base64, mediaType } = await readFileAsBase64(file);
      newImages.push({ name: `pasted-${Date.now()}.${file.type.split("/")[1]}`, base64, mediaType });
    }
    if (newImages.length > 0) {
      e.preventDefault();
      setImages((prev) => [...prev, ...newImages]);
    }
  }

  function applyClaudeMode(mode: ClaudeModeValue) {
    if (!isConnected) return;
    const store = useStore.getState();

    if ((mode === "sandbox-auto" || mode === "sandbox-ask") && sandboxMode === "off") {
      appendSystemMessage("Sandbox mode can only be enabled when starting a new conversation.");
      return;
    }
    if (mode === "plan") {
      store.setPreviousPermissionMode(sessionId, claudeDisplayMode);
      sendToSession(sessionId, { type: "set_permission_mode", mode: "plan" });
      store.updateSession(sessionId, { permissionMode: "plan" });
      return;
    }

    const nextPermissionMode = toPermissionMode(mode);
    sendToSession(sessionId, { type: "set_permission_mode", mode: nextPermissionMode });
    store.updateSession(sessionId, { permissionMode: nextPermissionMode });
    store.setPreviousPermissionMode(sessionId, mode);
  }

  function toggleMode() {
    if (!isConnected || isCodex) return;
    const store = useStore.getState();
    if (!isPlan) {
      store.setPreviousPermissionMode(sessionId, claudeDisplayMode);
      sendToSession(sessionId, { type: "set_permission_mode", mode: "plan" });
      store.updateSession(sessionId, { permissionMode: "plan" });
    } else {
      const restoreMode = toPermissionMode(previousMode || "bypassPermissions");
      sendToSession(sessionId, { type: "set_permission_mode", mode: restoreMode });
      store.updateSession(sessionId, { permissionMode: restoreMode });
    }
  }

  const sessionStatus = useStore((s) => s.sessionStatus);
  const isRunning = sessionStatus.get(sessionId) === "running";
  const canSend = isConnected && (isRecording || isTranscribing || text.trim().length > 0);

  return (
    <div className="shrink-0 border-t border-cc-border bg-cc-card px-2 sm:px-4 py-2 sm:py-3">
      <div className="max-w-3xl mx-auto">
        {/* Image thumbnails */}
        {images.length > 0 && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={`data:${img.mediaType};base64,${img.base64}`}
                  alt={img.name}
                  className="w-12 h-12 rounded-lg object-cover border border-cc-border"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-cc-error text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Unified input card */}
        <div className={`relative bg-cc-input-bg border rounded-[14px] overflow-visible transition-colors ${
          isPlan
            ? "border-cc-primary/40"
            : "border-cc-border focus-within:border-cc-primary/30"
        }`}>
          {/* Slash command menu */}
          {slashMenuOpen && filteredCommands.length > 0 && (
            <div
              ref={menuRef}
              className="absolute left-2 right-2 bottom-full mb-1 max-h-[240px] overflow-y-auto bg-cc-card border border-cc-border rounded-[10px] shadow-lg z-20 py-1"
            >
              {filteredCommands.map((cmd, i) => (
                <button
                  key={`${cmd.type}-${cmd.name}`}
                  data-cmd-index={i}
                  onClick={() => selectCommand(cmd)}
                  className={`w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                    i === slashMenuIndex
                      ? "bg-cc-hover"
                      : "hover:bg-cc-hover/50"
                  }`}
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-md bg-cc-hover text-cc-muted shrink-0">
                    {cmd.type === "skill" ? (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M8 1l1.796 3.64L14 5.255l-3 2.924.708 4.126L8 10.5l-3.708 1.805L5 8.18 2 5.255l4.204-.615L8 1z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                        <path d="M5 12L10 4" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium text-cc-fg">/{cmd.name}</span>
                    <span className="ml-2 text-[11px] text-cc-muted">{cmd.type}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isConnected ? "Type a message... (/ for commands)" : "Waiting for CLI connection..."}
            disabled={!isConnected}
            rows={1}
            className="w-full px-4 pt-3 pb-1 text-base sm:text-sm bg-transparent resize-none focus:outline-none text-cc-fg font-sans-ui placeholder:text-cc-muted disabled:opacity-50"
            style={{ minHeight: "36px", maxHeight: "200px" }}
          />

          {/* Git branch + lines info */}
          {sessionData?.git_branch && (
            <div className="flex items-center gap-2 px-2 sm:px-4 pb-1 text-[11px] text-cc-muted overflow-hidden">
              <span className="flex items-center gap-1 truncate min-w-0">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 opacity-60">
                  <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.116.862a2.25 2.25 0 10-.862.862A4.48 4.48 0 007.25 7.5h-1.5A2.25 2.25 0 003.5 9.75v.318a2.25 2.25 0 101.5 0V9.75a.75.75 0 01.75-.75h1.5a5.98 5.98 0 003.884-1.435A2.25 2.25 0 109.634 3.362zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
                </svg>
                <span className="truncate max-w-[100px] sm:max-w-[160px]">{sessionData.git_branch}</span>
                {sessionData.is_worktree && (
                  <span className="text-[10px] bg-cc-primary/10 text-cc-primary px-1 rounded">worktree</span>
                )}
              </span>
              {((sessionData.git_ahead || 0) > 0 || (sessionData.git_behind || 0) > 0) && (
                <span className="flex items-center gap-0.5 text-[10px]">
                  {(sessionData.git_ahead || 0) > 0 && <span className="text-cc-success">{sessionData.git_ahead}&#8593;</span>}
                  {(sessionData.git_behind || 0) > 0 && (
                    <button
                      className="text-cc-warning hover:text-cc-warning/80 cursor-pointer hover:underline"
                      title="Pull latest changes"
                      onClick={() => {
                        const cwd = sessionData.repo_root || sessionData.cwd;
                        if (!cwd) return;
                        api.gitPull(cwd).then((r) => {
                          useStore.getState().updateSession(sessionId, {
                            git_ahead: r.git_ahead,
                            git_behind: r.git_behind,
                          });
                          if (!r.success) console.warn("[git pull]", r.output);
                        }).catch((e) => console.error("[git pull]", e));
                      }}
                    >
                      {sessionData.git_behind}&#8595;
                    </button>
                  )}
                </span>
              )}
              {((sessionData.total_lines_added || 0) > 0 || (sessionData.total_lines_removed || 0) > 0) && (
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-cc-success">+{sessionData.total_lines_added || 0}</span>
                  <span className="text-cc-error">-{sessionData.total_lines_removed || 0}</span>
                </span>
              )}
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-2.5 pb-2.5 gap-2">
            {/* Left: mode dropdown */}
            <div className="relative" ref={modeDropdownRef}>
              <button
                onClick={() => !isCodex && isConnected && setShowModeDropdown((open) => !open)}
                disabled={!isConnected || isCodex}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium transition-all select-none ${
                  !isConnected || isCodex
                    ? "opacity-30 cursor-not-allowed text-cc-muted"
                    : isPlan
                    ? "text-cc-primary hover:bg-cc-primary/10 cursor-pointer"
                    : claudeDisplayMode === "yolo"
                      ? "text-red-500 hover:bg-red-500/10 cursor-pointer"
                      : "text-cc-muted hover:text-cc-fg hover:bg-cc-hover cursor-pointer"
                }`}
                title={isCodex ? "Mode is fixed for Codex sessions" : "Choose mode (Shift+Tab toggles Plan)"}
              >
                {isPlan ? (
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <rect x="3" y="3" width="3.5" height="10" rx="0.75" />
                    <rect x="9.5" y="3" width="3.5" height="10" rx="0.75" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M2.5 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d="M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                )}
                <span>{modeLabel}</span>
                {!isCodex && (
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-60">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                )}
              </button>

              {showModeDropdown && !isCodex && (
                <div className="absolute left-0 bottom-full mb-1 w-52 bg-cc-card border border-cc-border rounded-[10px] shadow-lg z-20 py-1 overflow-hidden">
                  {claudeModeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        if (opt.disabled) return;
                        applyClaudeMode(opt.value);
                        setShowModeDropdown(false);
                      }}
                      disabled={opt.disabled}
                      className={`w-full px-3 py-2 text-xs text-left transition-colors flex items-start gap-2 ${
                        opt.disabled
                          ? "text-cc-muted/50 cursor-not-allowed"
                          : opt.value === claudeDisplayMode
                            ? "text-cc-primary font-medium bg-cc-hover/60"
                            : opt.danger
                              ? "text-red-500 hover:bg-red-500/10 cursor-pointer"
                              : "text-cc-fg hover:bg-cc-hover cursor-pointer"
                      }`}
                    >
                      <span className="mt-[2px] shrink-0">
                        {opt.value.startsWith("sandbox-") ? (
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-green-600 dark:text-green-400">
                            <path d="M8 1a3.5 3.5 0 00-3.5 3.5V6H3a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V7a1 1 0 00-1-1h-1.5V4.5A3.5 3.5 0 008 1zm2 5V4.5a2 2 0 10-4 0V6h4z" />
                          </svg>
                        ) : opt.value === "yolo" ? (
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-red-500">
                            <path d="M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
                            <path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block">{opt.label}</span>
                        {opt.hint && <span className="block mt-0.5 text-[10px] text-cc-muted">{opt.hint}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: mic + image + send/stop */}
            <div className="flex items-center gap-1 min-w-0">
              <div className="relative w-8 h-8 shrink-0">
                {isRecording || isTranscribing ? (
                  <div className="absolute right-0 top-0 flex items-center gap-2 h-8 rounded-full border border-cc-border bg-cc-card pl-2 pr-1 min-w-[165px] sm:min-w-[240px] z-10">
                    <DictationWaveform levels={dictationLevels} active={isRecording} />
                    <span className="text-[12px] tabular-nums text-cc-muted shrink-0">
                      {isTranscribing ? "..." : formatDuration(dictationSeconds)}
                    </span>
                    <div className="relative">
                      {isRecording && showStopDictationHint && (
                        <div className="absolute bottom-full right-0 mb-1.5 px-2 py-1 rounded-full border border-cc-border bg-cc-card text-[11px] text-cc-fg whitespace-nowrap shadow-sm">
                          Stop dictation
                        </div>
                      )}
                      <button
                        onClick={() => {
                          if (isRecording) void stopDictationAndTranscribe(false);
                        }}
                        disabled={!isRecording}
                        className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                          isRecording
                            ? "bg-cc-hover hover:bg-cc-hover/80 text-cc-fg cursor-pointer"
                            : "bg-cc-hover text-cc-muted cursor-not-allowed"
                        }`}
                        title={isRecording ? "Stop dictation" : "Transcribing"}
                      >
                        {isRecording ? (
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <rect x="3" y="3" width="10" height="10" rx="1.2" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 animate-spin">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="30" strokeDashoffset="10" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => void startDictation()}
                    disabled={!isConnected || !canUseMic}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                      isConnected && canUseMic
                        ? "text-cc-muted hover:text-cc-fg hover:bg-cc-hover cursor-pointer"
                        : "text-cc-muted opacity-30 cursor-not-allowed"
                    }`}
                    title={canUseMic ? "Start dictation" : "Microphone not available"}
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path d="M8 1a2.5 2.5 0 00-2.5 2.5v4a2.5 2.5 0 105 0v-4A2.5 2.5 0 008 1zm-4 6.5a.75.75 0 011.5 0 2.5 2.5 0 005 0 .75.75 0 011.5 0A4 4 0 019 11.373V13h2a.75.75 0 010 1.5H5a.75.75 0 010-1.5h2v-1.627A4 4 0 014 7.5z" />
                    </svg>
                  </button>
                )}
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                  isConnected
                    ? "text-cc-muted hover:text-cc-fg hover:bg-cc-hover cursor-pointer"
                    : "text-cc-muted opacity-30 cursor-not-allowed"
                }`}
                title="Upload image"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                  <rect x="2" y="2" width="12" height="12" rx="2" />
                  <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
                  <path d="M2 11l3-3 2 2 3-4 4 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isRunning ? (
                <button
                  onClick={handleInterrupt}
                  className="flex items-center justify-center w-8 h-8 rounded-lg bg-cc-error/10 hover:bg-cc-error/20 text-cc-error transition-colors cursor-pointer"
                  title="Stop generation"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <rect x="3" y="3" width="10" height="10" rx="1" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                    canSend
                      ? "bg-cc-primary hover:bg-cc-primary-hover text-white cursor-pointer"
                      : "bg-cc-hover text-cc-muted cursor-not-allowed"
                  }`}
                  title="Send message"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M3 2l11 6-11 6V9.5l7-1.5-7-1.5V2z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
