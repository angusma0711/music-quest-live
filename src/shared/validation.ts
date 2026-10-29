/** No 0/O, 1/I/L to avoid misreading on a projector. Must match database.rules.json. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;
export const ALIAS_MAX = 12;

export function generateRoomCode(random: (n: number) => Uint8Array = defaultRandom): string {
  // Rejection sampling keeps the distribution uniform (31 symbols, ~887M codes).
  const out: string[] = [];
  const limit = 256 - (256 % ROOM_CODE_ALPHABET.length);
  while (out.length < ROOM_CODE_LENGTH) {
    for (const b of random(16)) {
      if (b < limit && out.length < ROOM_CODE_LENGTH) out.push(ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]);
    }
  }
  return out.join('');
}

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/** Trims and validates a pupil nickname / class number. Returns null when invalid. */
export function cleanAlias(input: string): string | null {
  const alias = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...alias].length;
  if (length < 1 || alias.length > ALIAS_MAX || length > ALIAS_MAX) return null;
  // Block anything that looks like an email or URL — pupils should not type personal info.
  if (/[@<>/\\]/.test(alias)) return null;
  return alias;
}

export function isValidChoice(choice: unknown, optionCount: number): choice is number {
  return typeof choice === 'number' && Number.isInteger(choice) && choice >= 0 && choice < optionCount;
}
