import { classifyMediaError, rmsLevel } from './media-utils.ts';

export type Phase = 'idle' | 'requesting' | 'active' | 'played' | 'confirmed' | 'error' | 'unsupported';
export type CheckState = { phase: Phase; detail: string; confirmed: boolean };
export type DeviceSnapshot = {
  camera: CheckState;
  microphone: CheckState;
  speaker: CheckState;
  level: number;
  capture: string | null;
};

const check = (detail: string): CheckState => ({ phase: 'idle', detail, confirmed: false });
const initial = (): DeviceSnapshot => ({
  camera: check('Ready when you are.'),
  microphone: check('Ready when you are.'),
  speaker: check('Ready when you are.'),
  level: 0,
  capture: null,
});

/** Owns real browser resources. No captures or audio are uploaded or persisted. */
export class DeviceChecks {
  private state = initial();
  private listeners = new Set<() => void>();
  private cameraGeneration = 0;
  private micGeneration = 0;
  private speakerGeneration = 0;
  private cameraStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private micContext: AudioContext | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frame = 0;
  private speakerContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<DeviceSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  private fail(key: 'camera' | 'microphone' | 'speaker', error: unknown) {
    this.update({ [key]: { phase: 'error', detail: classifyMediaError(error).message, confirmed: false } });
  }

  private captureAvailable(key: 'camera' | 'microphone') {
    if (!window.isSecureContext) {
      this.update({ [key]: { phase: 'unsupported', detail: 'Open this page over HTTPS or localhost to allow device access.', confirmed: false } });
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.update({ [key]: { phase: 'unsupported', detail: 'Device capture is unavailable in this browser. Try a current browser with device access enabled.', confirmed: false } });
      return false;
    }
    return true;
  }

