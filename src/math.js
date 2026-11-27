export const S = 0.05;               // 1 design unit = 0.05 Three.js world units
export const RAD = Math.PI / 180;    // Degrees to radians
export const WORLD_HALF = 10.5;      // Meadow half-width

export function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}
