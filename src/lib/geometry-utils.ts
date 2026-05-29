/**
 * Geometry Utilities for ArchDraft Universal
 * 
 * Mathematical primitives for spatial validation, collision detection,
 * and geometric constraint enforcement.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomBounds {
  id: string;
  name: string;
  level: number;
  bounds: BoundingBox;
}

/**
 * Axis-Aligned Bounding Box (AABB) collision detection with tolerance.
 * Returns true if two rectangles overlap by more than the tolerance threshold.
 * 
 * CRITICAL FIX: Adjacent rooms that share an edge should NOT be flagged as overlapping.
 * We use a 1mm tolerance to account for floating-point precision errors while
 * allowing rooms to be perfectly adjacent (touching edges).
 * 
 * Mathematical condition:
 * Overlap = (X₁,min < X₂,max - ε ∧ X₁,max > X₂,min + ε) ∧ (Y₁,min < Y₂,max - ε ∧ Y₁,max > Y₂,min + ε)
 * where ε = 1mm tolerance
 */
export function detectOverlap(a: BoundingBox, b: BoundingBox, tolerance: number = 1): boolean {
  const aMinX = a.x;
  const aMaxX = a.x + a.width;
  const aMinY = a.y;
  const aMaxY = a.y + a.height;

  const bMinX = b.x;
  const bMaxX = b.x + b.width;
  const bMinY = b.y;
  const bMaxY = b.y + b.height;

  // Calculate the actual overlap distances
  const overlapX = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX);
  const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);

  // Only flag as overlap if BOTH dimensions overlap by more than tolerance
  // This allows rooms to share edges (0mm overlap) without being flagged
  return overlapX > tolerance && overlapY > tolerance;
}

/**
 * Check for room overlaps on the same level.
 * Returns array of collision pairs.
 */
export function detectRoomCollisions(rooms: RoomBounds[]): Array<{ room1: string; room2: string; level: number }> {
  const collisions: Array<{ room1: string; room2: string; level: number }> = [];

  // Group rooms by level for efficient checking
  const roomsByLevel = new Map<number, RoomBounds[]>();
  for (const room of rooms) {
    if (!roomsByLevel.has(room.level)) {
      roomsByLevel.set(room.level, []);
    }
    roomsByLevel.get(room.level)!.push(room);
  }

  // Check for overlaps within each level
  for (const [level, levelRooms] of roomsByLevel.entries()) {
    for (let i = 0; i < levelRooms.length; i++) {
      for (let j = i + 1; j < levelRooms.length; j++) {
        const roomA = levelRooms[i];
        const roomB = levelRooms[j];

        if (detectOverlap(roomA.bounds, roomB.bounds)) {
          collisions.push({
            room1: roomA.name,
            room2: roomB.name,
            level,
          });
        }
      }
    }
  }

  return collisions;
}

/**
 * Calculate total area of all rooms in square feet.
 */
export function calculateTotalRoomArea(rooms: Array<{ width_ft: number; length_ft: number }>): number {
  return rooms.reduce((sum, room) => sum + (room.width_ft * room.length_ft), 0);
}

/**
 * Check if two rooms are adjacent (share an edge).
 * Tolerance is in millimeters.
 */
export function areRoomsAdjacent(
  a: BoundingBox,
  b: BoundingBox,
  tolerance: number = 100
): boolean {
  // Check if they share a vertical edge
  if (Math.abs(a.x + a.width - b.x) < tolerance || Math.abs(b.x + b.width - a.x) < tolerance) {
    const overlapY1 = Math.max(a.y, b.y);
    const overlapY2 = Math.min(a.y + a.height, b.y + b.height);
    if (overlapY2 > overlapY1) return true;
  }

  // Check if they share a horizontal edge
  if (Math.abs(a.y + a.height - b.y) < tolerance || Math.abs(b.y + b.height - a.y) < tolerance) {
    const overlapX1 = Math.max(a.x, b.x);
    const overlapX2 = Math.min(a.x + a.width, b.x + b.width);
    if (overlapX2 > overlapX1) return true;
  }

  return false;
}

/**
 * Calculate the distance between two points.
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Check if a point is inside a bounding box.
 */
export function isPointInBounds(x: number, y: number, bounds: BoundingBox): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}
