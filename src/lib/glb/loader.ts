// ------------------------------------------------------------------
//  Parallel GLB loader: loads the group GLBs named by the manifest of the bridge profile (src/bridge, model.manifestUrl).
//    public/models3d/beechwood/BEECHWOOD.glb
//  meshopt decompression + three-mesh-bvh accelerated raycast + object tagging (profile objectInfo).
//  Progressive loading: each group joins the scene as it arrives.
// ------------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { bridge } from '@/bridge';
import { dirOf, siteUrl } from '@/lib/siteUrl';

// Global patch for BVH-accelerated raycast
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface ManifestGroup {
  group: string;
  file: string;
  sizeKB: number;
  objects: Array<{ id: string; name: string; el: string; file: string }>;
}
export interface Manifest {
  version: string;
  groups: ManifestGroup[];
}

export interface LoadProgress {
  loaded: number;
  total: number;
  group: string;
}

/* Model folder (where the manifest lives) */
const BASE = siteUrl(dirOf(bridge.model.manifestUrl));
// Cache busting: asset file names are fixed, so a stale browser cache
// could hide a new group. The ?v= query changes with every build.
declare const __BUILD_ID__: string;
const V = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/**
 * Tags the meshes of a GLTF scene: mapping (bridge profile objectInfo), material cleanup and (optional) BVH build.
 * mapGroup: the GLB group identifier given to objectInfo.
 * tagGroup: the userData.group value, used by the member tree test sel.has(groupCode).
 */
export function tagMeshes(
  sceneRoot: THREE.Object3D,
  mapGroup: string,
  tagGroup: string,
  elById: Map<string, string>,
  withBVH: boolean,
): number {
  let meshCount = 0;
  sceneRoot.updateMatrixWorld(true);
  sceneRoot.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshCount += 1;
    const name = mesh.name || mesh.parent?.name || '';
    const center = new THREE.Box3()
      .setFromObject(mesh)
      .getCenter(new THREE.Vector3());
    const info = bridge.objectInfo(mapGroup, name, center);
    mesh.userData.group = tagGroup;
    mesh.userData.objName = name;
    mesh.userData.member = info.member;
    mesh.userData.fine = info.fine;
    mesh.userData.locationDetail = info.locationDetail;
    // The object code comes from the profile mapping; without one the node name is the object.
    const segId = info.objectCode ?? name;
    mesh.userData.objectId = segId;
    mesh.userData.el = elById.get(segId) ?? '';
    // Ground (BW_GROUND*, not a member) is left out of picking: the 3D view and the proposal selection viewer both pick by raycast,
    // so raycast itself is switched off.
    if (info.fine === 'Ground') mesh.raycast = () => {};

    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && mat.isMeshStandardMaterial) {
      mat.metalness = 0.05;
      mat.roughness = 0.85;
      mat.side = THREE.DoubleSide;
    }
    if (withBVH) mesh.geometry.computeBoundsTree?.();
  });
  return meshCount;
}

export async function loadBridge(
  root: THREE.Group,
  onProgress: (p: LoadProgress) => void,
): Promise<{ manifest: Manifest; meshCount: number }> {
  const manifest = await loadManifest();

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  let done = 0;
  let meshCount = 0;
  const elById = new Map<string, string>();
  for (const g of manifest.groups)
    for (const o of g.objects) elById.set(o.id, o.el);

  await Promise.all(
    manifest.groups.map(
      (g) =>
        new Promise<void>((resolve, reject) => {
          loader.load(
            `${BASE}/${g.file}?v=${V}`,
            (gltf) => {
              const groupNode = new THREE.Group();
              groupNode.name = g.group;
              groupNode.add(gltf.scene);
              meshCount += tagMeshes(gltf.scene, g.group, g.group, elById, true);
              root.add(groupNode);
              done += 1;
              onProgress({ loaded: done, total: manifest.groups.length, group: g.group });
              resolve();
            },
            undefined,
            (err) => reject(err instanceof Error ? err : new Error(String(err))),
          );
        }),
    ),
  );

  return { manifest, meshCount };
}

/* Fetches the manifest once and caches it */
let manifestCache: Promise<Manifest> | null = null;
export function loadManifest(): Promise<Manifest> {
  if (!manifestCache) {
    manifestCache = fetch(`${siteUrl(bridge.model.manifestUrl)}?v=${V}`).then((r) => {
      if (!r.ok) throw new Error(`manifest fetch ${r.status}`);
      return r.json();
    });
  }
  return manifestCache;
}
