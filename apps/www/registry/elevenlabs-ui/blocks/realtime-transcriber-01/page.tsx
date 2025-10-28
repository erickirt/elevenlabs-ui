"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useScribe } from "@elevenlabs/react"
import { AnimatePresence, motion } from "framer-motion"
import { Copy, GaugeCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDebounce } from "@/registry/elevenlabs-ui/hooks/use-debounce"
import { usePrevious } from "@/registry/elevenlabs-ui/hooks/use-previous"
import { Button } from "@/registry/elevenlabs-ui/ui/button"
import { ShimmeringText } from "@/registry/elevenlabs-ui/ui/shimmering-text"

import { getScribeToken } from "./actions/get-scribe-token"
import { LanguageSelector } from "./components/language-selector"

interface RecordingState {
  error: string
  latenciesMs: number[]
}

const TranscriptCharacter = React.memo(
  ({ char, delay }: { char: string; delay: number }) => {
    return (
      <motion.span
        initial={{ filter: `blur(3.5px)`, opacity: 0 }}
        animate={{ filter: `none`, opacity: 1 }}
        transition={{ duration: 0.5, delay }}
        style={{ willChange: delay > 0 ? "filter, opacity" : "auto" }}
      >
        {char}
      </motion.span>
    )
  }
)
TranscriptCharacter.displayName = "TranscriptCharacter"

// Memoize background effects to prevent re-renders
const BackgroundAura = React.memo(
  ({ status, isConnected }: { status: string; isConnected: boolean }) => {
    return (
      <div
        className={cn(
          "pointer-events-none fixed inset-0 opacity-0 transition-opacity duration-700 ease-out",
          status === "connecting" && "opacity-40 duration-500 ease-in",
          isConnected && "opacity-100 duration-700 ease-in"
        )}
      >
        {/* Center bottom pool - main glow */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: "130%",
            height: "20vh",
            background:
              "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(34, 211, 238, 0.5) 0%, rgba(168, 85, 247, 0.4) 35%, rgba(251, 146, 60, 0.5) 70%, transparent 100%)",
            filter: "blur(80px)",
          }}
        />

        {/* Pulsing layer */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 animate-pulse"
          style={{
            width: "100%",
            height: "18vh",
            background:
              "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(134, 239, 172, 0.5) 0%, rgba(192, 132, 252, 0.4) 50%, transparent 100%)",
            filter: "blur(60px)",
            animationDuration: "4s",
          }}
        />

        {/* Left corner bloom */}
        <div
          className="absolute bottom-0 left-0"
          style={{
            width: "25vw",
            height: "30vh",
            background:
              "radial-gradient(circle at 0% 100%, rgba(34, 211, 238, 0.5) 0%, rgba(134, 239, 172, 0.3) 30%, transparent 60%)",
            filter: "blur(70px)",
          }}
        />

        {/* Left rising glow - organic curve */}
        <div
          className="absolute bottom-0 -left-8"
          style={{
            width: "20vw",
            height: "45vh",
            background:
              "radial-gradient(ellipse 50% 100% at 10% 100%, rgba(34, 211, 238, 0.4) 0%, rgba(134, 239, 172, 0.25) 25%, transparent 60%)",
            filter: "blur(60px)",
            animation: "pulseGlow 5s ease-in-out infinite alternate",
          }}
        />

        {/* Right corner bloom */}
        <div
          className="absolute right-0 bottom-0"
          style={{
            width: "25vw",
            height: "30vh",
            background:
              "radial-gradient(circle at 100% 100%, rgba(251, 146, 60, 0.5) 0%, rgba(251, 146, 60, 0.3) 30%, transparent 60%)",
            filter: "blur(70px)",
          }}
        />

        {/* Right rising glow - organic curve */}
        <div
          className="absolute -right-8 bottom-0"
          style={{
            width: "20vw",
            height: "45vh",
            background:
              "radial-gradient(ellipse 50% 100% at 90% 100%, rgba(251, 146, 60, 0.4) 0%, rgba(192, 132, 252, 0.25) 25%, transparent 60%)",
            filter: "blur(60px)",
            animation: "pulseGlow 5s ease-in-out infinite alternate-reverse",
          }}
        />

        {/* Shimmer overlay */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: "100%",
            height: "15vh",
            background:
              "linear-gradient(90deg, rgba(34, 211, 238, 0.3) 0%, rgba(168, 85, 247, 0.3) 30%, rgba(251, 146, 60, 0.3) 60%, rgba(134, 239, 172, 0.3) 100%)",
            filter: "blur(30px)",
            animation: "shimmer 8s linear infinite",
          }}
        />
      </div>
    )
  }
)
BackgroundAura.displayName = "BackgroundAura"

