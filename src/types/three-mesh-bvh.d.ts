import type { BufferGeometry, Raycaster } from 'three';
import type { MeshBVH, SplitStrategy } from 'three-mesh-bvh';

declare module 'three' {
  interface BufferGeometry {
    boundsTree?: MeshBVH;
    computeBoundsTree?: (options?: { strategy?: SplitStrategy; maxDepth?: number }) => void;
    disposeBoundsTree?: () => void;
  }
  interface Raycaster {
    firstHitOnly?: boolean;
  }
}
