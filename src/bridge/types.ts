// ------------------------------------------------------------------
//  Bridge profile — the facts that differ per bridge, gathered in one shape.
//  (model path · object mapping · member tree · evaluation sections · station/elevation labels ·
//   sheet frames · display texts)
//
//  This repository carries one implementation (src/bridge/beechwood). Paths (manifestUrl · sheetsBase ·
//  templates) are site-root based — prefixing BASE_URL is the caller's job.
// ------------------------------------------------------------------
import type { TreeNode } from '@/lib/glb/memberTree';
import type { ViewLabelSet } from '@/lib/proposal/basis';
import type { TitleFormat } from '@/lib/proposal/title';
import type { ClipBox, CompositionKey, Vec3 } from '@/lib/proposal/types';

export type BridgeCode = 'beechwood';

/**
 * Member information of one mesh. `F` is the fine-part vocabulary of the bridge
 * (src/bridge/beechwood/objects.ts narrows it to its own list).
 */
export interface ObjectInfo<F extends string = string> {
  /** Legacy member class — not used by this bridge (always null) */
  member: string | null;
  /** Member name ('Deck' · 'Beams' …) */
  memberName?: string;
  /** Fine part (display) */
  fine: F;
  /** Location detail — span, bent, side */
  locationDetail: string;
  /** objects.object_code this mesh belongs to — the loader writes it to userData.objectId */
  objectCode?: string;
}

/* One sheet proposal frame template: static asset paths */
export interface FrameTemplate {
  svg: string;
  meta: string;
}

/* Member tree of one evaluation section; the screen draws nodes under the section heading. */
export interface SectionTree {
  /* Section code (sections[].code) */
  section: string;
  /* Heading display name (texts.sectionNames[section]) */
  label: string;
  nodes: TreeNode[];
}

/**
 * **Stored-value** rules of the sheet proposal engine: bridge name of a proposal spec, title format, composition names, default fine member.
 * The engine runs in a worker; a separate module picks just this field so the worker does not drag
 * in the whole profile (src/bridge/proposal.ts, always the same object as bridge.proposal).
 */
export interface ProposalProfile {
  /* bridge field of a proposal spec = BridgeProfile.storedName */
  storedName: string;
  /* Title format (passed to lib/proposal/title.ts suggestTitle) */
  title: TitleFormat;
  /* Composition names: stored values that go into titles */
  compositionNames: Record<CompositionKey, string>;
  /* Name used in a title when the fine member cannot be decided */
  fallbackFine: string;
  /* Proposal view labels (stored ViewSpec.label): six axis directions, inclined face n, names of the four cylinder quadrants */
  viewLabels: ViewLabelSet;
}

export interface BridgeProfile {
  code: BridgeCode;
  /* Bridge name shown on screen */
  name: string;
  /**
   * Bridge name used in **stored values** (key of database bridges.name, bridge of a proposal spec); fixed.
   * 'Beechwood Rd over Little Blue River'. The screens show name.
   */
  storedName: string;
  /* 3D model: manifest path. lazyGroups: groups fetched on demand instead of at start (the manifest decides when absent) */
  model: { manifestUrl: string; lazyGroups?: string[] };
  /* Folder of the sheet SVGs (trailing '/') */
  sheetsBase: string;
  /* Evaluation sections: code = database bridge_sections.code, name = stored name (display names are texts.sectionNames) */
  sections: readonly { code: string; name: string }[];
  /* Section used when the section of something cannot be decided */
  defaultSectionCode: string;
  /**
   * Default inspection round label of the damage form (stored database inspections.round_label), used when the caller gives no round.
   * '2026-09' (the seeded inspection round).
   */
  roundLabel: string;
  /* Group + mesh name to member info. ObjectInfo widened to a string because the fine member vocabulary differs per bridge */
  objectInfo(group: string, objName: string, center: { x: number; z: number }): ObjectInfo<string>;
  /* Model object ids to the member tree (only ids present in the input) */
  buildTree(objectIds: string[]): TreeNode[];
  /**
   * Model object ids to member trees per section (in section order; a section without nodes keeps its slot).
   * Concatenated, they equal buildTree.
   */
  trees(objectIds: string[]): SectionTree[];
  /**
   * Selected meshes (fine member, mesh name) to the sheet families that draw them (database sheets.zone_type); the
   * "existing sheets" hint of the sheet proposal screen only examines matching sheets. No duplicates, in the bridge's family order.
   */
  familiesFor(meshes: Array<{ name: string; fine: string }>): string[];
  /* World coordinates (m) to station (z), elevation (y) and offset (x) labels, single values and ranges */
  sta: { label(z: number): string; el(y: number): string; x(x: number): string; clipLabels(clip: ClipBox): string[] };
  /* Sheet proposal frames: selection range to kind, kind to template */
  frames: { kindFor(bounds: { min: Vec3; max: Vec3 }): string; templates: Record<string, FrameTemplate> };
  /**
   * Display texts: bridge name (for screens), bridge subtitle (dashboard hero), section code to display name,
   * sheet family (stored zone_type) to display name
   */
  texts: {
    bridgeName: string;
    bridgeSub: string;
    sectionNames: Record<string, string>;
    familyName(zone: string): string;
  };
  /* Stored-value rules of the sheet proposal engine (src/bridge/proposal.ts picks the same object for the worker) */
  proposal: ProposalProfile;
}
