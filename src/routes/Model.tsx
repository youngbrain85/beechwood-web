import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ActionIcon,
  Button,
  Group,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { DamagePhotos } from '@/components/DamagePhotos';
import { PageHeader } from '@/components/PageHeader';
import { SectionTreeRows } from '@/components/MemberTreeNodes';
import { bridge } from '@/bridge';
import { loadBridge } from '@/lib/glb/loader';
import { markerTexture } from '@/lib/glb/markers';
import {
  useDamages,
  useMembers,
  useObjects,
  useObjectSummary,
} from '@/hooks/useSupabase';
import type {
  DamageWithDetails,
  MemberRow,
  ObjectRow,
  ObjectSummaryRow,
} from '@/types/db';
import type { ObjectInfo } from '@/bridge/types';
import {
  makeSegmentOf,
  meshMatchesSelection,
  meshSelectionKeys,
} from '@/lib/glb/memberTree';
// AASHTO
import { AashtoDamageForm } from '@/components/aashto/AashtoDamageForm';
import { CsBadge, defectLabel } from '@/components/aashto/cs';
import { formContext } from '@/components/aashto/damageForm';
import { formatQty } from '@/components/aashto/format';
import { CsHeatmapLegend } from '@/components/aashto/legends';
import { csCounts, damageCs } from '@/components/aashto/rows';
import { useAashtoData } from '@/components/aashto/useAashtoData';
import { SEval } from '@/i18n/s.eval';
import { NOT_RATED_COLOUR, SELECTION_COLOUR, SELECTION_EMISSIVE, csColour, type ConditionState } from '@/lib/eval/aashto';

// ------------------------------------------------------------------
//  3D view: the GLB model (meshopt-compressed) + BVH picking.
//  World = GLB frame (m, Y-up, x = transverse, y = elevation, z = station).
//  Damage data: Supabase damages.position, GLB world coordinates as is.
// ------------------------------------------------------------------

interface Picked {
  objName: string;
  member: string | null;
  /* Fine member: the vocabulary of objectInfo of the bridge profile */
  fine: ObjectInfo<string>['fine'];
  locationDetail: string;
  el: string;
  /* objects.object_code (= GLB segment id) */
  objectCode: string;
  /* Click hit.point: GLB world coordinates (used by the damage form) */
  hitPoint: { x: number; y: number; z: number };
}

interface Hovered {
  damageId: string;
  faultType: string;
  member?: string;
  roundLabel: string;
  x: number;
  y: number;
}

/** ISO timestamp → YYYY-MM-DD */
function fmtDay(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '-';
}

