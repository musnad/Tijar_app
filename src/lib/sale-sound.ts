let saleAudio: HTMLAudioElement | null = null;
let soundCtx: AudioContext | null = null;

function playToneFallback() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    soundCtx = soundCtx ?? new Ctx();
    const ctx = soundCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const notes = [
      { freq: 523.25, start: 0, dur: 0.12 },
      { freq: 659.25, start: 0.1, dur: 0.14 },
      { freq: 1046.5, start: 0.22, dur: 0.28 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.28, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
    }
  } catch {
    // Autoplay may block until a tap.
  }
}

/** Cash-register style chime when a business gets a sale. */
export function playSaleSound() {
  if (typeof window === "undefined") return;
  try {
    saleAudio = saleAudio ?? new Audio("/sounds/sale.wav");
    saleAudio.currentTime = 0;
    saleAudio.volume = 1;
    void saleAudio.play().catch(playToneFallback);
  } catch {
    playToneFallback();
  }
}

export function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    soundCtx = soundCtx ?? new Ctx();
    const ctx = soundCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    for (const n of [
      { freq: 880, start: 0 },
      { freq: 1318.5, start: 0.12 },
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.22, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + 0.24);
    }
  } catch {
    // Ignore.
  }
}