// Memoize bottom controls with comparison function
const BottomControls = React.memo(
  ({
    isConnected,
    hasError,
    averageLatency,
    isMac,
    onStop,
  }: {
    isConnected: boolean
    hasError: boolean
    averageLatency: number
    isMac: boolean
    onStop: () => void
  }) => {
    return (
      <AnimatePresence mode="popLayout">
        {isConnected && !hasError && (
          <motion.div
            key="bottom-controls"
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: 0.25, delay: 0.2 },
            }}
            exit={{
              opacity: 0,
              y: 20,
              transition: { duration: 0.35 },
            }}
            className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2"
          >
            {/* Latency badge - always present, starts at 0 */}
            <LatencyBadge averageLatency={averageLatency} />

            {/* Stop button - always present */}
            <button
              onClick={onStop}
              className="bg-foreground text-background border-foreground/10 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg transition-opacity hover:opacity-90"
            >
              Stop
              <kbd className="border-background/20 bg-background/10 inline-flex h-5 items-center rounded border px-1.5 font-mono text-xs">
                {isMac ? "⌘K" : "Ctrl+K"}
              </kbd>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    )
  },
  (prev, next) => {
    // Return true to SKIP re-render (props are equal)
    // Return false to re-render (props changed)
    if (prev.isConnected !== next.isConnected) return false
    if (prev.hasError !== next.hasError) return false
    if (prev.isMac !== next.isMac) return false

    // Only update latency if it changes by more than 5ms
    return Math.abs(prev.averageLatency - next.averageLatency) < 5
  }
)
BottomControls.displayName = "BottomControls"

// Separate latency badge to prevent icon re-renders
const LatencyBadge = React.memo(
  ({ averageLatency }: { averageLatency: number }) => {
    return (
      <div className="bg-foreground text-background border-foreground/10 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium tabular-nums shadow-lg">
        <GaugeCircleIcon className="h-4 w-4" />
        {averageLatency} ms
      </div>
    )
  },
  (prev, next) => {
    // Return true to SKIP re-render
    // Only re-render if latency changes by 3ms or more
    return Math.abs(prev.averageLatency - next.averageLatency) < 3
  }
)
LatencyBadge.displayName = "LatencyBadge"