export function Model() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ meshes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pickedDamage, setPickedDamage] = useState<DamageWithDetails | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [heatmap, setHeatmap] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const damageGroupRef = useRef<THREE.Group | null>(null);

  const objectsSnap = useObjects();
  const summarySnap = useObjectSummary();
  const damagesSnap = useDamages();
  const membersSnap = useMembers(); // member register
  // AASHTO — object elements · worst condition state (heatmap) · defect list of the registration form.
  const aashto = useAashtoData(objectsSnap, damagesSnap);
  const [objectIds, setObjectIds] = useState<string[]>([]);
  /* Isolation: null = everything, otherwise the set of objectIds to show (per member or per segment) */
  const [isolated, setIsolated] = useState<string[] | null>(null);
  const [isolatedKey, setIsolatedKey] = useState<string | null>(null);
  // For verification and integration: isolation can be controlled from outside (console)
  useEffect(() => {
    (window as unknown as { __isolate: (id: string | null) => void }).__isolate = (
      id,
    ) => {
      setIsolated(id ? [id] : null);
      setIsolatedKey(id);
    };
  }, []);

  // On a member tree selection the rest is **not hidden but left as a translucent ghost**
  // (the position of the selected member within the whole structure has to stay visible).
  // The actual materials are applied by the single "material decision" effect below, together with the heatmap.

  // ---- three setup + model load ------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f5f6');
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.5,
      5000,
    );
    camera.position.set(180, 120, 420);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 30, 120);

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

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // For verification: exposes the scene graph and camera (checking annotation groups and so on)
    (
      window as unknown as {
        __view: { scene: THREE.Scene; camera: THREE.PerspectiveCamera };
      }
    ).__view = { scene, camera };

    // For verification: benchmark, mean ms over 60 forced renders (independent of rAF throttling)
    (window as unknown as { __bench: () => number }).__bench = () => {
      renderer.render(scene, camera);
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) renderer.render(scene, camera);
      return (performance.now() - t0) / 60;
    };

    // For verification: capture helper, reads the pixels right after a forced render outside rAF
    (window as unknown as { __capture: (w?: number) => string }).__capture = (w = 640) => {
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = Math.round((src.height / src.width) * w);
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.6);
    };

    let alive = true;
    const loop = () => {
      if (!alive) return;
      controls.update();
      const dg = damageGroupRef.current;
      if (dg) {
        for (const c of dg.children) {
          if (c.userData?.isDamageMarker) c.quaternion.copy(camera.quaternion);
        }
      }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    loop();

    // ---- Load ----------------------------------------------------
    (async () => {
      try {
        const { manifest, meshCount } = await loadBridge(model, (p) =>
          setProgress(Math.round((p.loaded / p.total) * 100)),
        );
        // StrictMode double-mount guard: prevents a late load of the discarded mount from
        // overwriting sceneRef/modelRef with a dead scene (which would leave the overlay missing)
        if (!alive) return;
        setObjectIds(
          manifest.groups.flatMap((g) => g.objects.map((o) => o.id)),
        );
        // Camera fit by projecting the corners
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const dirV = new THREE.Vector3(0.45, 0.28, 1).normalize();
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
        const dist = Math.max(maxV / Math.tan(fovV / 2), maxH / Math.tan(fovH / 2)) * 1.12;
        camera.position.copy(center).addScaledVector(dirV, dist);
        controls.target.copy(center);
        controls.update();

        setStats({ meshes: meshCount });
        setPhase('ready');
        sceneRef.current = scene;
        cameraRef.current = camera;
        modelRef.current = model;
        setModelReady(true);
      } catch (e) {
        console.error('[Model] load error', e);
        setError(String((e as Error).message ?? e));
        setPhase('error');
      }
    })();

    // ---- Picking ----------------------------------------------------
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    const mouse = new THREE.Vector2();
    const originalMat = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    // Selection highlight — blue, so it is not mistaken for the CS4 red of the condition heatmap
    const hlMat = new THREE.MeshLambertMaterial({
      color: parseInt(SELECTION_COLOUR.slice(1), 16),
      emissive: parseInt(SELECTION_EMISSIVE.slice(1), 16),
      side: THREE.DoubleSide,
    });
    const restore = () => {
      for (const [m, mat] of originalMat) m.material = mat;
      originalMat.clear();
    };

    const onClick = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1) Damage markers first; markers with visible=false are excluded
      //    (the three Raycaster does not skip invisible objects by itself)
      const dg = damageGroupRef.current;
      if (dg) {
        const mHits = raycaster.intersectObjects(
          dg.children.filter(
            (c) => (c as THREE.Mesh).isMesh && c.visible && c.userData?.isDamageMarker,
          ),
          false,
        );
        if (mHits.length > 0) {
          const id = mHits[0].object.userData.damageId as string | undefined;
          const dmg = id ? damagesByIdRef.current.get(id) : null;
          if (dmg) {
            restore();
            setPicked(null);
            setPickedDamage(dmg);
            return;
          }
        }
      }

      // 2) Member meshes: translucent ghosts (unselected members) and hidden meshes (visible=false)
      //    are skipped, so the selected member stays clickable and usable.
      const hits = raycaster
        .intersectObject(model, true)
        .filter(
          (h) => h.object.visible && !(h.object.userData.__dimmed as boolean),
        );
      if (hits.length === 0) {
        restore();
        setPicked(null);
        setPickedDamage(null);
        return;
      }
      const mesh = hits[0].object as THREE.Mesh;
      restore();
      originalMat.set(mesh, mesh.material);
      mesh.material = hlMat;

      const p = hits[0].point;
      // Object code resolution: the segment id first, else the group-level object as a fallback
      const rawCode = (mesh.userData.objectId as string) ?? '';
      const groupCode = (mesh.userData.group as string) ?? '';
      const codes = objectByCodeRef.current;
      const objectCode = codes.has(rawCode)
        ? rawCode
        : codes.has(groupCode)
          ? groupCode
          : rawCode;
      setPickedDamage(null);
      setPicked({
        objName: mesh.userData.objName ?? mesh.name,
        member: (mesh.userData.member as string | null) ?? null,
        fine: mesh.userData.fine ?? bridge.proposal.fallbackFine,
        locationDetail: mesh.userData.locationDetail ?? '',
        el: mesh.userData.el ?? '',
        objectCode,
        hitPoint: { x: p.x, y: p.y, z: p.z },
      });
    };
    container.addEventListener('click', onClick);

    const onMove = (ev: MouseEvent) => {
      const dg = damageGroupRef.current;
      if (!dg) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(
        dg.children.filter(
          (c) => (c as THREE.Mesh).isMesh && c.visible && c.userData?.isDamageMarker,
        ),
        false,
      );
      if (hits.length > 0) {
        const ud = hits[0].object.userData as Partial<Hovered> & { damageId?: string };
        if (ud.damageId) {
          setHovered({
            damageId: ud.damageId,
            faultType: (ud.faultType as string) ?? '',
            member: ud.member as string | undefined,
            roundLabel: (ud.roundLabel as string) ?? '',
            x: ev.clientX - rect.left,
            y: ev.clientY - rect.top,
          });
          container.style.cursor = 'pointer';
          return;
        }
      }
      setHovered(null);
      container.style.cursor = '';
    };
    container.addEventListener('mousemove', onMove);

    return () => {
      alive = false;
      container.removeEventListener('click', onClick);
      container.removeEventListener('mousemove', onMove);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container)
        container.removeChild(renderer.domElement);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) {
          m.geometry.disposeBoundsTree?.();
          m.geometry.dispose();
        }
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      scene.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Indexes derived from Supabase data --------------------------------------
  const objectByCode = useMemo(() => {
    const m = new Map<string, ObjectRow>();
    for (const o of objectsSnap.data) m.set(o.object_code, o);
    return m;
  }, [objectsSnap.data]);
  const objectByCodeRef = useRef(objectByCode);
  objectByCodeRef.current = objectByCode;

  const summaryByCode = useMemo(() => {
    const m = new Map<string, ObjectSummaryRow>();
    for (const s of summarySnap.data) m.set(s.object_code, s);
    return m;
  }, [summarySnap.data]);

  // ---- GLB mesh to segment (manifest object id) mapping -----------------
  //  A GLB node name can be a segment id followed by part and index suffixes,
  //  while the member tree and the data use the manifest's segment ids.
  //  Exact matching alone would only catch names that happen to equal an id,
  //  so the segment is decided by the **longest prefix match**.
  const segmentOf = useMemo(() => makeSegmentOf(objectIds), [objectIds]);

  const summaryByObjectId = useMemo(() => {
    const m = new Map<string, ObjectSummaryRow>();
    for (const s of summarySnap.data) m.set(s.object_id, s);
    return m;
  }, [summarySnap.data]);

  const damagesById = useMemo(() => {
    const m = new Map<string, DamageWithDetails>();
    for (const d of damagesSnap.data) m.set(d.id, d);
    return m;
  }, [damagesSnap.data]);
  const damagesByIdRef = useRef(damagesById);
  damagesByIdRef.current = damagesById;

  // ---- Damage overlay: damages.position (GLB world coordinates as is) ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!modelReady || !scene) return;

    if (damageGroupRef.current) {
      scene.remove(damageGroupRef.current);
      damageGroupRef.current.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      damageGroupRef.current = null;
    }
    if (damagesSnap.data.length === 0) return;

    // Surface snap: the residual of the sheet view-plane anchor (tapered members, cross slope and so on) is
    // corrected with the closest point on the real mesh, so the marker sits on the member surface (BVH closestPointToPoint).
    // The database coordinates are untouched and only the display snaps; the shift is a rigid translation from one center point (shape preserved).
    const SNAP_MAX_M = 3.0;
    const snapMeshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m.geometry as { boundsTree?: unknown } | undefined)?.boundsTree) {
        snapMeshes.push(m);
      }
    });
    const snapDelta = (p: THREE.Vector3): THREE.Vector3 => {
      let bestDist = SNAP_MAX_M;
      const bestPt = new THREE.Vector3();
      let found = false;
      const target = {
        point: new THREE.Vector3(),
        distance: 0,
        faceIndex: 0,
      };
      for (const mesh of snapMeshes) {
        const bt = (
          mesh.geometry as unknown as {
            boundsTree: {
              closestPointToPoint: (
                pt: THREE.Vector3,
                t: typeof target,
                min?: number,
                max?: number,
              ) => typeof target | null;
            };
          }
        ).boundsTree;
        const local = mesh.worldToLocal(p.clone());
        const hit = bt.closestPointToPoint(local, target, 0, bestDist);
        if (hit && hit.distance < bestDist) {
          bestDist = hit.distance;
          bestPt.copy(mesh.localToWorld(hit.point.clone()));
          found = true;
        }
      }
      return found ? bestPt.sub(p) : new THREE.Vector3();
    };

    const dg = new THREE.Group();
    dg.name = 'damages';
    let plotted = 0;
    for (const damage of damagesSnap.data) {
      const pos = damage.position;
      if (
        !pos ||
        typeof pos.x !== 'number' ||
        typeof pos.y !== 'number' ||
        typeof pos.z !== 'number'
      )
        continue;

      const fault = damage.fault_type ? damage.fault_type.trim() : '(Unclassified)';
      // Marker colour = condition state of the latest observation (CS1–CS4, grey when there is none)
      const markerCs = damageCs(damage);
      const color = parseInt((markerCs ? csColour(markerCs) : NOT_RATED_COLOUR).slice(1), 16);
      // With a path it is a polyline (world coordinates); a polygon is drawn closed
      const pathPts = (pos.path ?? [])
        .filter(
          (p) =>
            typeof p.x === 'number' &&
            typeof p.y === 'number' &&
            typeof p.z === 'number',
        )
        .map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const center = new THREE.Vector3(pos.x, pos.y, pos.z);
      const delta = snapDelta(center);
      if (delta.lengthSq() > 1e-8) {
        center.add(delta);
        for (const p of pathPts) p.add(delta);
      }
      if (pathPts.length >= 2) {
        const linePts =
          damage.shape_kind === 'polygon' ? [...pathPts, pathPts[0]!] : pathPts;
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(linePts),
          new THREE.LineBasicMaterial({ color, depthTest: false }),
        );
        line.renderOrder = 999;
        dg.add(line);
        center.set(0, 0, 0);
        for (const p of pathPts) center.add(p);
        center.divideScalar(pathPts.length);
      }
      if (pos.normal && pos.normal.length === 3) {
        center.addScaledVector(
          new THREE.Vector3(...pos.normal).normalize(),
          0.6,
        );
      }

      const summary = damage.object_id
        ? summaryByObjectId.get(damage.object_id)
        : undefined;
      const disc = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 3),
        new THREE.MeshBasicMaterial({
          map: markerTexture(color),
          depthTest: false,
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      disc.position.copy(center);
      disc.renderOrder = 1000;
      disc.userData = {
        damageId: damage.id,
        faultType: fault,
        member: summary?.member ?? undefined,
        roundLabel: damage.inspections?.round_label ?? '',
        isDamageMarker: true,
      };
      dg.add(disc);
      plotted += 1;
    }
    scene.add(dg);
    damageGroupRef.current = dg;
    console.log(`[Model] damage overlay ${plotted}/${damagesSnap.data.length}`);
    // For verification: exposes the marker world coordinates
    (window as unknown as { __dmgPos: unknown }).__dmgPos = dg.children
      .filter((c) => c.userData?.isDamageMarker)
      .map((c) => ({
        fault: c.userData.faultType,
        round: c.userData.roundLabel,
        pos: c.position.toArray().map((v: number) => Number(v.toFixed(1))),
      }));
  }, [modelReady, damagesSnap.data, summaryByObjectId]);

  // ---- Material decision (single path) --------------------------------------
  //  The heatmap (condition colors) and member selection (unselected translucent) are decided in **one effect**.
  //  If two places each changed mesh.material they would overwrite each other's original (__origMat):
  //  selecting a member with the heatmap on would tangle the colors and break the restore.
  //
  //  Priority: original, then (with the heatmap) the condition color, then (with a selection) unselected ones become ghosts
  useEffect(() => {
    const model = modelRef.current;
    if (!modelReady || !model) return;

    const cacheMat = new Map<string, THREE.MeshLambertMaterial>();
    const gradeMat = (hex: string) => {
      let m = cacheMat.get(hex);
      if (!m) {
        m = new THREE.MeshLambertMaterial({
          color: new THREE.Color(hex),
          side: THREE.DoubleSide,
        });
        cacheMat.set(hex, m);
      }
      return m;
    };
    // Ghost for unselected members, shared by all meshes (no clones), so it costs no memory or draw calls.
    // A light grey close to the background (#f4f5f6) at low opacity keeps only the shape,
    // so the selected members in their original material stand out by contrast.
    const ghostMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color('#CCD2D8'),
      transparent: true,
      opacity: 0.07, // just an outline, so the selected members clearly stand out
      depthWrite: false, // suppresses sorting artefacts where translucent faces overlap
      side: THREE.DoubleSide,
    });

    const sel = isolated ? new Set(isolated) : null;

    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The original material is stored once only (and kept through every later mode)
      if (!mesh.userData.__origMat) mesh.userData.__origMat = mesh.material;
      const orig = mesh.userData.__origMat as THREE.Material;

      const objectId = (mesh.userData.objectId as string | undefined) ?? '';
      const groupCode = (mesh.userData.group as string | undefined) ?? '';
      // Selection is tested per segment: the ids the tree passes are manifest object ids.
      // Virtual keys (<group>::<key>) are tested by mesh name.
      const dimmed =
        sel != null &&
        !meshMatchesSelection(
          sel,
          meshSelectionKeys(
            {
              objectId,
              group: groupCode,
              objName: (mesh.userData.objName as string) ?? mesh.name,
            },
            segmentOf,
          ),
        );
      // Translucent members are not click targets, so the selected member stays usable.
      mesh.userData.__dimmed = dimmed;

      if (dimmed) {
        mesh.material = ghostMat;
        mesh.renderOrder = -1; // draw ghosts first so selected members come out on top
        return;
      }
      mesh.renderOrder = 0;
      if (!heatmap) {
        mesh.material = orig;
        return;
      }
      // Heatmap — worst condition state per object (CS1 when it has an element and no damage; grey for
      // objects without an element and for the ground)
      const cs = aashto?.worstCs.get(objectId);
      mesh.material = gradeMat(cs ? csColour(cs) : NOT_RATED_COLOUR);
    });

    return () => {
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const orig = mesh.userData.__origMat as THREE.Material | undefined;
        if (orig) mesh.material = orig;
        mesh.userData.__dimmed = false;
      });
      for (const m of cacheMat.values()) m.dispose();
      ghostMat.dispose();
    };
  }, [
    heatmap,
    isolated,
    modelReady,
    summaryByCode,
    segmentOf,
    aashto?.worstCs,
  ]);

  // ---- Camera move on member selection -----------------------------------
  //  Choosing a member in the tree fits the camera to that member's bbox (the viewing angle is kept,
  //  only the distance changes). On a portrait phone this brings an off-screen member into view
  //  with one click.
  //  NOTE: declared after the material effect, so it runs once the __dimmed decision is done.
  useEffect(() => {
    const model = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!modelReady || !model || !camera || !controls) return;

    const box = new THREE.Box3();
    if (isolated) {
      const sub = new THREE.Box3();
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.__dimmed) return;
        sub.expandByObject(mesh);
      });
      if (sub.isEmpty()) return;
      box.copy(sub);
    } else {
      box.setFromObject(model);
    }
    const center = box.getCenter(new THREE.Vector3());
    // Keep the current viewing direction
    const dirV = camera.position.clone().sub(controls.target).normalize();
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
    const dist = Math.max(maxV / Math.tan(fovV / 2), maxH / Math.tan(fovH / 2), 8) * 1.2;
    camera.position.copy(center).addScaledVector(dirV, dist);
    controls.target.copy(center);
    controls.update();
  }, [isolated, modelReady]);

  const pickedSummary = picked ? summaryByCode.get(picked.objectCode) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        title="3D View"
        subtitle={`3D model of ${bridge.texts.bridgeName} · GLB · built from the plan dimensions`}
        right={
          <Text size="xs" c="dimmed" className="tnum">
            {phase === 'ready'
              ? `Meshes ${stats?.meshes ?? 0} · Damages ${damagesSnap.data.length}`
              : ''}
          </Text>
        }
      />
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

        {phase === 'loading' ? (
          <Paper withBorder p="md" style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', width: 280 }}>
            <Text size="sm" fw={600} mb={8}>
              Loading model…
            </Text>
            <Progress value={progress} size="sm" animated />
          </Paper>
        ) : null}

        {phase === 'error' ? (
          <Paper withBorder p="md" style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}>
            <Text size="sm" c="red" fw={600}>
              Failed to load 3D model
            </Text>
            <Text size="xs" c="dimmed">
              {`${error} — check the path ${bridge.model.manifestUrl}`}
            </Text>
          </Paper>
        ) : null}

        {/* Top left: heatmap toggle + legend */}
        <Stack gap={8} style={{ position: 'absolute', left: 16, top: 16 }}>
          <Paper withBorder px="sm" py={6}>
            <Group gap={14} wrap="wrap">
              <Switch
                size="xs"
                label={SEval.model.heatmap}
                checked={heatmap}
                onChange={(e) => setHeatmap(e.currentTarget.checked)}
              />
            </Group>
          </Paper>
          <ObjectTree
            objectIds={objectIds}
            selectedKey={isolatedKey}
            onSelect={(key, ids) => {
              setIsolatedKey(key);
              setIsolated(ids);
            }}
          />
          {heatmap ? (
            <CsHeatmapLegend counts={csCounts(aashto?.worstCs ?? new Map<string, ConditionState | null>())} />
          ) : null}
        </Stack>

        {/* Bottom left: control hints */}
        <Paper withBorder px="sm" py={6} style={{ position: 'absolute', left: 16, bottom: 16 }}>
          <Text size="10px" c="dimmed">
            Left-drag rotate · right-drag pan · wheel zoom · click a mesh for member info · click a marker for damage details
          </Text>
        </Paper>

        {picked ? (
          <PickedPanel
            info={picked}
            summary={pickedSummary}
            aashto={pickedAashto(picked.objectCode, objectByCode, aashto)}
            canRegister={objectByCode.has(picked.objectCode)}
            onRegister={() => setFormOpen(true)}
            onClose={() => setPicked(null)}
          />
        ) : null}
        {pickedDamage ? (
          <DamagePanel
            damage={pickedDamage}
            summary={
              pickedDamage.object_id
                ? summaryByObjectId.get(pickedDamage.object_id)
                : undefined
            }
            onClose={() => setPickedDamage(null)}
          />
        ) : null}

        {hovered ? (
          <Paper
            withBorder
            px="sm"
            py={6}
            style={{ position: 'absolute', left: hovered.x + 14, top: hovered.y + 14, pointerEvents: 'none', maxWidth: 260 }}
          >
            <Text size="xs" fw={600}>
              {hovered.faultType || 'Damage'}
            </Text>
            {hovered.member ? (
              <Text size="10px" c="dimmed">
                {`Member: ${hovered.member}`}
              </Text>
            ) : null}
            {hovered.roundLabel ? (
              <Text size="9px" c="dimmed">
                {hovered.roundLabel}
              </Text>
            ) : null}
          </Paper>
        ) : null}

        {/* Registration form — defects (filtered by the object's element category) · CS 1–4 · quantity + unit */}
        <AashtoDamageForm
          opened={formOpen}
          target={picked}
          object={picked ? objectByCode.get(picked.objectCode) : undefined}
          ctx={aashtoFormContext(picked ? objectByCode.get(picked.objectCode) : undefined, aashto, membersSnap.data)}
          onClose={() => setFormOpen(false)}
          onRegistered={() => {
            setFormOpen(false);
            damagesSnap.refetch();
            summarySnap.refetch();
          }}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
