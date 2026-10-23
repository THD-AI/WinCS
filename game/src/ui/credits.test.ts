import { describe, expect, it } from 'vitest';
import readme from '../../../README.md?raw';
import indexHtml from '../../index.html?raw';
import { CREDITS, MENU, moveSelection, TITLE } from './credits';

const lines = CREDITS.flatMap((section) => section.lines).join('\n');

describe('title and credits', () => {
  it('credits every team member named in README.md', () => {
    const team = readme.split('## Team')[1].trim().split('\n')[0];
    const names = team.match(/\b[A-Z][a-z]+(?= \()/g) ?? [];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(lines).toContain(name);
  });

  it('names the sources NOTICE.md asks us to credit', () => {
    expect(lines).toContain('Deggster');
    expect(lines).toContain('Fast Forest');
  });

  it('keeps the working title in index.html in step', () => {
    expect(indexHtml).toContain(`<title>${TITLE}</title>`);
  });

  it('wraps the menu selection', () => {
    expect(MENU).toEqual(['Start', 'Credits']);
    expect(moveSelection(0, -1)).toBe(1);
    expect(moveSelection(1, 1)).toBe(0);
  });
});
