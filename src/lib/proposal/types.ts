// ------------------------------------------------------------------
//  Sheet proposal engine: shared types and constants.
//  Pipeline: MeshInput (world-coordinate triangles), clip.ts (range cutting),
//              faces.ts (face analysis: normal clusters, main axis, cylinder test), then view compositions.
//  This module holds type and constant declarations only, no logic.
// ------------------------------------------------------------------

/* World-coordinate 3D vector. x = transverse (+east), y = height, z = longitudinal. Unit m. */
export type Vec3 = [number, number, number];

/* World-coordinate triangle mesh of a selected bridge member: the raw input before cutting. */
export interface MeshInput {
  name: string;
  objectId: string;
  fine: string;
  positions: Float32Array | Float64Array;
  indices: Uint32Array;
}

/* Per-axis range cut; null leaves that axis uncut. */
export interface ClipBox {
  x: [number, number] | null;
  y: [number, number] | null;
  z: [number, number] | null;
}

/* Result of clipMeshes: merged vertices and remaining faces (triangle indices). */
export interface ClippedMesh {
  name: string;
  positions: Float64Array;
  faces: Uint32Array;
}

/* Kinds of view composition. */
export type CompositionKey = 'single' | 'development' | 'three_view' | 'four_side' | 'cylinder';

/* Azimuth-based face filter. */
export interface FaceFilter {
  kind: 'azimuth';
  axis: Vec3;
  center: Vec3;
  halfDeg: number;
}

/* Cap on the number of triangles the engine processes at once (input guard). */
export const MAX_TRIANGLES = 300_000;

/* Engine version tag stamped on proposal results. */
export const ENGINE_VERSION = 'proposal-ts@1';

/* No cut (identity): all three axes unbounded. */
export const NO_CLIP: ClipBox = { x: null, y: null, z: null };
