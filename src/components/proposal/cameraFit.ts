// ------------------------------------------------------------------
//  Automatic fit policy: if the camera flew off on every selection, neighbouring members could not be added.
//  So the automatic fit happens only **once, when a part is first resolved after entering the page** (a part
//  passed from the 3D view through `?ids=` may be off screen, so that one fit is kept); after that the camera
//  moves only when the user presses "Fit selection". A pure function with no scene or React dependency.
// ------------------------------------------------------------------

/**
 * @param fittedOnce  whether the automatic fit has already happened
 * @param hasBounds   whether the selection currently resolves to real meshes (a bounding box); when a
 *                    model arrives late there is a selection but no bounds, and the chance is kept.
 */
export function autoFitDecision(
  fittedOnce: boolean,
  hasBounds: boolean,
): { fit: boolean; fittedOnce: boolean } {
  if (fittedOnce || !hasBounds) return { fit: false, fittedOnce };
  return { fit: true, fittedOnce: true };
}
