/**
 * useVoiceCapture — registrazione audio (MediaRecorder) + STT ON-DEVICE
 * (Web Speech API, gratis, come base — il brief: "STT on-device gratis").
 * Cattura-prima: si registra l'audio (provenienza) e si ottiene la trascrizione
 * locale; l'elaborazione (estrazione) avviene poi async lato server.
 *
 * Nota: la Web Speech API è disponibile soprattutto su Chrome/Edge. Se assente,
 * si registra comunque l'audio (transcript vuoto → il server lo conserva).
 */
import { useRef, useState } from 'react';

/* tipi minimi della Web Speech API (non in lib.dom standard) */
type SpeechRecognitionCtor = new () => {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void; stop: () => void;
};

function getSR(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceResult { blob: Blob; transcript: string }

export function useVoiceCapture() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const finalRef = useRef('');
  const resolveRef = useRef<((r: VoiceResult) => void) | null>(null);

  const audioSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const sttSupported = !!getSR();

  async function start(): Promise<void> {
    setTranscript('');
    finalRef.current = '';
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      resolveRef.current?.({ blob, transcript: finalRef.current.trim() });
      resolveRef.current = null;
    };
    recorderRef.current = rec;
    rec.start();

    const SR = getSR();
    if (SR) {
      const r = new SR();
      r.lang = 'it-IT';
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let interim = '';
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]!;
          const txt = res[0]!.transcript;
          if (res.isFinal) finalRef.current += txt + ' ';
          else interim += txt;
        }
        setTranscript((finalRef.current + interim).trim());
      };
      r.onerror = () => { /* ignora: l'audio resta registrato */ };
      recognitionRef.current = r;
      r.start();
    }
    setRecording(true);
  }

  function stop(): Promise<VoiceResult> {
    return new Promise<VoiceResult>((resolve) => {
      resolveRef.current = resolve;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      recorderRef.current?.stop();
      recorderRef.current = null;
      setRecording(false);
    });
  }

  return { recording, transcript, audioSupported, sttSupported, start, stop };
}
