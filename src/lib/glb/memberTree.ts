/* Member tree node shape (shared by every section tree of a bridge profile) */
export interface TreeNode {
  label: string;
  ids: string[];
  /**
   * Child nodes, recursive. A tree may be flat (leaves only) or deeper:
   * src/bridge/beechwood/tree.ts has three levels, member > span/bent > part.
   */
  children?: TreeNode[];
}

// ---- GLB mesh to segment (manifest object id) mapping -----------------
//  A GLB node name can be a segment id followed by part and index suffixes,
//  while the member tree and the data use the manifest's segment ids.
//  Exact matching alone would only catch names that happen to equal an id,
//  so the segment is decided by the **longest prefix match**.
export function makeSegmentOf(
  objectIds: string[],
): (objectId: string, group: string) => string {
  const segIdsDesc = [...objectIds].sort((a, b) => b.length - a.length);
  const segIdSet = new Set(objectIds);
  const cache = new Map<string, string>();
  return (objectId: string, group: string): string => {
    if (segIdSet.has(objectId)) return objectId;
    const hit = cache.get(objectId);
    if (hit !== undefined) return hit;
    const found =
      segIdsDesc.find((s) => objectId.startsWith(s)) ??
      (segIdSet.has(group) ? group : '');
    cache.set(objectId, found);
    return found;
  };
}

/* Mesh identification tags handed over by the material effect (derived from userData) */
export interface MeshTags {
  objectId: string;
  group: string;
  objName: string;
}

/** Selection keys a mesh answers to — segment, object id, group (empty values and duplicates removed). */
export function meshSelectionKeys(tags: MeshTags, segmentOf: (o: string, g: string) => string): string[] {
  const keys = [segmentOf(tags.objectId, tags.group), tags.objectId, tags.group];
  return [...new Set(keys.filter(Boolean))];
}
export const meshMatchesSelection = (sel: ReadonlySet<string>, keys: string[]): boolean => keys.some((k) => sel.has(k));
