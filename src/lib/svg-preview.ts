/**
 * SVG Preview Generator for ArchDraft Universal
 *
 * Renders the floor plan geometry as an SVG string for in-browser preview.
 * Color-matched to the DXF layer colors but adapted for dark backgrounds.
 * Includes interactive tooltips for room metadata.
 *
 * NOTE: The legend is intentionally NOT rendered inside this SVG.
 * It is rendered as an HTML element in page.tsx so it can never overlap
 * the diagram regardless of floor plan size or viewport dimensions.
 */

import type { FloorPlanGeometry } from "./bsp-engine";

const FT_TO_MM = 304.8;

export const PREVIEW_COLORS = {
  background: "#000000",
  exterior_walls: "#e4e4e7", // zinc-200 - crisp white walls
  interior_walls: "#a1a1aa", // zinc-400 - muted gray
  doors: "#b91c1c",          // Deep crimson — standard doors
  double_doors: "#c026d3",   // Fuchsia/violet — double doors, distinct from single doors
  windows: "#60a5fa",        // Steel blue
  garage_doors: "#f59e0b",   // Amber — visually distinct from all other types
  labels: "#fafafa",         // Pure white labels
  room_fills: [
    "rgba(255, 255, 255, 0.03)", // Uniform transparent fill - focus on walls
  ],
} as const;

/** Resolve the correct preview color for any opening type. */
function openingColor(type: string): string {
  switch (type) {
    case "garage_door":
      return PREVIEW_COLORS.garage_doors;
    case "double_door":
      return PREVIEW_COLORS.double_doors;
    case "window":
      return PREVIEW_COLORS.windows;
    // door, sliding_door, archway, pocket_door → standard door color
    default:
      return PREVIEW_COLORS.doors;
  }
}

/** Resolve stroke width for an opening type. */
function openingStrokeWidth(type: string): string {
  switch (type) {
    case "garage_door":
      return "3.5";
    case "double_door":
      return "3";
    case "window":
      return "2.5";
    default:
      return "2";
  }
}

