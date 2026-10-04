import { createTheme, rem } from '@mantine/core';

// ------------------------------------------------------------------
//  Achromatic CAD theme:
//  flat and sharp (radius 0), near-black primary, Pretendard, generous tracking.
// ------------------------------------------------------------------
export const theme = createTheme({
  fontFamily:
    "'Pretendard Variable', Pretendard, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', Consolas, monospace",
  defaultRadius: 0,
  primaryColor: 'ink',
  primaryShade: 8,
  colors: {
    // near-black CAD ink scale
    ink: [
      '#f4f5f6',
      '#e7e9eb',
      '#cfd3d7',
      '#aab0b6',
      '#7e858d',
      '#5a6169',
      '#3e444b',
      '#2a2f35',
      '#191d21',
      '#0e1114',
    ],
  },
  headings: {
    fontFamily:
      "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
    sizes: {
      h1: { fontSize: rem(22), fontWeight: '700' },
      h2: { fontSize: rem(18), fontWeight: '700' },
      h3: { fontSize: rem(15), fontWeight: '600' },
    },
  },
  components: {
    Button: { defaultProps: { radius: 0 } },
    Paper: { defaultProps: { radius: 0 } },
    Badge: { defaultProps: { radius: 0 } },
    Select: { defaultProps: { radius: 0 } },
    Table: {
      defaultProps: { highlightOnHover: true, withColumnBorders: false },
    },
  },
});

// Condition grade colors
export const GRADE_BADGE: Record<string, string> = {
  A: '#1e8e3e',
  B: '#7cb342',
  C: '#f9a825',
  D: '#ef6c00',
  E: '#c62828',
};
