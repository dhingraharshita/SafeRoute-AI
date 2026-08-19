/**
 * SafeRoute AI — Voice & Synthetic Audio Engine
 * Uses Web Speech API for spoken safety alerts and
 * Web Audio API for custom synthesized sirens, chimes, and alarms.
 */

const VoiceEngine = {
  isMuted: false,
  audioCtx: null,
  sirenOscillator: null,
  sirenGain: null,
  sirenInterval: null,
  isSirenPlaying: false,

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopEmergencySiren();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
    return this.isMuted;
  },

  speak(text) {
    if (this.isMuted || !('speechSynthesis' in window)) return;

    try {
      // Cancel previous utterances to avoid queuing delay during urgent events
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05; // slightly faster, urgent
      utterance.pitch = 1.0;
      utterance.volume = 0.9;

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Karen')) && v.lang.startsWith('en'));
      if (preferred) {
        utterance.voice = preferred;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[VoiceEngine] Speech synthesis failed:', e);
    }
  },

  playSuccessChime() {
    if (this.isMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.25); // G5

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  },

  playWarningChime() {
    if (this.isMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Two rapid warning pulses
    [0, 0.18].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 0 ? 587.33 : 440.0, now + offset); // D5 -> A4

      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    });
  },

  playHeartbeat() {
    if (this.isMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  },

  playEmergencySiren() {
    if (this.isMuted || this.isSirenPlaying) return;
    this.initAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    this.isSirenPlaying = true;

    this.sirenOscillator = ctx.createOscillator();
    this.sirenGain = ctx.createGain();

    this.sirenOscillator.type = 'sawtooth';
    this.sirenGain.gain.setValueAtTime(0.35, ctx.currentTime);

    this.sirenOscillator.connect(this.sirenGain);
    this.sirenGain.connect(ctx.destination);

    this.sirenOscillator.start();

    let high = true;
    const toggleFreq = () => {
      if (!this.isSirenPlaying || !this.sirenOscillator) return;
      const targetFreq = high ? 960 : 640;
      this.sirenOscillator.frequency.cancelScheduledValues(ctx.currentTime);
      this.sirenOscillator.frequency.linearRampToValueAtTime(targetFreq, ctx.currentTime + 0.35);
      high = !high;
    };

    toggleFreq();
    this.sirenInterval = setInterval(toggleFreq, 400);
  },

  stopEmergencySiren() {
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.sirenOscillator) {
      try {
        this.sirenOscillator.stop();
        this.sirenOscillator.disconnect();
      } catch (e) {}
      this.sirenOscillator = null;
    }
    this.isSirenPlaying = false;
  }
};