export default function RealtimeTranscriber01() {
  const [recording, setRecording] = useState<RecordingState>({
    error: "",
    latenciesMs: [],
  })
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)

  // Detect platform for keyboard shortcut display
  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent))
  }, [])

  const segmentStartMsRef = useRef<number | null>(null)
  const lastTranscriptRef = useRef<string>("")

  // Audio refs for sound effects
  const startSoundRef = useRef<HTMLAudioElement | null>(null)
  const endSoundRef = useRef<HTMLAudioElement | null>(null)
  const errorSoundRef = useRef<HTMLAudioElement | null>(null)

  // Guards to prevent race conditions
  const isOperatingRef = useRef(false)
  const shouldBeConnectedRef = useRef(false) // Tracks desired connection state
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Memoize callbacks to prevent useScribe from re-running
  const onPartialTranscript = useCallback((data: { text?: string }) => {
    const currentText = data.text || ""

    // Skip if text hasn't changed (prevents re-renders on duplicate events)
    if (currentText === lastTranscriptRef.current) {
      return
    }

    lastTranscriptRef.current = currentText

    // Record latency if we have a start time - mimics xi's recordLatency
    if (currentText.length > 0 && segmentStartMsRef.current != null) {
      const latency = performance.now() - segmentStartMsRef.current
      console.log("[Scribe] Partial latency:", latency, "ms")
      setRecording((prev) => ({
        ...prev,
        latenciesMs: [...prev.latenciesMs.slice(-29), latency],
      }))
      // Reset to null like xi does - next audio will set it again
      segmentStartMsRef.current = null
    }
  }, [])

  const onFinalTranscript = useCallback((data: { text?: string }) => {
    // Reset last transcript on final
    lastTranscriptRef.current = ""

    // Record latency if we have a start time - mimics xi's recordLatency
    if (
      data.text &&
      data.text.length > 0 &&
      segmentStartMsRef.current != null
    ) {
      const latency = performance.now() - segmentStartMsRef.current
      console.log("[Scribe] Final latency:", latency, "ms")
      setRecording((prev) => ({
        ...prev,
        latenciesMs: [...prev.latenciesMs.slice(-29), latency],
      }))
    }
    // Reset to null like xi does
    segmentStartMsRef.current = null
  }, [])

  const onError = useCallback((error: Error | Event) => {
    console.error("[Scribe] Error:", error)
    const errorMessage =
      error instanceof Error ? error.message : "Transcription error"

    // Clear any existing error timeout
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
    }

    // Only show errors that persist for more than 500ms (debounce transient errors)
    errorTimeoutRef.current = setTimeout(() => {
      setRecording((prev) => ({
        ...prev,
        error: errorMessage,
      }))
      // Play error sound
      errorSoundRef.current?.play().catch(() => {})
    }, 500)
  }, [])

  // Memoize the configuration object to prevent useScribe from re-initializing
  const scribeConfig = useMemo(
    () => ({
      modelId: "scribe_realtime_v2" as const,
      onPartialTranscript,
      onFinalTranscript,
      onError,
    }),
    [onPartialTranscript, onFinalTranscript, onError]
  )

  const scribe = useScribe(scribeConfig)

  // Simulate audio chunk timing - set timer when likely sending audio
  useEffect(() => {
    if (!scribe.isConnected) return

    // While connected, continuously set timer to simulate audio chunks being sent
    // This approximates xi's sendAudioChunk behavior
    const interval = setInterval(() => {
      // Only set if null (like xi does: if (this.segmentStartMs == null))
      if (segmentStartMsRef.current === null) {
        segmentStartMsRef.current = performance.now()
        console.log("[Scribe] Timer set (simulating audio chunk)")
      }
    }, 100) // Check every 100ms (audio chunks are typically sent frequently)

    return () => clearInterval(interval)
  }, [scribe.isConnected])

  const handleToggleRecording = useCallback(async () => {
    // Handle disconnect request
    if (scribe.isConnected || scribe.status === "connecting") {
      console.log("[Scribe] Disconnect requested")
      shouldBeConnectedRef.current = false
      isOperatingRef.current = true // Prevent re-entry during disconnect

      // Clear any pending error timeouts
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
        errorTimeoutRef.current = null
      }

      // Disconnect immediately
      console.log("[Scribe] Disconnecting...")
      scribe.disconnect()
      scribe.clearTranscripts()
      segmentStartMsRef.current = null
      setRecording((prev) => ({ ...prev, latenciesMs: [], error: "" }))

      // Play end sound (reset first for reliability)
      if (endSoundRef.current) {
        endSoundRef.current.currentTime = 0
        endSoundRef.current.play().catch(() => {})
      }

      // Reset operating flag after a short delay
      setTimeout(() => {
        isOperatingRef.current = false
      }, 300)
      return
    }

    // Prevent multiple simultaneous connect operations
    if (isOperatingRef.current) {
      console.log("[Scribe] Operation already in progress, ignoring")
      return
    }

    shouldBeConnectedRef.current = true
    isOperatingRef.current = true

    try {
      console.log("[Scribe] Fetching token...")

      // Clear any pending error timeouts
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
        errorTimeoutRef.current = null
      }
      setRecording((prev) => ({ ...prev, error: "", latenciesMs: [] }))
      segmentStartMsRef.current = null

      const result = await getScribeToken()

      // Check if user still wants to connect after token fetch
      if (!shouldBeConnectedRef.current) {
        console.log("[Scribe] User cancelled during token fetch")
        return
      }

      if (result.error || !result.token) {
        throw new Error(result.error || "Failed to get token")
      }

      console.log("[Scribe] Connecting...")
      await scribe.connect({
        token: result.token,
        languageCode: selectedLanguage || undefined,
        microphone: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      })

      console.log("[Scribe] Connected successfully")

      // Check if user still wants to be connected
      if (!shouldBeConnectedRef.current) {
        console.log(
          "[Scribe] User cancelled during connection, disconnecting..."
        )
        scribe.disconnect()
        scribe.clearTranscripts()
        segmentStartMsRef.current = null
        setRecording((prev) => ({ ...prev, latenciesMs: [], error: "" }))
        if (endSoundRef.current) {
          endSoundRef.current.currentTime = 0
          endSoundRef.current.play().catch(() => {})
        }
        return
      }

      // Play start sound with a small delay for reliability
      setTimeout(() => {
        if (
          shouldBeConnectedRef.current &&
          scribe.isConnected &&
          startSoundRef.current
        ) {
          console.log("[Scribe] Playing start sound")
          startSoundRef.current.currentTime = 0
          startSoundRef.current
            .play()
            .then(() => console.log("[Scribe] Start sound played"))
            .catch((err) => console.error("[Scribe] Start sound failed:", err))
        } else {
          console.log("[Scribe] Start sound conditions not met:", {
            shouldBeConnected: shouldBeConnectedRef.current,
            isConnected: scribe.isConnected,
            hasAudio: !!startSoundRef.current,
          })
        }
      }, 50)
    } catch (error) {
      console.error("[Scribe] Connection error:", error)
      shouldBeConnectedRef.current = false
      setRecording((prev) => ({
        ...prev,
        error:
          error instanceof Error ? error.message : "Failed to start recording",
      }))
    } finally {
      isOperatingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scribe.connect,
    scribe.disconnect,
    scribe.clearTranscripts,
    scribe.isConnected,
    scribe.status,
    selectedLanguage,
  ])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux) to toggle recording
      if (
        e.key === "k" &&
        (e.metaKey || e.ctrlKey) &&
        e.target instanceof HTMLElement &&
        !["INPUT", "TEXTAREA"].includes(e.target.tagName)
      ) {
        e.preventDefault()
        handleToggleRecording()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleToggleRecording])

  // Preload audio files on mount
  useEffect(() => {
    const sounds = [
      {
        ref: startSoundRef,
        url: "https://ui.elevenlabs.io/sounds/transcriber-start.mp3",
      },
      {
        ref: endSoundRef,
        url: "https://ui.elevenlabs.io/sounds/transcriber-end.mp3",
      },
      {
        ref: errorSoundRef,
        url: "https://ui.elevenlabs.io/sounds/transcriber-error.mp3",
      },
    ]

    // Preload all sounds and ensure they're ready to play
    sounds.forEach(({ ref, url }) => {
      const audio = new Audio(url)
      audio.volume = 0.6
      audio.preload = "auto"

      // Force load the audio
      audio.load()

      // Play silently once to "unlock" audio playback (browser requirement)
      const unlockAudio = () => {
        audio
          .play()
          .then(() => {
            audio.pause()
            audio.currentTime = 0
          })
          .catch(() => {
            // Autoplay blocked, will work after user interaction
          })
      }

      // Try to unlock audio on first interaction
      if (audio.readyState >= 2) {
        unlockAudio()
      } else {
        audio.addEventListener("canplaythrough", unlockAudio, { once: true })
      }

      ref.current = audio
    })
  }, [])

  const fullTranscript = useMemo(
    () => scribe.finalTranscripts.map((t) => t.text).join(" "),
    [scribe.finalTranscripts]
  )

  // Create a stable displayText that only changes when actual text changes
  const displayText = useMemo(() => {
    const text = recording.error || scribe.partialTranscript || fullTranscript
    return text
  }, [recording.error, scribe.partialTranscript, fullTranscript])

  // Use a ref for previous displayText to avoid unnecessary re-renders
  const prevDisplayTextRef = useRef(displayText)
  const stableDisplayText = useMemo(() => {
    if (displayText !== prevDisplayTextRef.current) {
      prevDisplayTextRef.current = displayText
    }
    return prevDisplayTextRef.current
  }, [displayText])

  const hasContent = Boolean(stableDisplayText)

  // Memoize average latency calculation
  const averageLatency = useMemo(() => {
    if (recording.latenciesMs.length === 0) return 0
    return Math.round(
      recording.latenciesMs.reduce((sum, v) => sum + v, 0) /
        recording.latenciesMs.length
    )
  }, [recording.latenciesMs])

  return (
    <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center">
      {/* Bottom aura effect - Multi-layered prismatic glow */}
      <BackgroundAura status={scribe.status} isConnected={scribe.isConnected} />

      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-20%) scale(1);
          }
          50% {
            transform: translateX(20%) scale(1.1);
          }
          100% {
            transform: translateX(-20%) scale(1);
          }
        }
        @keyframes drift {
          0% {
            transform: translateX(-10%) scale(1);
          }
          100% {
            transform: translateX(10%) scale(1.05);
          }
        }
        @keyframes pulseGlow {
          0% {
            opacity: 0.5;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0.8;
            transform: translateY(-5%) scale(1.02);
          }
        }
      `}</style>

      <div className="relative flex h-full w-full flex-col items-center justify-center gap-8 overflow-hidden px-8 py-12">
        {/* Main transcript area */}
        <div className="relative flex min-h-[350px] w-full flex-1 items-center justify-center overflow-hidden">
          {hasContent && (
            <TranscriberTranscript
              transcript={stableDisplayText}
              error={recording.error}
              isPartial={Boolean(scribe.partialTranscript)}
              isConnected={scribe.isConnected}
            />
          )}

          {!hasContent && (
            <div className="flex max-h-full w-full max-w-sm flex-col items-center gap-8 overflow-y-auto">
              {/* Status text - transitions smoothly between states */}
              <div className="relative flex min-h-[48px] w-full items-center justify-center">
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-opacity duration-500",
                    scribe.status === "connecting"
                      ? "opacity-100"
                      : "pointer-events-none opacity-0"
                  )}
                >
                  <ShimmeringText
                    text="Connecting..."
                    className="text-2xl font-light tracking-wide whitespace-nowrap"
                  />
                </div>
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-opacity duration-500",
                    scribe.isConnected
                      ? "opacity-100"
                      : "pointer-events-none opacity-0"
                  )}
                >
                  <ShimmeringText
                    text="Say something aloud..."
                    className="text-3xl font-light tracking-wide whitespace-nowrap"
                  />
                </div>
              </div>

              {/* Language selector and button */}
              <div
                className={cn(
                  "flex w-full flex-col gap-4 transition-opacity duration-500",
                  !scribe.isConnected && scribe.status !== "connecting"
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                )}
              >
                <div className="space-y-2">
                  <label className="text-foreground/70 text-sm font-medium">
                    Language
                  </label>
                  <LanguageSelector
                    value={selectedLanguage}
                    onValueChange={setSelectedLanguage}
                    disabled={
                      scribe.isConnected || scribe.status === "connecting"
                    }
                  />
                </div>
                <Button
                  onClick={handleToggleRecording}
                  disabled={isOperatingRef.current}
                  size="lg"
                  className="bg-foreground/95 hover:bg-foreground/90 w-full justify-center gap-3"
                >
                  <span>Start Transcribing</span>
                  <kbd className="border-background/20 bg-background/10 hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-xs sm:inline-flex">
                    {isMac ? "⌘K" : "Ctrl+K"}
                  </kbd>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom controls - latency badge and stop button */}
        <BottomControls
          isConnected={scribe.isConnected}
          hasError={Boolean(recording.error)}
          averageLatency={averageLatency}
          isMac={isMac}
          onStop={handleToggleRecording}
        />
      </div>
    </div>
  )
}

const TranscriberTranscript = React.memo(
  ({
    transcript,
    error,
    isPartial,
    isConnected,
  }: {
    transcript: string
    error: string
    isPartial?: boolean
    isConnected: boolean
  }) => {
    const characters = useMemo(() => transcript.split(""), [transcript])
    const previousNumChars = useDebounce(
      usePrevious(characters.length) || 0,
      100
    )
    const scrollRef = useRef<HTMLDivElement>(null)
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Auto-scroll to bottom when connected and text is updating
    // Throttled to avoid excessive scroll updates
    useEffect(() => {
      if (isConnected && scrollRef.current) {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
        scrollTimeoutRef.current = setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        }, 50) // Throttle scroll updates to 50ms
      }
      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
      }
    }, [transcript, isConnected])

    return (
      <div className="absolute inset-0 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div
            className={cn(
              "min-h-[50%] w-full px-12 py-8",
              isConnected && "absolute bottom-16"
            )}
          >
            <div
              className={cn(
                "text-foreground/90 w-full text-xl leading-relaxed font-light",
                error && "text-red-500",
                isPartial && "text-foreground/60"
              )}
            >
              {characters.map((char, index) => {
                // Only animate new characters (those after previousNumChars)
                const delay =
                  index >= previousNumChars
                    ? (index - previousNumChars + 1) * 0.012
                    : 0
                return (
                  <TranscriptCharacter key={index} char={char} delay={delay} />
                )
              })}
            </div>
          </div>
        </div>
        {transcript && !error && !isPartial && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-8 w-8 opacity-0 transition-opacity hover:opacity-60"
            onClick={() => {
              navigator.clipboard.writeText(transcript)
            }}
            aria-label="Copy transcript"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }
)
TranscriberTranscript.displayName = "TranscriberTranscript"
