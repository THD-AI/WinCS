import type Phaser from 'phaser';
import { Hud } from '../ui/Hud';

/**
 * Lane A's story, UI and FX scenes, in draw order (later = on top). main.ts registers this list,
 * so a new lane A scene is added here and the shared main.ts stays untouched.
 */
export const LANE_A_SCENES: Phaser.Types.Scenes.SceneType[] = [Hud];
