/** Working title – decision 13 is open; the team's pick replaces this one line (and index.html's <title>). */
export const TITLE = 'DEGGSTER.EXE';
export const SUBTITLE = 'has stopped responding.';
/** The DEGDEV 3 jam theme (playtest T1): it must show – under the title, and as the loader's last line. */
export const THEME = "It's spooky outside.";
/** The title's theme line. */
export const THEME_LINE = `DEGDEV 3 - ${THEME}`;

/** Team as in README.md; tools and sources as in NOTICE.md. Keep both files and this list in step. */
export const CREDITS: { heading: string; lines: string[] }[] = [
  { heading: 'Poncho Goblins', lines: ['Vatsal – creative lead, gameplay', 'Lex – level design', 'Alexander – pipeline, art, build'] },
  { heading: 'Made with', lines: ['Phaser 3, TypeScript, Vite, Vitest', 'Python and Pillow (art pipeline), Tiled', 'Pixel art generated from our own photos (scripts in the repository)', 'Vercel'] },
  {
    heading: 'Thanks and references',
    lines: [
      'THD – the Deggster mascot, the crest and the campus, affectionately referenced',
      'Fast Forest e.V. – Jenny, the driverless race car',
      `DEGDEV 3 game jam, THD Deggendorf, 23–24 Oct 2026 – theme: ${THEME}`,
    ],
  },
  { heading: 'Fiction', lines: ['The experiment, the anomalies and every character are invented.'] },
];

/** The title menu: Start, then Credits. */
export const MENU = ['Start', 'Credits'] as const;
export type MenuItem = (typeof MENU)[number];

export function moveSelection(index: number, step: number): number {
  return (index + step + MENU.length) % MENU.length;
}
