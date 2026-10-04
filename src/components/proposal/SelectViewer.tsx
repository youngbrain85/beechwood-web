import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Box, Button, Text } from '@mantine/core';
import { loadBridge } from '@/lib/glb/loader';
import { makeSegmentOf, meshMatchesSelection, meshSelectionKeys } from '@/lib/glb/memberTree';
import { isBoltMesh } from '@/lib/proposal/clip';
import { extractMeshInput } from '@/lib/proposal/extract';
import type { ClipBox, MeshInput, Vec3 } from '@/lib/proposal/types';
import { MAX_TRIANGLES } from '@/lib/proposal/types';
import { SProposal } from '@/i18n/s.proposal';
import { autoFitDecision } from './cameraFit';

// ------------------------------------------------------------------
//  Sheet proposals: 3D view for choosing the part.
//
//  Follows the proven approach of the 3D view (routes/Model.tsx): scene values, progressive
//  loading, ghost isolation, picking and cleanup order. Only the purpose differs: what is chosen
//  here becomes the **engine input**. Each time the selection changes (not every frame) the
//  matching meshes are extracted in world coordinates and passed up to the parent.
//
//  The parent sets the height (100% + ResizeObserver).
// ------------------------------------------------------------------

/* Click versus drag: more movement than this counts as orbiting (px). */
const CLICK_SLOP = 4;
/* Margin when fitting the camera to the selection bbox. */
const FIT_PAD = 1.35;
/* Margin of the first-load fit; the same value as Model.tsx. */
const FIT_PAD_INITIAL = 1.12;
/**
 * Triangle cap for one extraction. Copies at most twice the engine limit: copying a whole model
 * would only be rejected by the engine while using a lot of memory.
 */
const EXTRACT_LIMIT = 2 * MAX_TRIANGLES;

export interface SelectionInfo {
  triangles: number;
  tooLarge: boolean;
}

export interface SelectViewerProps {
  /* Selection keys (tree ids, object ids) */
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  /* Shown in 3D only as a box; the engine does the actual cutting. */
  clip: ClipBox;
  onMeshes: (
    meshes: MeshInput[],
    bounds: { min: Vec3; max: Vec3 } | null,
    info: SelectionInfo,
  ) => void;
  /* Manifest object ids, for the member tree panel. */
  onObjectIds: (ids: string[]) => void;
}

type SegmentOf = (objectId: string, group: string) => string;

// ---- Pure helpers outside the scene ---------------------------------

function forEachMesh(root: THREE.Object3D, fn: (m: THREE.Mesh) => void): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) fn(m);
  });
}

function tagsOf(mesh: THREE.Mesh): { objectId: string; group: string; objName: string } {
  const ud = mesh.userData as { objectId?: string; group?: string; objName?: string };
  return {
    objectId: ud.objectId ?? '',
    group: ud.group ?? '',
    objName: ud.objName ?? mesh.name,
  };
}

/* Camera fit by projecting the corners; the same formula as fit in Model.tsx. */
function fitCameraToBox(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  box: THREE.Box3,
  pad: number,
  dir?: THREE.Vector3,
): void {
  const center = box.getCenter(new THREE.Vector3());
  const dirV = dir ?? camera.position.clone().sub(controls.target).normalize();
  if (dirV.lengthSq() < 1e-6) dirV.set(0.45, 0.28, 1).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dirV).normalize();
  const camUp = new THREE.Vector3().crossVectors(dirV, right).normalize();
  let maxH = 0;
  let maxV = 0;
  for (const cx of [box.min.x, box.max.x])
    for (const cy of [box.min.y, box.max.y])
      for (const cz of [box.min.z, box.max.z]) {
        const v = new THREE.Vector3(cx, cy, cz).sub(center);
        maxH = Math.max(maxH, Math.abs(v.dot(right)));
        maxV = Math.max(maxV, Math.abs(v.dot(camUp)));
      }
  const fovV = (camera.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
  const dist = Math.max(maxV / Math.tan(fovV / 2), maxH / Math.tan(fovH / 2), 8) * pad;
  camera.position.copy(center).addScaledVector(dirV, dist);
  controls.target.copy(center);
  controls.update();
}