  async startCamera(video: HTMLVideoElement) {
    this.stopCamera();
    if (!this.captureAvailable('camera')) return;
    const generation = this.cameraGeneration;
    this.update({ camera: { phase: 'requesting', detail: 'Waiting for your camera permission…', confirmed: false }, capture: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      if (generation !== this.cameraGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
      this.cameraStream = stream;
      this.video = video;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (generation === this.cameraGeneration) this.stopCamera();
      }, { once: true }));
      video.srcObject = stream;
      await video.play();
      if (generation !== this.cameraGeneration) return;
      this.update({ camera: { phase: 'active', detail: 'Live preview. Capture a frame to confirm.', confirmed: false } });
    } catch (error) {
      if (generation !== this.cameraGeneration) return;
      this.stopCamera();
      this.fail('camera', error);
    }
  }

  captureFrame() {
    const video = this.video;
    if (!video || !video.videoWidth || video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    this.update({ capture: canvas.toDataURL('image/jpeg', 0.8), camera: { phase: 'active', detail: 'Frame captured in memory. Camera is still on.', confirmed: true } });
  }

  clearCapture() {
    this.update({ capture: null, camera: { ...this.state.camera, confirmed: false, detail: this.cameraStream ? 'Live preview. Capture a frame to confirm.' : 'Frame discarded. Ready to check again.' } });
  }

  stopCamera() {
    this.cameraGeneration++;
    this.cameraStream?.getTracks().forEach(track => track.stop());
    this.cameraStream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video = null; }
    const confirmed = this.state.camera.confirmed;
    this.update({ camera: { phase: confirmed ? 'confirmed' : 'idle', detail: confirmed ? 'Frame captured. Camera is off.' : 'Camera is off.', confirmed } });
  }

  async startMicrophone() {
    this.stopMicrophone();
    if (!this.captureAvailable('microphone')) return;
    if (!window.AudioContext) {
      this.update({ microphone: { phase: 'unsupported', detail: 'Audio measurement is unavailable in this browser.', confirmed: false } });
      return;
    }
    const generation = this.micGeneration;
    let context: AudioContext | null = null;
    this.update({ microphone: { phase: 'requesting', detail: 'Waiting for your microphone permission…', confirmed: false } });
    try {
      // Create/resume during the originating user gesture, before awaiting permission.
      context = new AudioContext();
      this.micContext = context;
      const resume = context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (generation !== this.micGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
      this.micStream = stream;
      await resume;
      if (generation !== this.micGeneration) return;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser); // Never connect microphone input to speakers.
      this.micSource = source;
      this.analyser = analyser;
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (generation === this.micGeneration) this.stopMicrophone();
      }, { once: true }));
      this.update({ microphone: { phase: 'active', detail: 'Listening. Say a few words or clap gently.', confirmed: false } });
      const samples = new Float32Array(analyser.fftSize);
      let lastUpdate = 0;
      const measure = (time: number) => {
        if (generation !== this.micGeneration) return;
        if (time - lastUpdate >= 80) {
          analyser.getFloatTimeDomainData(samples);
          const level = rmsLevel(samples);
          const confirmed = this.state.microphone.confirmed || level > 0.01;
          this.update({ level, microphone: { phase: 'active', detail: confirmed ? 'Live input detected. Microphone is still on.' : 'Listening. Say a few words or clap gently.', confirmed } });
          lastUpdate = time;
        }
        this.frame = requestAnimationFrame(measure);
      };
      this.frame = requestAnimationFrame(measure);
    } catch (error) {
      if (generation !== this.micGeneration) return;
      this.stopMicrophone();
      this.fail('microphone', error);
    } finally {
      if (generation !== this.micGeneration && context?.state !== 'closed') void context?.close().catch(() => {});
    }
  }

  stopMicrophone() {
    this.micGeneration++;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.micStream?.getTracks().forEach(track => track.stop());
    this.micStream = null;
    this.micSource?.disconnect();
    this.analyser?.disconnect();
    this.micSource = null;
    this.analyser = null;
    if (this.micContext?.state !== 'closed') void this.micContext?.close().catch(() => {});
    this.micContext = null;
    const confirmed = this.state.microphone.confirmed;
    this.update({ level: 0, microphone: { phase: confirmed ? 'confirmed' : 'idle', detail: confirmed ? 'Input detected. Microphone is off.' : 'Microphone is off.', confirmed } });
  }

  async playTone() {
    this.stopSpeaker();
    if (!window.AudioContext) {
      this.update({ speaker: { phase: 'unsupported', detail: 'Audio playback is unavailable in this browser.', confirmed: false } });
      return;
    }
    const generation = this.speakerGeneration;
    this.update({ speaker: { phase: 'requesting', detail: 'Starting audio…', confirmed: false } });
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      this.speakerContext = context;
      await context.resume();
      if (generation !== this.speakerGeneration) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.03);
      gain.gain.setValueAtTime(0.12, context.currentTime + 0.35);
      gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      this.oscillator = oscillator;
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (context?.state !== 'closed') void context?.close().catch(() => {});
        if (generation !== this.speakerGeneration) return;
        this.oscillator = null;
        this.speakerContext = null;
        this.update({ speaker: { phase: 'played', detail: 'Did you hear the short tone?', confirmed: false } });
      };
      this.update({ speaker: { phase: 'active', detail: 'Playing a short test tone…', confirmed: false } });
      oscillator.start();
      oscillator.stop(context.currentTime + 0.48);
    } catch (error) {
      if (generation !== this.speakerGeneration) return;
      this.stopSpeaker();
      this.fail('speaker', error);
    } finally {
      if (generation !== this.speakerGeneration && context?.state !== 'closed') void context?.close().catch(() => {});
    }
  }

  confirmSpeaker() {
    if (this.state.speaker.phase !== 'played') return;
    this.update({ speaker: { phase: 'confirmed', detail: 'You confirmed that you heard the tone.', confirmed: true } });
  }

  stopSpeaker() {
    this.speakerGeneration++;
    if (this.oscillator) { this.oscillator.onended = null; try { this.oscillator.stop(); } catch { /* already ended */ } this.oscillator.disconnect(); }
    this.oscillator = null;
    if (this.speakerContext?.state !== 'closed') void this.speakerContext?.close().catch(() => {});
    this.speakerContext = null;
    this.update({ speaker: check('Ready when you are.') });
  }

  reset = () => {
    this.stopCamera();
    this.stopMicrophone();
    this.stopSpeaker();
    this.update(initial());
  };
}