export function generateSVGPreview(
  geometry: FloorPlanGeometry,
  viewWidth: number = 600,
  viewHeight: number = 400
): string {
  const { footprint, rooms, walls, openings } = geometry;

  const maxLevel = rooms.length > 0 ? Math.max(...rooms.map(r => r.level)) : 1;
  const spacingX = footprint.width + 3000; // 3000mm gap between floors
  const totalVirtualWidth = footprint.width + (spacingX * (maxLevel - 1));

  // Calculate scale to fit in viewport with padding
  // Use uniform padding on all sides — legend lives outside the SVG now
  const padding = 20;
  const scaleX = (viewWidth - 2 * padding) / totalVirtualWidth;
  const scaleY = (viewHeight - 2 * padding) / footprint.height;
  const scale = Math.min(scaleX, scaleY);

  // Center offset
  const offsetX = (viewWidth - totalVirtualWidth * scale) / 2;
  const offsetY = (viewHeight - footprint.height * scale) / 2;

  const tx = (x: number, level: number = 1) => ((x + (level - 1) * spacingX) * scale + offsetX).toFixed(1);
  const ty = (y: number) => (viewHeight - (y * scale + offsetY)).toFixed(1); // Flip Y for SVG
  const ts = (s: number) => (s * scale).toFixed(1);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" width="100%" height="100%">`;

  // Styles: flash animation + hover fill
  svg += `<style>
    @keyframes room-flash {
      0%   { fill: rgba(99, 102, 241, 0.5); }
      50%  { fill: rgba(99, 102, 241, 0.1); }
      100% { fill: rgba(99, 102, 241, 0); }
    }
    .preview-room-group.room-flashing .preview-room-fill {
      animation: room-flash 0.8s ease-out forwards;
    }
    .room-hit-area:hover {
      fill: rgba(255, 255, 255, 0.07);
      cursor: pointer;
    }
    .room-hit-area {
      fill: transparent;
      cursor: pointer;
    }
  </style>`;

  // Background
  svg += `<rect width="${viewWidth}" height="${viewHeight}" fill="${PREVIEW_COLORS.background}" rx="8"/>`;

  // ── Layer 1: Room flash-fill rects (visual only, no pointer events) ──
  rooms.forEach((room) => {
    const roomKey = `${room.name}__L${room.level}`;
    svg += `<g class="preview-room-group" data-room-key="${escapeXml(roomKey)}">
      <rect class="preview-room-fill" x="${tx(room.rect.x, room.level)}" y="${ty(room.rect.y + room.rect.height)}" width="${ts(room.rect.width)}" height="${ts(room.rect.height)}" fill="rgba(99,102,241,0)" stroke="none" pointer-events="none"/>
    </g>`;
  });

  // ── Layer 2: Walls ──
  for (const wall of walls) {
    const isExt = wall.layer === "EXTERIOR_WALLS";
    const color = isExt ? PREVIEW_COLORS.exterior_walls : PREVIEW_COLORS.interior_walls;
    const strokeWidth = Math.max(wall.thickness * scale, isExt ? 3 : 1.5).toFixed(1);
    svg += `<line x1="${tx(wall.x1, wall.level)}" y1="${ty(wall.y1)}" x2="${tx(wall.x2, wall.level)}" y2="${ty(wall.y2)}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="square" pointer-events="none"/>`;
  }

  // ── Layer 3: Openings ──
  for (const opening of openings) {
    const color = openingColor(opening.type);
    const strokeW = openingStrokeWidth(opening.type);
    if (opening.angle === 90) {
      svg += `<line x1="${tx(opening.x, opening.level)}" y1="${ty(opening.y)}" x2="${tx(opening.x, opening.level)}" y2="${ty(opening.y + opening.width)}" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round" pointer-events="none"/>`;
    } else {
      svg += `<line x1="${tx(opening.x, opening.level)}" y1="${ty(opening.y)}" x2="${tx(opening.x + opening.width, opening.level)}" y2="${ty(opening.y)}" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round" pointer-events="none"/>`;
    }
  }

  // ── Layer 4: Room labels (foreignObject — pointer-events none on the whole element) ──
  for (const room of rooms) {
    const roomW = parseFloat(ts(room.rect.width));
    const roomH = parseFloat(ts(room.rect.height));
    const rx = parseFloat(tx(room.rect.x, room.level));
    const ry = parseFloat(ty(room.rect.y + room.rect.height));

    svg += `<foreignObject x="${rx}" y="${ry}" width="${roomW}" height="${roomH}" pointer-events="none">
      <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;text-align:center;box-sizing:border-box;padding:4px;overflow:hidden;pointer-events:none;">
        <span style="color:${PREVIEW_COLORS.labels};font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:500;text-shadow:0 2px 4px rgba(0,0,0,0.95);line-height:1.3;word-wrap:break-word;max-width:100%;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeXml(room.name)}</span>
        <span style="color:${PREVIEW_COLORS.labels};font-family:'JetBrains Mono','Consolas',monospace;font-size:9px;font-weight:400;opacity:0.7;text-shadow:0 1px 3px rgba(0,0,0,0.95);margin-top:2px;">${room.actual_area_sqft.toFixed(0)} ft²</span>
      </div>
    </foreignObject>`;
  }

  // ── Layer 5: Level titles ──
  for (let l = 1; l <= maxLevel; l++) {
    const cx = ((footprint.width / 2) + (l - 1) * spacingX) * scale + offsetX;
    const cy = parseFloat(ty(footprint.height)) - 15;
    svg += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" fill="${PREVIEW_COLORS.labels}" font-family="Inter, sans-serif" font-size="12" font-weight="bold" opacity="0.5" text-anchor="middle" pointer-events="none">LEVEL ${l}</text>`;
  }

  // ── Layer 6 (TOP): Invisible hit-area rects — rendered last so nothing blocks them ──
  rooms.forEach((room) => {
    const roomKey = `${room.name}__L${room.level}`;
    svg += `<rect class="room-hit-area" data-room-key="${escapeXml(roomKey)}" x="${tx(room.rect.x, room.level)}" y="${ty(room.rect.y + room.rect.height)}" width="${ts(room.rect.width)}" height="${ts(room.rect.height)}"/>`;
  });

  svg += `</svg>`;
  return svg;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