/* Selection bounds (min/max, world m) to a three box. */
function boxOf(b: { min: Vec3; max: Vec3 }): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
}

/** Clicked mesh → selection key. */
function clickKeyOf(mesh: THREE.Mesh, segmentOf: SegmentOf): string {
  const t = tagsOf(mesh);
  return segmentOf(t.objectId, t.group) || t.objectId;
}

/* Ghost outside the selection, original material inside. Ghosts are **pickable** too: on this screen switching the selection is the main action. */
function applySelectionMaterial(
  model: THREE.Group,
  sel: ReadonlySet<string>,
  segmentOf: SegmentOf,
  ghostMat: THREE.Material,
): void {
  forEachMesh(model, (mesh) => {
    if (!mesh.userData.__origMat) mesh.userData.__origMat = mesh.material;
    const orig = mesh.userData.__origMat as THREE.Material;
    const dimmed = sel.size > 0 && !meshMatchesSelection(sel, meshSelectionKeys(tagsOf(mesh), segmentOf));
    mesh.userData.__dimmed = dimmed;
    mesh.material = dimmed ? ghostMat : orig;
    mesh.renderOrder = dimmed ? -1 : 0; // draw ghosts first so selected members come out on top
  });
}

/* Meshes in the selection (bolts excluded), triangle count and world bbox, in one synchronous pass. */
function collectSelection(
  model: THREE.Group,
  sel: ReadonlySet<string>,
  segmentOf: SegmentOf,
): { meshes: THREE.Mesh[]; triangles: number; bounds: { min: Vec3; max: Vec3 } | null } {
  const meshes: THREE.Mesh[] = [];
  const bbox = new THREE.Box3();
  let triangles = 0;
  if (sel.size > 0) {
    forEachMesh(model, (mesh) => {
      const t = tagsOf(mesh);
      if (isBoltMesh(t.objName)) return; // bolts are not drawn on inspection sheets
      if (!meshMatchesSelection(sel, meshSelectionKeys(t, segmentOf))) return;
      meshes.push(mesh);
      const index = mesh.geometry.getIndex();
      triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3;
      bbox.expandByObject(mesh);
    });
  }
  const bounds = bbox.isEmpty()
    ? null
    : {
        min: [bbox.min.x, bbox.min.y, bbox.min.z] as Vec3,
        max: [bbox.max.x, bbox.max.y, bbox.max.z] as Vec3,
      };
  return { meshes, triangles, bounds };
}

/* Range box visual: lines (Box3Helper) + a very faint face. Uncut axes use the selection bbox. */
function buildClipVisual(clip: ClipBox, bounds: { min: Vec3; max: Vec3 }): THREE.Object3D[] {
  const lo = new THREE.Vector3(
    clip.x?.[0] ?? bounds.min[0],
    clip.y?.[0] ?? bounds.min[1],
    clip.z?.[0] ?? bounds.min[2],
  );
  const hi = new THREE.Vector3(
    clip.x?.[1] ?? bounds.max[0],
    clip.y?.[1] ?? bounds.max[1],
    clip.z?.[1] ?? bounds.max[2],
  );
  const box = new THREE.Box3(lo.clone().min(hi), lo.clone().max(hi));
  const size = box.getSize(new THREE.Vector3());
  const helper = new THREE.Box3Helper(box, new THREE.Color('#2B6CB0'));
  helper.raycast = () => {}; // do not block member picking
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(size.x, 1e-3), Math.max(size.y, 1e-3), Math.max(size.z, 1e-3)),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#2B6CB0'),
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  face.position.copy(box.getCenter(new THREE.Vector3()));
  face.raycast = () => {};
  return [helper, face];
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    const m = child as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  }
}

// ---- Component ------------------------------------------------------

