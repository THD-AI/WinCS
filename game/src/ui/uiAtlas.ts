/** The approved UI atlas (#127, scripts/export_ui.py); without it the HUD and the map draw placeholders in code. */
export const UI_ATLAS = 'ui';
export const UI_LAYOUT = 'ui-layout';

/**
 * ui-layout.json: placements measured from the approved direction (art/ui/ui.json "layout") plus the screen
 * hole inside the case. Every value is in game pixels.
 */
export interface UiLayout {
  cells?: { x: number; y: number; pitch: number };
  orbs?: { x: number; y: number; pitch: number };
  pocket?: { x: number; y: number };
  room?: { w: number; h: number; gap: number; inset: number };
  'pocket-frame'?: { size: [number, number]; screen: [number, number, number, number] };
}
