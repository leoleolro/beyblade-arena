/**
 * Player preferences that are neither a theme nor a dev switch.
 *
 * WHY A SEPARATE FILE. Theme and impact-frame settings live in
 * `render/theme.ts` because they belong to the renderer, and the unlock switch
 * lives in `devUnlock.ts` because it belongs to progress. These belong to
 * neither — they change how the GAME plays for this person — and putting them
 * in either would mean a gameplay preference reached through a rendering
 * module.
 *
 * Every read is wrapped, because storage genuinely throws: private browsing, a
 * full quota, and site data disabled all fail on access rather than returning
 * null. A preference that cannot be read must fall back to the default and let
 * the session continue, never take the page down.
 */

const AIM_KEY = 'beyblade-arena.aimCharge';
const DEV_KEY = 'beyblade-arena.devMode';

function read(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'on';
  } catch {
    return fallback;
  }
}

function write(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Storage unavailable. The setting holds for this session only.
  }
}

/**
 * Is Charge aimed by the pointer?
 *
 * DEFAULTS ON, because it is the control the game now teaches and the coaching
 * line names it. But it is a real preference rather than a difficulty setting,
 * and turning it off is not a handicap: with no aim the sim falls back to the
 * homing it always had — `applySeek` treats a zero aim as "steer at the
 * opponent", which is exactly what the AI gets and what shipped before aiming
 * existed. So OFF is the old game, not a worse one.
 *
 * Worth having because pointer aiming is a mouse-and-keyboard assumption. On a
 * trackpad, on a touchscreen where the finger is also the camera, or for anyone
 * who wants to watch the fight rather than drive it, an auto-homing charge is
 * the better game.
 */
export const aimCharge = (): boolean => read(AIM_KEY, true);

export const setAimCharge = (on: boolean): void => write(AIM_KEY, on);

/**
 * Is the developer panel shown?
 *
 * Defaults OFF and persists, so it is a mode you turn on for a testing session
 * and leave on for as long as you are testing. Nothing behind it changes the
 * game's rules — see `dev.ts` — it only reaches places that are otherwise
 * behind ladder progress or a run of luck.
 */
export const devMode = (): boolean => read(DEV_KEY, false);

export const setDevMode = (on: boolean): void => write(DEV_KEY, on);
