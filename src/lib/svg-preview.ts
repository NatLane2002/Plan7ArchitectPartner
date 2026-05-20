/**
 * SVG Preview Generator for ArchDraft Universal
 *
 * Renders the floor plan geometry as an SVG string for in-browser preview.
 * Color-matched to the DXF layer colors but adapted for dark backgrounds.
 * Includes interactive tooltips for room metadata.
 */

import type { FloorPlanGeometry } from "./bsp-engine";

const FT_TO_MM = 304.8;

const PREVIEW_COLORS = {
  background: "#000000",
  exterior_walls: "#e4e4e7", // zinc-200 - crisp white walls
  interior_walls: "#a1a1aa", // zinc-400 - muted gray
  doors: "#b91c1c", // Deep crimson (muted red)
  windows: "#60a5fa", // Softer steel blue
  labels: "#fafafa", // Pure white labels
  room_fills: [
    "rgba(255, 255, 255, 0.03)", // Uniform transparent fill - focus on walls
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

  // Room fills - uniform transparent fill, focus on walls
  rooms.forEach((room) => {
    svg += `<g class="preview-room-group">
      <title>${escapeXml(room.name)} - Level ${room.level}
Area: ${room.actual_area_sqft.toFixed(1)} sq ft
Dimensions: ${(room.rect.width / FT_TO_MM).toFixed(1)}' × ${(room.rect.height / FT_TO_MM).toFixed(1)}'</title>
      <rect class="preview-room" x="${tx(room.rect.x, room.level)}" y="${ty(room.rect.y + room.rect.height)}" width="${ts(room.rect.width)}" height="${ts(room.rect.height)}" fill="${PREVIEW_COLORS.room_fills[0]}" stroke="none"/>
    </g>`;
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

  // Room labels - clean geometric sans-serif, perfectly centered
  for (const room of rooms) {
    const roomW = parseFloat(ts(room.rect.width));
    const roomH = parseFloat(ts(room.rect.height));
    const rx = parseFloat(tx(room.rect.x, room.level));
    const ry = parseFloat(ty(room.rect.y + room.rect.height));

    svg += `
    <foreignObject x="${rx}" y="${ry}" width="${roomW}" height="${roomH}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; text-align: center; box-sizing: border-box; padding: 4px; overflow: hidden; pointer-events: none;">
        <span style="color: ${PREVIEW_COLORS.labels}; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; font-weight: 500; text-shadow: 0 2px 4px rgba(0,0,0,0.95); line-height: 1.3; word-wrap: break-word; max-width: 100%; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeXml(room.name)}
        </span>
        <span style="color: ${PREVIEW_COLORS.labels}; font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 9px; font-weight: 400; opacity: 0.7; text-shadow: 0 1px 3px rgba(0,0,0,0.95); margin-top: 2px;">
          ${room.actual_area_sqft.toFixed(0)} ft²
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

  // Legend - Clean inline row with blurred backdrop (moved to bottom-left via CSS in canvas)
  const legendX = 12;
  const legendY = viewHeight - 50;
  svg += `<g class="svg-legend">`;
  svg += `<rect x="${legendX}" y="${legendY}" width="280" height="36" fill="rgba(24, 24, 27, 0.6)" rx="6" style="backdrop-filter: blur(12px);"/>`;
  
  // Exterior walls
  svg += `<line x1="${legendX + 10}" y1="${legendY + 18}" x2="${legendX + 28}" y2="${legendY + 18}" stroke="${PREVIEW_COLORS.exterior_walls}" stroke-width="3" stroke-linecap="round"/>`;
  svg += `<text x="${legendX + 34}" y="${legendY + 18}" fill="${PREVIEW_COLORS.exterior_walls}" font-size="9" font-family="Inter, sans-serif" font-weight="500" dominant-baseline="central">Exterior</text>`;
  
  // Doors
  svg += `<line x1="${legendX + 85}" y1="${legendY + 18}" x2="${legendX + 103}" y2="${legendY + 18}" stroke="${PREVIEW_COLORS.doors}" stroke-width="2.5" stroke-linecap="round"/>`;
  svg += `<text x="${legendX + 109}" y="${legendY + 18}" fill="${PREVIEW_COLORS.doors}" font-size="9" font-family="Inter, sans-serif" font-weight="500" dominant-baseline="central">Doors</text>`;
  
  // Windows
  svg += `<line x1="${legendX + 155}" y1="${legendY + 18}" x2="${legendX + 173}" y2="${legendY + 18}" stroke="${PREVIEW_COLORS.windows}" stroke-width="2.5" stroke-linecap="round"/>`;
  svg += `<text x="${legendX + 179}" y="${legendY + 18}" fill="${PREVIEW_COLORS.windows}" font-size="9" font-family="Inter, sans-serif" font-weight="500" dominant-baseline="central">Windows</text>`;
  
  // Interior walls
  svg += `<line x1="${legendX + 235}" y1="${legendY + 18}" x2="${legendX + 253}" y2="${legendY + 18}" stroke="${PREVIEW_COLORS.interior_walls}" stroke-width="2" stroke-linecap="round"/>`;
  svg += `<text x="${legendX + 259}" y="${legendY + 18}" fill="${PREVIEW_COLORS.interior_walls}" font-size="9" font-family="Inter, sans-serif" font-weight="500" dominant-baseline="central">Interior</text>`;
  
  svg += `</g>`;

  svg += `</svg>`;
  return svg;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
