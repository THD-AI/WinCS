import Phaser from 'phaser';
import type { CollisionChunk, Marker } from './collision';
import { PROP_DEPTH } from './depth';
import { DRIP, flicker, LAMP, landing } from './ambientModel';

/**
 * The rooms' small motion (Alexander's playtest, 25 Oct: the underground was "extremely static"): every `lamp`
 * spawn marker is a painted lantern that flickers, with dust drifting in its light; every `drip` marker is where the
 * pond above seeps through the ceiling – a drop forms, falls to the floor under it and splashes. Markers come from
 * the zone script (hidden_garden_proof.py AMBIENT); the painting itself never moves.
 */
export class Ambient {
  private lamps: { at: Marker; glow: Phaser.GameObjects.Image; motes: Phaser.GameObjects.Image[]; seed: number }[] = [];
  private drips: { at: Marker; land: number; next: number; drop?: Phaser.GameObjects.Image; vy: number }[] = [];

  constructor(private scene: Phaser.Scene, chunks: CollisionChunk[]) {
    const spawns = chunks.flatMap(c => c.world.spawn.map(s => ({ s, c })));
    const lamps = spawns.filter(({ s }) => s.kind === 'lamp');
    const drips = spawns.filter(({ s }) => s.kind === 'drip');
    if (!lamps.length && !drips.length) return;
    textures(scene);
    for (const [n, { s }] of lamps.entries()) {
      const glow = scene.add.image(s.x, s.y, 'ambient-glow').setBlendMode(Phaser.BlendModes.ADD).setTint(LAMP.tint)
        .setScale(LAMP.radius / 64).setDepth(PROP_DEPTH - 2);
      const motes = Array.from({ length: LAMP.motes }, () =>
        scene.add.image(s.x, s.y, 'ambient-mote').setTint(0xffe2b0).setDepth(PROP_DEPTH - 1));
      this.lamps.push({ at: s, glow, motes, seed: n * 1.37 + 0.4 });
    }
    for (const { s, c } of drips) {
      const lines = [...c.world.walk, ...c.world.oneWay];
      const bottom = c.origin[1] + c.local.size[1];
      this.drips.push({ at: s, land: landing(lines, s.x, s.y, bottom), next: Math.random() * DRIP.every[1], vy: 0 });
    }
    const update = (time: number, delta: number) => this.update(time / 1000, Math.min(delta, 100) / 1000);
    scene.events.on(Phaser.Scenes.Events.UPDATE, update);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
  }

  private update(t: number, dt: number) {
    for (const lamp of this.lamps) {
      const light = flicker(t, lamp.seed);
      lamp.glow.setAlpha(LAMP.alpha * light);
      lamp.motes.forEach((mote, i) => {
        const p = lamp.seed * 7 + i * 2.1;
        mote.setPosition(lamp.at.x + LAMP.drift[0] * Math.sin(t * 0.11 + p), lamp.at.y + 30 + LAMP.drift[1] * Math.sin(t * 0.07 + p * 1.3))
          .setAlpha(0.45 * light * (0.5 + 0.5 * Math.sin(t * 0.9 + p)));
      });
    }
    for (const drip of this.drips) {
      if (!drip.drop) {
        drip.next -= dt;
        if (drip.next > 0) continue;
        drip.drop = this.scene.add.image(drip.at.x, drip.at.y, 'ambient-drop').setTint(DRIP.tint).setDepth(PROP_DEPTH - 1);
        drip.vy = 0;
        continue;
      }
      drip.vy += DRIP.gravity * dt;
      drip.drop.y += drip.vy * dt;
      if (drip.drop.y >= drip.land) {
        this.splash(drip.at.x, drip.land);
        drip.drop.destroy();
        drip.drop = undefined;
        drip.next = DRIP.every[0] + Math.random() * (DRIP.every[1] - DRIP.every[0]);
      }
    }
  }

  private splash(x: number, y: number) {
    for (let i = 0; i < DRIP.splash; i++) {
      const bit = this.scene.add.image(x, y - 1, 'ambient-mote').setTint(DRIP.tint).setDepth(PROP_DEPTH - 1);
      this.scene.tweens.add({ targets: bit, x: x + (i - 1) * 7, y: y - 6 - 3 * (i % 2), alpha: 0, duration: 320,
        ease: 'Quad.easeOut', onComplete: () => bit.destroy() });
    }
  }
}

/** The glow (a soft radial falloff), a dust mote (2 px) and a drop (2 x 5 px), made once per game. */
function textures(scene: Phaser.Scene) {
  if (!scene.textures.exists('ambient-glow')) {
    const canvas = scene.textures.createCanvas('ambient-glow', 128, 128)!;
    const ctx = canvas.getContext();
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    canvas.refresh();
  }
  for (const [key, w, h] of [['ambient-mote', 2, 2], ['ambient-drop', 2, 5]] as const) {
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
