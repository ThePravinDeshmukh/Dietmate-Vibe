# Voice Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mic voice input and auto-read-aloud of AI responses to the existing ChatSidebar using the browser's Web Speech API.

**Architecture:** A new `useVoice` hook encapsulates all `SpeechRecognition` and `SpeechSynthesis` logic. `ChatSidebar` consumes the hook, adding a mic button to the input row and a mute toggle to the header. A `useEffect` in `ChatSidebar` watches for new assistant messages and calls `speak()` automatically.

**Tech Stack:** React 19, TypeScript, Material UI 7, Web Speech API (browser built-in), localStorage

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `diet-tracker-react/src/hooks/useVoice.ts` | Create | All SpeechRecognition + SpeechSynthesis state and actions |
| `diet-tracker-react/src/components/ChatSidebar.tsx` | Modify | Mic button, mute toggle, auto-read effect |

---

### Task 1: Create `useVoice` hook — mic input

**Files:**
- Create: `diet-tracker-react/src/hooks/useVoice.ts`

- [ ] **Step 1: Create the hook with mic (SpeechRecognition) support**

Create `diet-tracker-react/src/hooks/useVoice.ts` with the following content:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';

// Markdown stripping for clean TTS output
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/>\s+/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/[-*+]\s+/g, '')
    .trim();
}

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window.SpeechRecognition || (window as any).webkitSpeechRecognition)
    : null;

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem('voice_muted') === 'true';
    } catch {
      return false;
    }
  });

  const recognitionRef = useRef<InstanceType<typeof SpeechRecognitionAPI> | null>(null);

  const isSupported = Boolean(SpeechRecognitionAPI);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (isMuted || typeof window === 'undefined' || !window.speechSynthesis) return;
    stopSpeaking();
    const clean = stripMarkdown(text);
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [isMuted, stopSpeaking]);

  const startListening = useCallback((onTranscript: (text: string) => void) => {
    if (!SpeechRecognitionAPI) return;
    stopSpeaking();
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [stopSpeaking]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      try {
        localStorage.setItem('voice_muted', String(next));
      } catch {}
      if (next) stopSpeaking();
      return next;
    });
  }, [stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopSpeaking();
    };
  }, [stopSpeaking]);

  return {
    isSupported,
    isListening,
    isSpeaking,
    isMuted,
    startListening,
    stopListening,
    speak,
    toggleMute,
    stopSpeaking,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add diet-tracker-react/src/hooks/useVoice.ts
git commit -m "feat: add useVoice hook with SpeechRecognition and SpeechSynthesis"
```

---

### Task 2: Wire mic button into ChatSidebar

**Files:**
- Modify: `diet-tracker-react/src/components/ChatSidebar.tsx`

- [ ] **Step 1: Add imports for useVoice and new MUI icons**

At the top of `ChatSidebar.tsx`, add to the existing imports:

```typescript
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { useVoice } from '../hooks/useVoice';
```

- [ ] **Step 2: Instantiate useVoice inside the component and add auto-read effect**

Inside `ChatSidebar` component body, after the existing `useState`/`useRef` declarations, add:

```typescript
const { isSupported, isListening, isSpeaking, isMuted, startListening, stopListening, speak, toggleMute } = useVoice();

// Auto-read last assistant message
useEffect(() => {
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant') {
    speak(last.content);
  }
}, [messages]); // speak is stable (useCallback), safe to omit from deps
```

- [ ] **Step 3: Update handleSend to stop speaking before sending**

Replace the existing `handleSend` (note: `stopSpeaking` is already destructured in Step 2):

```typescript
const handleSend = () => {
  const trimmed = input.trim();
  if (!trimmed || loading) return;
  stopSpeaking(); // cancel any current TTS before sending
  onSendMessage(trimmed);
  setInput('');
};
```

- [ ] **Step 4: Add mute toggle button to the header**

In the header `Stack` (the row with the close button), add the mute toggle after the `InfoIcon` button and before the `CloseIcon` button:

```tsx
<IconButton
  size="small"
  onClick={toggleMute}
  aria-label={isMuted ? 'unmute assistant voice' : 'mute assistant voice'}
  title={isMuted ? 'Unmute voice' : 'Mute voice'}
  sx={{ color: isSpeaking && !isMuted ? 'primary.main' : 'inherit' }}
>
  {isMuted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
</IconButton>
```

- [ ] **Step 5: Add mic button to the input row**

In the input `Stack` (the row with `TextField` and `SendIcon`), add the mic button between the `TextField` and the send button:

```tsx
{isSupported && (
  <IconButton
    onClick={isListening ? stopListening : () => startListening(setInput)}
    aria-label={isListening ? 'stop listening' : 'start voice input'}
    title={isListening ? 'Stop listening' : 'Speak a message'}
    sx={{
      color: isListening ? 'error.main' : 'inherit',
      animation: isListening ? 'pulse 1s infinite' : 'none',
      '@keyframes pulse': {
        '0%': { opacity: 1 },
        '50%': { opacity: 0.4 },
        '100%': { opacity: 1 },
      },
    }}
  >
    {isListening ? <MicOffIcon /> : <MicIcon />}
  </IconButton>
)}
```

- [ ] **Step 6: Verify the app compiles**

```bash
cd diet-tracker-react && npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add diet-tracker-react/src/components/ChatSidebar.tsx
git commit -m "feat: add mic input and auto-read-aloud to ChatSidebar"
```

---

### Task 3: Manual smoke test

- [ ] **Step 1: Run the app**

```bash
cd diet-tracker-react && npm run start
```

- [ ] **Step 2: Open the chat sidebar**

Open the app in Chrome. Open the chat sidebar. Verify:
- Speaker icon appears in the header (unmuted by default)
- Mic icon appears in the input row

- [ ] **Step 3: Test voice input**

Click the mic button. Speak a message (e.g. "How much milk was given today?"). Verify:
- Button turns red and pulses while listening
- Transcript appears in the text field after speaking
- Pressing Enter sends the message

- [ ] **Step 4: Test auto-read**

Wait for the AI response. Verify it is read aloud automatically.

- [ ] **Step 5: Test mute toggle**

Click the speaker icon in the header to mute. Send another message. Verify the response is NOT read aloud. Refresh the page and verify mute state is preserved.

- [ ] **Step 6: Test TTS cancellation on send**

While TTS is playing, press mic and speak a new message. Verify:
- Current speech stops immediately
- New message is sent

---

## Done

All voice features are implemented in two focused files with no backend changes.
