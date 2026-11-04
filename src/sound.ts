let context: AudioContext | undefined;
// iOS only starts audio after a tap, so the first touch quietly wakes it up.
export function unlockAudio() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    context ??= new AudioCtx();
    if (context.state === "suspended") void context.resume();
  } catch {
    /* No sound is fine. */
  }
}
// A soft four-note chime. Web Audio follows the iPhone silent switch.
export function chime() {
  unlockAudio();
  if (!context) return;
  const start = context.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
    const osc = context!.createOscillator(),
      gain = context!.createGain(),
      at = start + i * 0.15;
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.07, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    osc.connect(gain).connect(context!.destination);
    osc.start(at);
    osc.stop(at + 1.2);
  });
}
