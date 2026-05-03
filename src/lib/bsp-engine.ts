/**
 * Grid-Based Floor Plan Engine
 *
 * Takes Gemini's explicitly defined rooms (mapped on a 1ft x 1ft Cartesian grid)
 * and generates precise geometric boundaries, exterior walls, interior walls, 
 * and perfect opening translations for DXF CAD tracing.
 */

import type { Room, FloorPlan, Opening } from "./schemas";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedRoom {
  id: string;
  name: string;
  rect: Rect;
  level: number;
  target_area_sqft: number;
  actual_area_sqft: number;
}

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  level: number;
  layer: "EXTERIOR_WALLS" | "INTERIOR_WALLS";
}

export interface PlacedOpening {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; 
  level: number;
  layer: "DOORS" | "WINDOWS";
  room1: string;
  room2: string;
}

export interface FloorPlanGeometry {
  footprint: Rect;
  rooms: PlacedRoom[];
  walls: WallSegment[];
  openings: PlacedOpening[];
  exterior_wall_thickness: number;
  interior_wall_thickness: number;
}

const FT_TO_MM = 304.8;

export function generateFloorPlanGeometry(plan: FloorPlan): FloorPlanGeometry {
  const { rooms, openings, exterior_wall_thickness_mm, interior_wall_thickness_mm, stories } = plan;
  const extThickness = exterior_wall_thickness_mm ?? 250;
  const intThickness = interior_wall_thickness_mm ?? 120;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const placedRooms: PlacedRoom[] = rooms.map((pr) => {
    const rX = pr.grid_x * FT_TO_MM;
    const rY = pr.grid_y * FT_TO_MM;
    const rW = pr.width_ft * FT_TO_MM;
    const rH = pr.length_ft * FT_TO_MM;

    minX = Math.min(minX, rX);
    minY = Math.min(minY, rY);
    maxX = Math.max(maxX, rX + rW);
    maxY = Math.max(maxY, rY + rH);

    return {
      id: pr.id,
      name: pr.name,
      rect: { x: rX, y: rY, width: rW, height: rH },
      level: pr.level || 1,
      target_area_sqft: pr.width_ft * pr.length_ft,
      actual_area_sqft: pr.width_ft * pr.length_ft,
    };
  });

  // Auto-level separation: Even if the AI hallucinates "stories: 1", if we detect a massive X gap with flat levels, slice it natively
  if (placedRooms.every(r => r.level === 1)) {
     const sortedRooms = [...placedRooms].sort((a,b) => a.rect.x - b.rect.x);
     let largestGap = 0;
     let splitX = 0;
     let currentMaxX = sortedRooms[0].rect.x + sortedRooms[0].rect.width;

     for (let i = 1; i < sortedRooms.length; i++) {
        const gap = sortedRooms[i].rect.x - currentMaxX;
        if (gap > largestGap) {
           largestGap = gap;
           splitX = sortedRooms[i].rect.x;
        }
        currentMaxX = Math.max(currentMaxX, sortedRooms[i].rect.x + sortedRooms[i].rect.width);
     }
     
     if (largestGap > 5000) { // If there's a 5m+ gap horizontally, it's definitively a second floor pasted aside
         for (const r of placedRooms) {
            if (r.rect.x >= splitX) {
               r.level = 2;
               r.rect.x -= splitX; // Fold it perfectly back on top of Level 1 for 3D alignment!
            }
         }
         // Recompute footprint width since we folded space
         maxX -= splitX; 
     }
  }

  const footprintRect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

  const walls = generateWallsFromGrid(placedRooms, extThickness, intThickness);
  const placedOpenings = placeOpenings(openings, placedRooms, walls, intThickness, extThickness);

  // Recalculate true architectural footprint based on mathematical normalization (fixes old 90x40 values)
  footprintRect.width = Math.max(...placedRooms.filter(r => r.level === 1).map(r => r.rect.x + r.rect.width)) - minX;
  if(footprintRect.width < 1) footprintRect.width = maxX - minX;

  return {
    footprint: footprintRect,
    rooms: placedRooms,
    walls,
    openings: placedOpenings,
    exterior_wall_thickness: extThickness,
    interior_wall_thickness: intThickness,
  };
}

/**
 * Transforms an arbitrary grid of rectangular rooms into precise exterior 
 * and interior wall line segments regardless of the overall footprint shape.
 */
