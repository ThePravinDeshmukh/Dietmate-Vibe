# Voice Chat Design

**Date:** 2026-04-06  
**Branch:** 2-record-diet  
**Status:** Approved

## Summary

Add voice input (speak → text → send) and voice output (AI response auto-read-aloud) to the existing `ChatSidebar` using the browser's built-in Web Speech API. No external dependencies or API keys required.

## Architecture

All voice logic is encapsulated in a new custom hook `useVoice.ts`. `ChatSidebar` consumes this hook. No changes to `App.tsx`, `useChat.ts`, or the backend.

```
ChatSidebar
  └── useVoice (new hook)
        ├── SpeechRecognition  (mic input)
        └── SpeechSynthesis    (read-aloud output)
```

## Components

### `useVoice.ts` (new hook)

Responsibilities:
- Manage `SpeechRecognition` instance lifecycle (start, stop, result, error)
- Manage `SpeechSynthesis` utterance for read-aloud
- Expose `isListening`, `isSpeaking`, `isMuted`, `isSupported` state
- Expose `startListening()`, `stopListening()`, `speak(text)`, `toggleMute()` actions
- Strip markdown from text before passing to `SpeechSynthesis`
- Persist `isMuted` in `localStorage` under key `voice_muted`

### `ChatSidebar.tsx` (modified)

**Mic button** added to input row (next to send button):
- Hidden if `isSupported` is false (Firefox)
- Red + pulsing animation while `isListening`
- On press: starts listening; transcript fills the text field
- On transcript received: inserts text into input field (user can edit before sending)

**Speaker toggle button** added to header (next to existing icons):
- `VolumeUp` icon when unmuted, `VolumeOff` when muted
- Toggles `isMuted` via `toggleMute()`
- Subtle animated indicator (e.g. color change) while `isSpeaking`

**Auto-read behaviour:**
- `useEffect` watches `messages` — when a new assistant message is appended and `!isMuted`, call `speak(lastMessage.content)`
- If mic is activated while TTS is speaking, cancel current speech first

## Data Flow

```
User presses mic
  → SpeechRecognition starts
  → User speaks
  → onresult: transcript → setInput(transcript)
  → User sends (or auto-send if field was empty)
  → LLM responds (existing useChat flow)
  → useEffect detects new assistant message
  → speak(message.content) called (markdown stripped)
  → SpeechSynthesis reads aloud
```

## Markdown Stripping

Before passing text to `SpeechSynthesis`, apply a simple regex strip:
- Remove `**`, `*`, `__`, `_`, `` ` ``, `#`, `>`, `[text](url)` → `text`
- Result is plain readable prose

## Error Handling

- `SpeechRecognition` `onerror`: silently stop listening, reset button state
- `SpeechSynthesis` unavailable: `speak()` is a no-op
- No `SpeechRecognition` support: mic button hidden

## Browser Support

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| SpeechRecognition | ✅ | ✅ | ❌ (hidden) | ✅ (partial) |
| SpeechSynthesis | ✅ | ✅ | ✅ | ✅ |

## Files Changed

- `diet-tracker-react/src/hooks/useVoice.ts` — new file
- `diet-tracker-react/src/components/ChatSidebar.tsx` — mic button + speaker toggle + auto-read effect
