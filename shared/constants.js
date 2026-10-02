// Values shared by the server and the browser client.
// Changing gameplay tuning here keeps both sides in sync.

export const TICK_RATE = 20; // server simulation ticks per second

export const PLAYER_SPEED = 210; // world units per second
export const PLAYER_RADIUS = 12;
export const MAX_NAME_LENGTH = 16;

export const MIN_CAST_DISTANCE = 50;
export const DEFAULT_CAST_RANGE = 240; // the starter rod; better rods reach further (see gear.js)
export const CAST_FLIGHT_TIME = 0.6; // seconds the bobber is in the air
export const BITE_WINDOW = 1.3; // seconds to hook a fish after it bites

export const CROWD_RADIUS = 90; // other bobbers within this range slow your bites

export const FishingState = Object.freeze({
  IDLE: 'idle',
  CASTING: 'casting',
  WAITING: 'waiting',
  BITE: 'bite',
  REELING: 'reeling',
});

// Message types. Client -> server and server -> client.
export const MSG = Object.freeze({
  // client -> server
  JOIN: 'join',
  INPUT: 'input',
  CAST: 'cast',
  HOOK: 'hook',
  REEL: 'reel',
  CANCEL: 'cancel',
  BUY: 'buy',
  EQUIP: 'equip',
  LOGOUT: 'logout',
  DUEL: 'duel', // { op: 'challenge' | 'accept' | 'decline' | 'forfeit', target?, from? }
  BOARD: 'board', // board or leave the boat while it is docked
  // server -> client
  WELCOME: 'welcome',
  STATE: 'state',
  PROFILE: 'profile', // private: coins, gear, fish index, catch history
  EVENT: 'event',
  ERROR: 'error',
  ROOM: 'room', // you moved between the lake and a boat voyage
});

/** Cast distance for a power value in [0, 1] with a rod of the given range. */
export function castDistance(power, maxRange = DEFAULT_CAST_RANGE) {
  const p = Math.max(0, Math.min(1, power));
  return MIN_CAST_DISTANCE + p * (maxRange - MIN_CAST_DISTANCE);
}
