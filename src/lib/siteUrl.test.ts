// ------------------------------------------------------------------
//  Bridge profile paths (site-root based '/...') to real URLs.
//  (loader base, dashboard sheets, proposal frames)
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { dirOf, sheetSvgUrl, siteUrl } from './siteUrl';

describe('siteUrl: prepends the deploy base', () => {
  it('default base (/): the root-based path as is', () => {
    expect(siteUrl('/models3d/v1/manifest.json', '/')).toBe('/models3d/v1/manifest.json');
    expect(siteUrl('/proposal/frame_cs.svg', '/')).toBe('/proposal/frame_cs.svg');
  });

  it('deploy under a sub-path: the base is prepended', () => {
    expect(siteUrl('/models3d/v1', '/app/')).toBe('/app/models3d/v1');
  });

  it('without a base uses import.meta.env.BASE_URL (/ in tests)', () => {
    expect(siteUrl('/sheets-beechwood/')).toBe(`${import.meta.env.BASE_URL}sheets-beechwood/`);
  });
});

describe('dirOf: manifest URL to model folder', () => {
  it('the folder that holds the manifest', () => {
    expect(dirOf('/models3d/v1/manifest.json')).toBe('/models3d/v1');
    expect(dirOf('/models3d/beechwood/manifest.json')).toBe('/models3d/beechwood');
  });
});

describe('sheetSvgUrl: file name of the database zone_spec.svg + the sheet folder of the profile', () => {
  it('a zone_spec.svg that already carries a folder resolves by its file name', () => {
    expect(sheetSvgUrl('sheets/MANGDO-SURF-01.svg', '/sheets/', '/')).toBe('/sheets/MANGDO-SURF-01.svg');
    expect(sheetSvgUrl('sheets/MANGDO-SURF-01.svg', '/sheets/', '/app/')).toBe(
      '/app/sheets/MANGDO-SURF-01.svg',
    );
  });

  it('a zone_spec.svg holding just a file name is found in the sheet folder of the profile', () => {
    expect(sheetSvgUrl('01_BW-DECK-TOP-A.svg', '/sheets-beechwood/', '/')).toBe('/sheets-beechwood/01_BW-DECK-TOP-A.svg');
  });
});