//  heatmap legend: distribution of the worst state per object
// ------------------------------------------------------------------
/**
 * Member > segment tree browser (isolation view).
 *
 * The top level holds the **evaluation section** nodes of the bridge profile, each with its
 *   member tree below. There is one bridge; a section is a unit of evaluation.
 * A manifest id equals the **database objects.object_code**, so a tree id is an object code.
 */
function ObjectTree({
  objectIds,
  selectedKey,
  onSelect,
}: {
  objectIds: string[];
  selectedKey: string | null;
  onSelect: (key: string | null, ids: string[] | null) => void;
}) {
  // Section trees — from the bridge profile.
  const trees = useMemo(() => bridge.trees(objectIds), [objectIds]);

  return (
    <Paper withBorder w={248}>
      <Group justify="space-between" px="sm" py={6} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Text size="xs" fw={700}>
          Member Tree
        </Text>
        <Button size="compact-xs" variant={selectedKey ? 'light' : 'subtle'} onClick={() => onSelect(null, null)}>
          Show All
        </Button>
      </Group>
      <ScrollArea.Autosize mah={320}>
        {/* Section trees of the profile (one section: member ▸ span/bent ▸ part) */}
        {trees.map((t) => (
          <SectionTreeRows key={t.section} tree={t} selectedKey={selectedKey} onSelect={onSelect} />
        ))}
      </ScrollArea.Autosize>
    </Paper>
  );
}

