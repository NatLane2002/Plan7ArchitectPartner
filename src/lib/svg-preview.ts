/**
 * SVG Preview Generator
 *
 * Renders the floor plan geometry as an SVG string for in-browser preview.
 * Color-matched to the DXF layer colors but adapted for dark backgrounds.
 */

import type { FloorPlanGeometry } from "./bsp-engine";

const PREVIEW_COLORS = {
  background: "#0d1322",
  exterior_walls: "#e2e8f0",
  interior_walls: "#64748b",
  doors: "#f87171",
  windows: "#38bdf8",
  labels: "#4ade80",
  room_fills: [
    "rgba(99, 102, 241, 0.08)",
    "rgba(34, 211, 238, 0.08)",
    "rgba(168, 85, 247, 0.08)",
    "rgba(251, 146, 60, 0.08)",
    "rgba(74, 222, 128, 0.08)",
    "rgba(251, 113, 133, 0.08)",
    "rgba(96, 165, 250, 0.08)",
    "rgba(253, 224, 71, 0.08)",
  ],
};

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
  const padding = 20;
  const scaleX = (viewWidth - 2 * padding) / totalVirtualWidth;
  const scaleY = (viewHeight - 4 * padding) / footprint.height; // Extra padding for level titles
  const scale = Math.min(scaleX, scaleY);

  // Center offset
  const offsetX = (viewWidth - totalVirtualWidth * scale) / 2;
  const offsetY = (viewHeight - footprint.height * scale) / 2;

  const tx = (x: number, level: number = 1) => ((x + (level - 1) * spacingX) * scale + offsetX).toFixed(1);
  const ty = (y: number) => (viewHeight - (y * scale + offsetY)).toFixed(1); // Flip Y for SVG
  const ts = (s: number) => (s * scale).toFixed(1);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" width="100%" height="100%">`;

  // Background
  svg += `<rect width="${viewWidth}" height="${viewHeight}" fill="${PREVIEW_COLORS.background}" rx="8"/>`;

  // Room fills
  rooms.forEach((room, i) => {
    const colorIdx = i % PREVIEW_COLORS.room_fills.length;
    svg += `<rect class="preview-room" x="${tx(room.rect.x, room.level)}" y="${ty(room.rect.y + room.rect.height)}" width="${ts(room.rect.width)}" height="${ts(room.rect.height)}" fill="${PREVIEW_COLORS.room_fills[colorIdx]}" stroke="${PREVIEW_COLORS.interior_walls}" stroke-width="0.5" stroke-opacity="0.3"/>`;
  });

  // Walls (Both interior and exterior are now mathematically perfect segments)
  for (const wall of walls) {
    const isExt = wall.layer === "EXTERIOR_WALLS";
    const color = isExt ? PREVIEW_COLORS.exterior_walls : PREVIEW_COLORS.interior_walls;
    const strokeWidth = Math.max(wall.thickness * scale, isExt ? 3 : 1.5).toFixed(1);
    
    svg += `<line x1="${tx(wall.x1, wall.level)}" y1="${ty(wall.y1)}" x2="${tx(wall.x2, wall.level)}" y2="${ty(wall.y2)}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="square"/>`;
  }

  // Openings
  for (const opening of openings) {
    const color = opening.type === "door" ? PREVIEW_COLORS.doors : PREVIEW_COLORS.windows;
    const strokeW = opening.type === "door" ? "2" : "2.5";

    if (opening.angle === 90) {
      svg += `<line x1="${tx(opening.x, opening.level)}" y1="${ty(opening.y)}" x2="${tx(opening.x, opening.level)}" y2="${ty(opening.y + opening.width)}" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
    } else {
      svg += `<line x1="${tx(opening.x, opening.level)}" y1="${ty(opening.y)}" x2="${tx(opening.x + opening.width, opening.level)}" y2="${ty(opening.y)}" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
    }
  }

  // Room labels - precise clipping and layout using foreignObject
  for (const room of rooms) {
    const roomW = parseFloat(ts(room.rect.width));
    const roomH = parseFloat(ts(room.rect.height));
    const rx = parseFloat(tx(room.rect.x, room.level));
    const ry = parseFloat(ty(room.rect.y + room.rect.height));

    svg += `
    <foreignObject x="${rx}" y="${ry}" width="${roomW}" height="${roomH}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; text-align: center; box-sizing: border-box; padding: 4px; overflow: hidden; pointer-events: none;">
        <span style="color: ${PREVIEW_COLORS.labels}; font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.9); line-height: 1.2; word-wrap: break-word; max-width: 100%; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeXml(room.name)}
        </span>
        <span style="color: ${PREVIEW_COLORS.labels}; font-family: Inter, sans-serif; font-size: 9px; font-weight: 400; opacity: 0.8; text-shadow: 0 1px 2px rgba(0,0,0,0.9); margin-top: 2px;">
          ${room.actual_area_sqft.toFixed(0)} sq ft
        </span>
      </div>
    </foreignObject>`;
  }

  // Level Titles
  for (let l = 1; l <= maxLevel; l++) {
    const cx = ((footprint.width / 2) + (l - 1) * spacingX) * scale + offsetX;
    const cy = parseFloat(ty(footprint.height)) - 15;
    svg += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" fill="${PREVIEW_COLORS.labels}" font-family="Inter, sans-serif" font-size="12" font-weight="bold" opacity="0.5" text-anchor="middle">LEVEL ${l}</text>`;
  }

  // Legend
  const legendX = 12;
  const legendY = viewHeight - 60;
  svg += `<rect x="${legendX}" y="${legendY}" width="130" height="50" fill="rgba(0,0,0,0.4)" rx="6"/>`;
  svg += `<line x1="${legendX + 8}" y1="${legendY + 14}" x2="${legendX + 22}" y2="${legendY + 14}" stroke="${PREVIEW_COLORS.exterior_walls}" stroke-width="3"/>`;
  svg += `<text x="${legendX + 28}" y="${legendY + 14}" fill="${PREVIEW_COLORS.exterior_walls}" font-size="8" font-family="Inter, sans-serif" dominant-baseline="central">Exterior</text>`;
  svg += `<line x1="${legendX + 8}" y1="${legendY + 28}" x2="${legendX + 22}" y2="${legendY + 28}" stroke="${PREVIEW_COLORS.doors}" stroke-width="2"/>`;
  svg += `<text x="${legendX + 28}" y="${legendY + 28}" fill="${PREVIEW_COLORS.doors}" font-size="8" font-family="Inter, sans-serif" dominant-baseline="central">Doors</text>`;
  svg += `<line x1="${legendX + 75}" y1="${legendY + 14}" x2="${legendX + 89}" y2="${legendY + 14}" stroke="${PREVIEW_COLORS.windows}" stroke-width="2.5"/>`;
  svg += `<text x="${legendX + 95}" y="${legendY + 14}" fill="${PREVIEW_COLORS.windows}" font-size="8" font-family="Inter, sans-serif" dominant-baseline="central">Windows</text>`;
  svg += `<line x1="${legendX + 75}" y1="${legendY + 28}" x2="${legendX + 89}" y2="${legendY + 28}" stroke="${PREVIEW_COLORS.interior_walls}" stroke-width="2"/>`;
  svg += `<text x="${legendX + 95}" y="${legendY + 28}" fill="${PREVIEW_COLORS.interior_walls}" font-size="8" font-family="Inter, sans-serif" dominant-baseline="central">Interior</text>`;

  svg += `</svg>`;
  return svg;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
