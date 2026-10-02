import { DESK_CAPACITY } from '../config.js';

// Seating must be stable: an agent that re-renders should never hop desks.
// Order is arrival time, ties broken by key, so the result is deterministic
// regardless of the input array's order.
export function assignSeats(occupants, capacity = DESK_CAPACITY) {
  const ordered = [...occupants].sort((a, b) => {
    if (a.firstSeenAt !== b.firstSeenAt) return a.firstSeenAt - b.firstSeenAt;
    if (a.identityKey < b.identityKey) return -1;
    if (a.identityKey > b.identityKey) return 1;
    return 0;
  });

  const desks = new Array(capacity).fill(null);
  const porch = [];

  ordered.forEach((occupant, i) => {
    if (i < capacity) desks[i] = occupant;
    else porch.push(occupant);
  });

  return { desks, porch };
}