// ------------------------------------------------------------------
//  AASHTO helpers — element and worst condition state of the picked object, registration form context
// ------------------------------------------------------------------
type AashtoModelData = NonNullable<ReturnType<typeof useAashtoData>>;

interface PickedAashto {
  cs: ConditionState | null;
  element: { no: number; name: string; unit: string } | null;
}

function pickedAashto(objectCode: string, objectByCode: Map<string, ObjectRow>, a: AashtoModelData): PickedAashto {
  const obj = objectByCode.get(objectCode);
  const no = obj ? a.elementByObjectId.get(obj.id) : undefined;
  const info = no === undefined ? undefined : a.elements.get(no);
  return {
    cs: a.worstCs.get(objectCode) ?? null,
    element: no !== undefined && info ? { no, name: info.name, unit: info.unit } : null,
  };
}

function aashtoFormContext(obj: ObjectRow | undefined, a: AashtoModelData | null, members: MemberRow[]) {
  if (!obj || !a) return null;
  const member = members.find((m) => m.id === obj.member_id);
  return formContext(obj.id, a.elementByObjectId, a.elements, member?.category, a.elementQtyByObjectId);
}

// ------------------------------------------------------------------
//  Member (object) info panel: damage count of v_object_summary + damage registration
// ------------------------------------------------------------------
function PickedPanel({
  info,
  summary,
  aashto,
  canRegister,
  onRegister,
  onClose,
}: {
  info: Picked;
  summary: ObjectSummaryRow | undefined;
  /** Element and worst condition state of the object */
  aashto?: PickedAashto;
  canRegister: boolean;
  onRegister: () => void;
  onClose: () => void;
}) {
  // Hand over to sheet proposals; a proposal does not depend on the object register (no database object is needed).
  const navigate = useNavigate();
  return (
    <Paper withBorder w={300} style={{ position: 'absolute', right: 16, top: 16 }}>
      <Group justify="space-between" px="md" py={8} bg="var(--mantine-color-gray-0)" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Text size="sm" fw={700}>
          Member Info
        </Text>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose} aria-label="Close">
          ×
        </ActionIcon>
      </Group>
      <Table verticalSpacing={6} fz="xs">
        <Table.Tbody>
          <Row label="Member">
            <Text size="sm" fw={600} span>
              {info.fine}
            </Text>
            {info.member && info.member !== info.fine ? (
              <Text size="xs" c="dimmed" span ml={6}>
                {`(${info.member} group)`}
              </Text>
            ) : null}
          </Row>
          <Row label="Location">{info.locationDetail || '-'}</Row>
          {info.el ? <Row label="Range">{info.el}</Row> : null}
          <Row label="Object">{info.objName}</Row>
          <Row label="Object Code">
            <span className="tnum">{info.objectCode || '-'}</span>
          </Row>
          <Row label="Damages">
            <span className="tnum">{summary ? summary.damage_count : '-'}</span>
          </Row>
          <Row label={SEval.element}>
            {aashto?.element ? SEval.numbered(aashto.element.no, aashto.element.name) : SEval.noElement}
          </Row>
          <Row label={SEval.model.worstCs}>{aashto?.cs ? <CsBadge cs={aashto.cs} /> : '-'}</Row>
          <Row label="Last Observed">
            <span className="tnum">{fmtDay(summary?.last_observed)}</span>
          </Row>
        </Table.Tbody>
      </Table>
      <div style={{ padding: 12, borderTop: '1px solid var(--mantine-color-gray-3)' }}>
        <Button size="xs" fullWidth disabled={!canRegister} onClick={onRegister}>
          Register Damage
        </Button>
        <Button
          size="xs"
          variant="default"
          fullWidth
          mt={6}
          onClick={() => navigate('/proposals?ids=' + encodeURIComponent(info.objectCode))}
        >
          Create Map Candidates for This Part
        </Button>
        {!canRegister ? (
          <Text size="9px" c="dimmed" mt={4}>
            This segment is not in the object register (objects)
          </Text>
        ) : null}
      </div>
    </Paper>
  );
}

