import { useSyncExternalStore } from 'react';
import { store } from './store.js';
export function useStudio(selector = s => s) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return selector(snapshot);
}