export function SelectViewer({
  selected,
  onSelectedChange,
  clip,
  onMeshes,
  onObjectIds,
}: SelectViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selBounds, setSelBounds] = useState<{ min: Vec3; max: Vec3 } | null>(null);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const clipGroupRef = useRef<THREE.Group | null>(null);
  const ghostMatRef = useRef<THREE.Material | null>(null);
  const segmentOfRef = useRef<SegmentOf>(() => '');
  /* Whether the automatic fit has been used already; see the policy in cameraFit.ts. */
  const autoFitRef = useRef(false);

  // Ref holding the latest values on every render, so effects do not rerun when the parent's callback references change.
  const selRef = useRef<Set<string>>(new Set());
  selRef.current = useMemo(() => new Set(selected), [selected]);
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const cbRef = useRef({ onSelectedChange, onMeshes, onObjectIds });
  cbRef.current = { onSelectedChange, onMeshes, onObjectIds };

  // Arrays and objects may be new references on every render; run the effect only when the contents change.
  const selKey = selected.join('|'); // selection keys never contain '|'
  const clipKey = JSON.stringify(clip);

  // ---- Scene setup + model load (once per mount) --------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const width = () => Math.max(1, host.clientWidth);
    const height = () => Math.max(1, host.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f5f6');
    const camera = new THREE.PerspectiveCamera(50, width() / height(), 0.5, 5000);
    camera.position.set(180, 120, 420);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width(), height());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 30, 120);
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dade, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(180, 260, 120);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dir2.position.set(-160, 150, -140);
    scene.add(dir2);

    const model = new THREE.Group();
    model.name = 'bridge';
    scene.add(model);
    modelRef.current = model;

    // The range box lives outside the model (a scene child), so it stays out of isolation traversal, picking and dispose.
    const clipGroup = new THREE.Group();
    clipGroup.name = 'cliprange';
    clipGroup.visible = false;
    scene.add(clipGroup);
    clipGroupRef.current = clipGroup;

    // Ghost material for members outside the selection, shared by all meshes (no clones).
    const ghostMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color('#9AA8B0'),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ghostMatRef.current = ghostMat;

    const onResize = () => {
      camera.aspect = width() / height();
      camera.updateProjectionMatrix();
      renderer.setSize(width(), height());
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    let alive = true;
    let raf = 0;
    const loop = () => {
      if (!alive) return;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    // ---- Picking: a click only when the pointer barely moved ----
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let armed = false;

    const onPointerDown = (ev: PointerEvent) => {
      armed = ev.button === 0;
      downX = ev.clientX;
      downY = ev.clientY;
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (!armed) return;
      armed = false;
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) >= CLICK_SLOP) return; // orbiting

      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      // Ghosts (outside the selection) are picked too: a plain click **replaces** the selection with that member, Ctrl/Cmd adds or removes.
      // (Without ghosts, switching to another member would need "Clear all" every time.)
      const hit = ray.intersectObject(model, true).find((h) => h.object.visible);
      if (!hit) return; // clicks on empty space are ignored

      const key = clickKeyOf(hit.object as THREE.Mesh, segmentOfRef.current);
      if (!key) return;
      const cur = selRef.current;
      if (ev.ctrlKey || ev.metaKey) {
        const next = new Set(cur);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        cbRef.current.onSelectedChange([...next]);
      } else {
        cbRef.current.onSelectedChange([key]);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ---- Load ----------------------------------------------------
    void (async () => {
      try {
        const { manifest } = await loadBridge(model, () => {});
        if (!alive) return; // late arrival after a StrictMode double mount/unmount
        const ids = manifest.groups.flatMap((g) => g.objects.map((o) => o.id));
        segmentOfRef.current = makeSegmentOf(ids);
        cbRef.current.onObjectIds(ids);
        const box = new THREE.Box3().setFromObject(model);
        if (!box.isEmpty())
          fitCameraToBox(camera, controls, box, FIT_PAD_INITIAL, new THREE.Vector3(0.45, 0.28, 1).normalize());
        setPhase('ready');
      } catch (e) {
        if (!alive) return;
        console.error('[SelectViewer] load error', e);
        setError(String((e as Error).message ?? e));
        setPhase('error');
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      clearGroup(clipGroup);
      clipGroupRef.current = null;
      ghostMat.dispose();
      ghostMatRef.current = null;
      forEachMesh(model, (m) => {
        m.geometry.disposeBoundsTree?.();
        m.geometry.dispose();
        const mat = m.userData.__origMat ?? m.material;
        if (Array.isArray(mat)) mat.forEach((x: THREE.Material) => x.dispose());
        else (mat as THREE.Material | undefined)?.dispose();
      });
      modelRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      scene.clear();
    };
  }, []);

  // ---- Apply the selection: materials, extraction, camera -----------
  useEffect(() => {
    const model = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const ghostMat = ghostMatRef.current;
    if (phase !== 'ready' || !model || !camera || !controls || !ghostMat) return;

    const sel = selRef.current;
    const segmentOf = segmentOfRef.current;
    applySelectionMaterial(model, sel, segmentOf, ghostMat);

    const { meshes, triangles, bounds } = collectSelection(model, sel, segmentOf);
    setSelBounds(bounds);
    if (sel.size === 0) cbRef.current.onMeshes([], null, { triangles: 0, tooLarge: false });
    else if (triangles > EXTRACT_LIMIT) cbRef.current.onMeshes([], bounds, { triangles, tooLarge: true });
    else cbRef.current.onMeshes(meshes.map(extractMeshInput), bounds, { triangles, tooLarge: false });

    // The automatic fit happens once, when a part is first resolved; after that only the "Fit selection" button moves the camera (cameraFit.ts).
    // If the camera flew off on every selection, neighbouring members could not be added with Ctrl+click in 3D.
    const decision = autoFitDecision(autoFitRef.current, bounds !== null);
    autoFitRef.current = decision.fittedOnce;
    if (decision.fit && bounds) fitCameraToBox(camera, controls, boxOf(bounds), FIT_PAD);
    // selKey: only when the selection contents change (not the array reference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, phase]);

  // ---- Range box --------------------------------------------------
  useEffect(() => {
    const group = clipGroupRef.current;
    if (!group) return;
    clearGroup(group);
    const c = clipRef.current;
    if (!selBounds || (!c.x && !c.y && !c.z)) {
      group.visible = false;
      return;
    }
    for (const o of buildClipVisual(c, selBounds)) group.add(o);
    group.visible = true;
    // clipKey: only when the value changes (not the object reference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey, selBounds, phase]);

  /* "Fit selection": fits the camera to the selection bounds, or to the whole bridge when nothing is selected. */
  const fitView = () => {
    const model = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!model || !camera || !controls) return;
    const box = selBounds ? boxOf(selBounds) : new THREE.Box3().setFromObject(model);
    if (!box.isEmpty()) fitCameraToBox(camera, controls, box, selBounds ? FIT_PAD : FIT_PAD_INITIAL);
  };

  return (
    <Box style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} data-testid="select-viewer-host" />

      {phase === 'ready' ? (
        <Button
          size="compact-xs"
          variant="default"
          onClick={fitView}
          style={{ position: 'absolute', right: 8, top: 8 }}
          data-testid="fit-view"
        >
          {selBounds ? SProposal.fitSelection : SProposal.fitAll}
        </Button>
      ) : null}

      <Box style={{ position: 'absolute', left: 10, bottom: 8, pointerEvents: 'none', maxWidth: '70%' }}>
        <Text size="10px" c="dimmed" lh={1.4}>
          {phase === 'ready' ? SProposal.viewerHint : phase === 'loading' ? SProposal.viewerLoading : ''}
        </Text>
      </Box>

      {phase === 'error' ? (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.92)',
            padding: 12,
          }}
        >
          <Text size="11px" c="#9B1C1C" ta="center" lh={1.5}>
            {SProposal.viewerError}
            <br />
            <Text span size="10px" c="dimmed">
              {error}
            </Text>
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
