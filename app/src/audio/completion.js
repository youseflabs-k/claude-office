/** Local notification tones, unlocked by the first user gesture. */
export function startCompletionAudio(store, target = globalThis.window) {
  if (!target) return () => {};
  store.setUI?.({audioReady:false});
  let context = null, disposed = false, pendingAttention = false;
  let lastKey = store.getSnapshot().completionNotice?.key;
  let lastAttentionKey = store.getSnapshot().attentionNotice?.key;
  const hasAttention = () => store.getSnapshot().world?.agents.some(a=>a.needsYou);
  const play = attention => {
    if (!store.getSnapshot().settings.sounds || !context || context.state !== 'running') return false;
    const start = context.currentTime;
    for (const [i,frequency] of (attention ? [880,659.25,880] : [523.25,659.25,783.99]).entries()) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const at = start + i * .15;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.075, at + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, at + .40);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(at); oscillator.stop(at + .42);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    return true;
  };
  const flushAttention = () => {
    if (pendingAttention && hasAttention() && play(true)) pendingAttention=false;
  };
  const unlock = () => {
    if (!store.getSnapshot().settings.sounds || disposed) return;
    const Audio = target.AudioContext ?? target.webkitAudioContext;
    if (!Audio) return;
    try {
      context ??= new Audio();
      context.resume()?.then(() => { if (!disposed) { store.setUI?.({audioReady:context.state==='running'}); flushAttention(); } }).catch(() => {});
      flushAttention();
    } catch { /* audio unavailable */ }
  };
  target.addEventListener('pointerdown', unlock);
  target.addEventListener('keydown', unlock);
  const unsubscribe = store.subscribe(() => {
    const state=store.getSnapshot(), key=state.completionNotice?.key, attentionKey=state.attentionNotice?.key;
    if (!hasAttention()) pendingAttention=false;
    if (attentionKey !== lastAttentionKey) {
      lastAttentionKey=attentionKey;
      if (state.settings.sounds) pendingAttention=!play(true);
      // An attention request takes priority over a simultaneous completion.
      lastKey=key; return;
    }
    if (key !== lastKey) { lastKey=key; play(false); }
  });
  return () => {
    disposed = true; unsubscribe();
    target.removeEventListener('pointerdown', unlock); target.removeEventListener('keydown', unlock);
    context?.close()?.catch(() => {});
  };
}
