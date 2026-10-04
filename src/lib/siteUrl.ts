// ------------------------------------------------------------------
//  Site path to URL. Every path of the bridge profile (src/bridge) is **site-root based** ('/...'), and
//  the deploy base (import.meta.env.BASE_URL, '/' by default) is prepended by the user of the path.
// ------------------------------------------------------------------

/* Root-based path ('/...') to a URL with the base prepended. */
export function siteUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  return base + path.replace(/^\/+/, '');
}

/* File path to its folder (no trailing '/'). `/models3d/beechwood/manifest.json` gives `/models3d/beechwood` */
export function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

/**
 * URL of a sheet SVG: the **file name** of the database `zone_spec.svg` is looked up in the sheet folder of the bridge profile (sheetsBase).
 * A value that already carries a folder resolves by its file name alone.
 */
export function sheetSvgUrl(svg: string, sheetsBase: string, base: string = import.meta.env.BASE_URL): string {
  return siteUrl(sheetsBase + svg.slice(svg.lastIndexOf('/') + 1), base);
}
