import { describe, expect, it } from 'vitest';
import { JENNY_BOX } from './jenny';
import { RAM, ramFrame, ramPlan, thrownAt } from './jennyRam';

describe("Jenny's ram on the creek path (P5)", () => {
  const hero = { x: 3240, y: 566 };
  const viewRight = 3240 + 640;
  const plan = ramPlan(hero.x, viewRight);

  it('tells first: lights from the right edge, then her rev, then the charge, all well under 6 s', () => {
    expect(plan.revAt).toBeGreaterThan(0);
    expect(plan.chargeAt).toBeGreaterThan(plan.revAt);
    expect(plan.impactAt).toBeGreaterThan(plan.chargeAt);
    expect(plan.crossAt).toBeLessThan(6);
    const early = ramFrame(0.1, plan, hero, viewRight);
    expect(early.phase).toBe('lights');
    expect(early.jennyX - JENNY_BOX.w / 2).toBeGreaterThan(viewRight); // not on screen yet
    expect(ramFrame(plan.revAt * 0.99, plan, hero, viewRight).lights).toBeGreaterThan(early.lights);
  });

  it('is one hit: her nose meets the hero, and he is thrown the way she drives (left), ahead of her', () => {
    expect(plan.impactX - JENNY_BOX.w / 2).toBeCloseTo(hero.x + 14);
    const hit = ramFrame(plan.impactAt + 0.01, plan, hero, viewRight);
    expect(hit.phase).toBe('thrown');
    expect(hit.hero).toBeDefined();
    const later = ramFrame(plan.impactAt + RAM.throw * 0.9, plan, hero, viewRight);
    expect(later.hero!.x).toBeLessThan(hit.hero!.x);
    expect(later.hero!.x).toBeLessThan(later.jennyX - JENNY_BOX.w / 2);
    expect(ramFrame(plan.crossAt + 0.01, plan, hero, viewRight).phase).toBe('cross');
  });

  it('throws in an arc that lands back on the path', () => {
    expect(thrownAt(RAM.throw / 2, hero, -1).y).toBeLessThan(hero.y - RAM.throwHeight * 0.9);
    expect(thrownAt(RAM.throw, hero, -1)).toMatchObject({ x: hero.x - RAM.throwDistance, y: hero.y });
  });
});
