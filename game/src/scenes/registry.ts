import type Phaser from 'phaser';
import { AnomalyTest } from '../fx/AnomalyTest';
import { AtmosphereTest } from '../fx/AtmosphereTest';
import { Crossing } from '../story/Crossing';
import { Hud } from '../ui/Hud';
import { Title } from '../ui/Title';

/**
 * Lane A's story, UI and FX scenes, in draw order (later = on top). main.ts registers this list,
 * so a new lane A scene is added here and the shared main.ts stays untouched.
 */
export const LANE_A_SCENES: Phaser.Types.Scenes.SceneType[] = [
  Hud, Crossing, Title,
  // Dev-only test scenes stay out of production builds.
  ...(import.meta.env.DEV ? [AnomalyTest, AtmosphereTest] : []),
];