// ------------------------------------------------------------------
//  Damage detail panel: damages + damage_observations
// ------------------------------------------------------------------
function DamagePanel({
  damage,
  summary,
  onClose,
}: {
  damage: DamageWithDetails;
  summary: ObjectSummaryRow | undefined;
  onClose: () => void;
}) {
  const pos = damage.position;
  return (
    <Paper withBorder w={330} style={{ position: 'absolute', right: 16, top: 16, maxHeight: 'calc(100% - 32px)', overflow: 'auto' }}>
      <Group justify="space-between" px="md" py={8} bg="var(--mantine-color-gray-0)" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Text size="sm" fw={700}>
          Damage Details
        </Text>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose} aria-label="Close">
          ×
        </ActionIcon>
      </Group>
      <Group justify="space-between" px="md" py={8} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Text size="sm" fw={700}>
          {defectLabel(damage.defect_no, damage.fault_type)}
        </Text>
        <CsBadge cs={damageCs(damage)} />
      </Group>
      {/* Photos of this damage (read only), oldest first; a click enlarges */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <DamagePhotos damage={damage} thumbW={140} thumbH={105} />
      </div>
      <Table verticalSpacing={6} fz="xs">
        <Table.Tbody>
          {summary?.member ? <Row label="Member">{summary.member}</Row> : null}
          {summary?.object_code ? (
            <Row label="Object Code">
              <span className="tnum">{summary.object_code}</span>
            </Row>
          ) : null}
          <Row label="Round">{damage.inspections?.round_label ?? '-'}</Row>
          {pos ? (
            <Row label="Coords">
              <span className="tnum">
                x {pos.x.toFixed(1)} · y {pos.y.toFixed(1)} · z {pos.z.toFixed(1)}
              </span>
            </Row>
          ) : null}
          {damage.fault_detail ? <Row label={SEval.location}>{damage.fault_detail}</Row> : null}
          {damage.repair_method ? <Row label="Repair Method">{damage.repair_method}</Row> : null}
          <Row label="Registered On">
            <span className="tnum">{fmtDay(damage.created_at)}</span>
          </Row>
        </Table.Tbody>
      </Table>
      {damage.damage_observations.map((obs, i) => (
        <div key={obs.id} style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
          <Group justify="space-between" px="md" py={6} bg="var(--mantine-color-gray-0)">
            <Text size="10px" fw={700} c="dimmed" style={{ letterSpacing: '0.08em' }}>
              {`Observation ${i + 1}`}
            </Text>
            <Text size="10px" c="dimmed" className="tnum">
              {fmtDay(obs.observed_at)}
            </Text>
          </Group>
          <Table verticalSpacing={4} fz="xs">
            <Table.Tbody>
              {obs.width_mm != null ? (
                <Row label="Width">
                  <span className="tnum">{obs.width_mm} mm</span>
                </Row>
              ) : null}
              {obs.length_m != null ? (
                <Row label="Length">
                  <span className="tnum">{obs.length_m} m</span>
                </Row>
              ) : null}
              {/* Condition state · quantity in the element unit */}
              <Row label={SEval.conditionState}>
                <CsBadge cs={obs.condition_state ?? null} size="xs" />
              </Row>
              {obs.cs_quantity != null ? (
                <Row label={SEval.quantity}>
                  <span className="tnum">
                    {formatQty(obs.cs_quantity)} {obs.cs_unit ?? ''}
                  </span>
                </Row>
              ) : null}
              {/* Count = number of damages at that location (quantity, EA), separate from the number of locations */}
              {obs.quantity != null && obs.quantity > 0 ? (
                <Row label="Qty">
                  <span className="tnum">{obs.quantity} EA</span>
                </Row>
              ) : null}
              {obs.note ? <Row label="Note">{obs.note}</Row> : null}
            </Table.Tbody>
          </Table>
        </div>
      ))}
    </Paper>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Table.Tr>
      <Table.Td w={92}>
        <Text size="10px" fw={600} c="dimmed" style={{ letterSpacing: '0.08em' }}>
          {label}
        </Text>
      </Table.Td>
      <Table.Td>{children}</Table.Td>
    </Table.Tr>
  );
}