function generateWallsFromGrid(
  rooms: PlacedRoom[],
  extThickness: number,
  intThickness: number
): WallSegment[] {
  const segmentMap = new Map<string, { x1: number, y1: number, x2: number, y2: number, count: number, dir: 'h'|'v', level: number }>();

  function addSegment(x1: number, y1: number, x2: number, y2: number, level: number) {
    const sx1 = Math.round(x1 / FT_TO_MM);
    const sy1 = Math.round(y1 / FT_TO_MM);
    const sx2 = Math.round(x2 / FT_TO_MM);
    const sy2 = Math.round(y2 / FT_TO_MM);

    const pts = [[sx1, sy1], [sx2, sy2]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const k = `${pts[0][0]},${pts[0][1]},${pts[1][0]},${pts[1][1]}_L${level}`;
    
    const entry = segmentMap.get(k);
    if (entry) {
      entry.count++;
    } else {
      segmentMap.set(k, {
        x1: pts[0][0], y1: pts[0][1], 
        x2: pts[1][0], y2: pts[1][1], 
        count: 1, 
        dir: pts[0][1] === pts[1][1] ? 'h' : 'v',
        level
      });
    }
  }

  for (const r of rooms) {
     const startX = r.rect.x;
     const startY = r.rect.y;
     const wFeet = Math.round(r.rect.width / FT_TO_MM);
     const hFeet = Math.round(r.rect.height / FT_TO_MM);

     for (let i = 0; i < wFeet; i++) {
        addSegment(startX + i * FT_TO_MM, startY, startX + (i + 1) * FT_TO_MM, startY, r.level);
        addSegment(startX + i * FT_TO_MM, startY + hFeet * FT_TO_MM, startX + (i + 1) * FT_TO_MM, startY + hFeet * FT_TO_MM, r.level);
     }
     for (let j = 0; j < hFeet; j++) {
        addSegment(startX, startY + j * FT_TO_MM, startX, startY + (j + 1) * FT_TO_MM, r.level);
        addSegment(startX + wFeet * FT_TO_MM, startY + j * FT_TO_MM, startX + wFeet * FT_TO_MM, startY + (j + 1) * FT_TO_MM, r.level);
     }
  }

  const hSegments = Array.from(segmentMap.values()).filter(s => s.dir === 'h');
  const vSegments = Array.from(segmentMap.values()).filter(s => s.dir === 'v');
  const mergedWalls: WallSegment[] = [];

  function mergeLineSet(segments: any[], dir: 'h'|'v') {
    const groups = new Map<string, any[]>();
    for (const s of segments) {
       const key = s.level + "_" + s.count + "_" + (dir === 'h' ? s.y1 : s.x1);
       if (!groups.has(key)) groups.set(key, []);
       groups.get(key)!.push(s);
    }

    for (const [, segs] of Array.from(groups.entries())) {
       const counts = segs[0].count;
       const layer = counts === 1 ? 'EXTERIOR_WALLS' : 'INTERIOR_WALLS';
       const thickness = counts === 1 ? extThickness : intThickness;
       const level = segs[0].level;

       segs.sort((a, b) => dir === 'h' ? a.x1 - b.x1 : a.y1 - b.y1);

       let currentStart = segs[0];
       let currentEnd = segs[0];

       for (let i = 1; i < segs.length; i++) {
          const s = segs[i];
          const touches = dir === 'h' ? s.x1 === currentEnd.x2 : s.y1 === currentEnd.y2;
          if (touches) {
             currentEnd = s;
          } else {
             mergedWalls.push({
               x1: currentStart.x1 * FT_TO_MM, y1: currentStart.y1 * FT_TO_MM,
               x2: currentEnd.x2 * FT_TO_MM, y2: currentEnd.y2 * FT_TO_MM,
               thickness, layer, level
             });
             currentStart = s;
             currentEnd = s;
          }
       }
       mergedWalls.push({
         x1: currentStart.x1 * FT_TO_MM, y1: currentStart.y1 * FT_TO_MM,
         x2: currentEnd.x2 * FT_TO_MM, y2: currentEnd.y2 * FT_TO_MM,
         thickness, layer, level
       });
    }
  }

  mergeLineSet(hSegments, 'h');
  mergeLineSet(vSegments, 'v');

  return mergedWalls;
}

function findSharedEdge(
  a: Rect,
  b: Rect,
  intThickness: number
): { x1: number; y1: number; x2: number; y2: number } | null {
  const tolerance = intThickness + 10;

  if (Math.abs(a.x + a.width - b.x) < tolerance) {
    const overlapY1 = Math.max(a.y, b.y);
    const overlapY2 = Math.min(a.y + a.height, b.y + b.height);
    if (overlapY2 > overlapY1) return { x1: a.x + a.width, y1: overlapY1, x2: a.x + a.width, y2: overlapY2 };
  }
  
  if (Math.abs(b.x + b.width - a.x) < tolerance) {
    const overlapY1 = Math.max(a.y, b.y);
    const overlapY2 = Math.min(a.y + a.height, b.y + b.height);
    if (overlapY2 > overlapY1) return { x1: b.x + b.width, y1: overlapY1, x2: b.x + b.width, y2: overlapY2 };
  }

  if (Math.abs(a.y + a.height - b.y) < tolerance) {
    const overlapX1 = Math.max(a.x, b.x);
    const overlapX2 = Math.min(a.x + a.width, b.x + b.width);
    if (overlapX2 > overlapX1) return { x1: overlapX1, y1: a.y + a.height, x2: overlapX2, y2: a.y + a.height };
  }

  if (Math.abs(b.y + b.height - a.y) < tolerance) {
    const overlapX1 = Math.max(a.x, b.x);
    const overlapX2 = Math.min(a.x + a.width, b.x + b.width);
    if (overlapX2 > overlapX1) return { x1: overlapX1, y1: b.y + b.height, x2: overlapX2, y2: b.y + b.height };
  }

  return null;
}

function placeOpenings(
  openings: Opening[],
  rooms: PlacedRoom[],
  walls: WallSegment[],
  intThickness: number,
  extThickness: number
): PlacedOpening[] {
  const placed: PlacedOpening[] = [];
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  if (!openings) return placed;

  for (const opening of openings) {
    const [roomId1, roomId2] = opening.connecting;
    const room1 = roomMap.get(roomId1);
    const room2 = roomMap.get(roomId2);

    if (!room1) continue;

    const openingWidth = opening.width_mm ?? (opening.type === "door" ? 900 : 1200);
    const level = room1.level;

    if (!room2 || roomId2 === "exterior") {
       const extOpening = placeOnExteriorWall(room1, walls, opening, openingWidth, extThickness);
       if (extOpening) {
         extOpening.level = level;
         placed.push(extOpening);
       }
       continue;
    }
    
    // Only place shared opening if on the same level
    if (room1.level !== room2.level) continue;

    const edge = findSharedEdge(room1.rect, room2.rect, intThickness);
    if (!edge) continue;

    const isVertical = Math.abs(edge.x1 - edge.x2) < 1;
    const centerX = (edge.x1 + edge.x2) / 2;
    const centerY = (edge.y1 + edge.y2) / 2;

    // Force interior connections to be doors, strictly preventing internal windows
    const safeType = "door";

    placed.push({
      type: safeType,
      x: isVertical ? centerX : centerX - openingWidth / 2,
      y: isVertical ? centerY - openingWidth / 2 : centerY,
      width: openingWidth,
      height: 50,
      angle: isVertical ? 90 : 0,
      level,
      layer: "DOORS",
      room1: roomId1,
      room2: roomId2,
    });
  }
  return placed;
}

function placeOnExteriorWall(
  room: PlacedRoom,
  walls: WallSegment[],
  opening: Opening,
  openingWidth: number,
  extThickness: number
): PlacedOpening | null {
  const r = room.rect;
  
  // Find all true EXTERIOR_WALLS segments that overlap with this room's physical boundary
  const extWalls = walls.filter(w => w.layer === "EXTERIOR_WALLS" && w.level === room.level);
  
  const roomBounds = {
    minX: r.x,
    maxX: r.x + r.width,
    minY: r.y,
    maxY: r.y + r.height
  };

  const tol = 100;
  
  // Try to find a valid segment matching this room
  for (const w of extWalls) {
    const isVertical = Math.abs(w.x1 - w.x2) < 1;
    if (isVertical) {
       if (Math.abs(w.x1 - roomBounds.minX) < tol || Math.abs(w.x1 - roomBounds.maxX) < tol) {
          const overlapMin = Math.max(Math.min(w.y1, w.y2), roomBounds.minY);
          const overlapMax = Math.min(Math.max(w.y1, w.y2), roomBounds.maxY);
          if (overlapMax - overlapMin > openingWidth) {
             return {
                type: opening.type,
                x: w.x1,
                y: (overlapMin + overlapMax) / 2 - openingWidth / 2,
                width: openingWidth, height: 50, angle: 90,
                level: room.level,
                layer: opening.type === "door" ? "DOORS" : "WINDOWS",
                room1: opening.connecting[0],
                room2: "exterior"
             };
          }
       }
    } else {
       if (Math.abs(w.y1 - roomBounds.minY) < tol || Math.abs(w.y1 - roomBounds.maxY) < tol) {
          const overlapMin = Math.max(Math.min(w.x1, w.x2), roomBounds.minX);
          const overlapMax = Math.min(Math.max(w.x1, w.x2), roomBounds.maxX);
          if (overlapMax - overlapMin > openingWidth) {
             return {
                type: opening.type,
                x: (overlapMin + overlapMax) / 2 - openingWidth / 2,
                y: w.y1,
                width: openingWidth, height: 50, angle: 0,
                level: room.level,
                layer: opening.type === "door" ? "DOORS" : "WINDOWS",
                room1: opening.connecting[0],
                room2: "exterior"
             };
          }
       }
    }
  }

  return null;
}
