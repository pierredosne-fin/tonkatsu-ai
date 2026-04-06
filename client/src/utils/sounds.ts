const ctx = new AudioContext();

function note(freq: number, start: number, duration: number, gain = 0.3) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.connect(env);
  env.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, ctx.currentTime + start);
  env.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

// 🔔 Pending: ascending 3-note alert — "hey, I need you"
export function playPending() {
  if (ctx.state === 'suspended') ctx.resume();
  note(523, 0.0, 0.15);   // C5
  note(659, 0.18, 0.15);  // E5
  note(784, 0.36, 0.35);  // G5
}

// ✅ Sleeping (done): short descending resolution — "all done"
export function playSleeping() {
  if (ctx.state === 'suspended') ctx.resume();
  note(784, 0.0, 0.12);   // G5
  note(659, 0.15, 0.12);  // E5
  note(523, 0.30, 0.25);  // C5
}

// ⚙️ Working: single soft ping — "started"
export function playWorking() {
  if (ctx.state === 'suspended') ctx.resume();
  note(440, 0.0, 0.2, 0.15); // A4, quieter
}

// 📨 Delegating: two quick low notes — "passing it on"
export function playDelegating() {
  if (ctx.state === 'suspended') ctx.resume();
  note(349, 0.0,  0.12, 0.15); // F4
  note(294, 0.15, 0.18, 0.15); // D4
}
