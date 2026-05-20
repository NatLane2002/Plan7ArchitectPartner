/**
 * Spatial Validators for ArchDraft Universal
 * 
 * High-level validation logic for floor plan schemas.
 * Enforces geometric constraints and architectural rules.
 */

import type { FloorPlan, Room, Opening } from "./schemas";
import { detectRoomCollisions, calculateTotalRoomArea, areRoomsAdjacent, type RoomBounds } from "./geometry-utils";

const FT_TO_MM = 304.8;

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Comprehensive floor plan validation.
 * Returns array of validation errors (empty if valid).
 */
export function validateFloorPlan(plan: FloorPlan): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Check for room overlaps on the same level
  const roomBounds: RoomBounds[] = plan.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    level: room.level || 1,
    bounds: {
      x: room.grid_x * FT_TO_MM,
      y: room.grid_y * FT_TO_MM,
      width: room.width_ft * FT_TO_MM,
      height: room.length_ft * FT_TO_MM,
    },
  }));

  const collisions = detectRoomCollisions(roomBounds);
  for (const collision of collisions) {
    errors.push({
      field: "rooms",
      message: `Room overlap detected on Level ${collision.level}: "${collision.room1}" and "${collision.room2}" occupy the same space. Rooms on the same level must not overlap.`,
      severity: "error",
    });
  }

  // 2. Validate footprint area consistency (±10% tolerance)
  const calculatedArea = calculateTotalRoomArea(plan.rooms);
  const declaredArea = plan.footprint_dimensions.total_area_sqft_calculated;
  const areaDifference = Math.abs(calculatedArea - declaredArea);
  const tolerance = declaredArea * 0.1;

  if (areaDifference > tolerance) {
    errors.push({
      field: "footprint_dimensions.total_area_sqft_calculated",
      message: `Footprint area mismatch: Declared ${declaredArea} sq ft, but sum of room areas is ${calculatedArea.toFixed(1)} sq ft. Difference of ${areaDifference.toFixed(1)} sq ft exceeds 10% tolerance.`,
      severity: "error",
    });
  }

  // 3. Validate opening constraints
  // For multi-story buildings, create a composite key map: "roomId_level"
  // This allows the same room (e.g., stairwell) to exist on multiple levels
  const roomMap = new Map<string, Room>();
  for (const room of plan.rooms) {
    const level = room.level || 1;
    const compositeKey = `${room.id}_L${level}`;
    roomMap.set(compositeKey, room);
    // Also keep the simple ID for backward compatibility with single-level lookups
    if (!roomMap.has(room.id)) {
      roomMap.set(room.id, room);
    }
  }

  for (const opening of plan.openings) {
    const [roomId1, roomId2] = opening.connecting;

    // 3a. Check that connected rooms exist
    if (roomId1 !== "exterior" && !roomMap.has(roomId1)) {
      errors.push({
        field: `openings.${opening.id}`,
        message: `Opening "${opening.id}" references non-existent room "${roomId1}".`,
        severity: "error",
      });
      continue;
    }

    if (roomId2 !== "exterior" && !roomMap.has(roomId2)) {
      errors.push({
        field: `openings.${opening.id}`,
        message: `Opening "${opening.id}" references non-existent room "${roomId2}".`,
        severity: "error",
      });
      continue;
    }

    // 3b. Enforce window-to-exterior rule
    if (opening.type === "window") {
      if (roomId1 !== "exterior" && roomId2 !== "exterior") {
        errors.push({
          field: `openings.${opening.id}`,
          message: `Window "${opening.id}" connects two interior rooms ("${roomId1}" and "${roomId2}"). Windows must connect to "exterior".`,
          severity: "error",
        });
      }
    }

    // 3c. Check that interior openings connect adjacent rooms
    if (roomId1 !== "exterior" && roomId2 !== "exterior") {
      const room1 = roomMap.get(roomId1)!;
      const room2 = roomMap.get(roomId2)!;

      // Only check adjacency if on the same level
      if (room1.level === room2.level) {
        const bounds1 = {
          x: room1.grid_x * FT_TO_MM,
          y: room1.grid_y * FT_TO_MM,
          width: room1.width_ft * FT_TO_MM,
          height: room1.length_ft * FT_TO_MM,
        };

        const bounds2 = {
          x: room2.grid_x * FT_TO_MM,
          y: room2.grid_y * FT_TO_MM,
          width: room2.width_ft * FT_TO_MM,
          height: room2.length_ft * FT_TO_MM,
        };

        const tolerance = (plan.interior_wall_thickness_mm || 120) + 50; // Add 50mm buffer
        if (!areRoomsAdjacent(bounds1, bounds2, tolerance)) {
          errors.push({
            field: `openings.${opening.id}`,
            message: `Opening "${opening.id}" connects non-adjacent rooms "${room1.name}" and "${room2.name}". Rooms must share a wall to have a connecting opening.`,
            severity: "warning",
          });
        }
      }
    }
  }

  // 4. Check for minimum room dimensions
  for (const room of plan.rooms) {
    if (room.width_ft < 3 || room.length_ft < 3) {
      errors.push({
        field: `rooms.${room.id}`,
        message: `Room "${room.name}" has dimensions ${room.width_ft}' × ${room.length_ft}'. Minimum dimension is 3 feet.`,
        severity: "error",
      });
    }
  }

  // 5. Check for duplicate room IDs (level-aware for multi-story buildings)
  // In multi-story buildings, the same room (e.g., stairwell) can exist on multiple levels
  // We create a composite key: "roomId_level" to allow vertical room continuity
  const roomCompositeKeys = new Set<string>();
  const roomIdsByLevel = new Map<number, Set<string>>();
  
  for (const room of plan.rooms) {
    const level = room.level || 1;
    const compositeKey = `${room.id}_L${level}`;
    
    // Check for duplicate on the SAME level
    if (!roomIdsByLevel.has(level)) {
      roomIdsByLevel.set(level, new Set());
    }
    
    const levelRoomIds = roomIdsByLevel.get(level)!;
    if (levelRoomIds.has(room.id)) {
      errors.push({
        field: `rooms.${room.id}`,
        message: `Duplicate room ID "${room.id}" on Level ${level}. Each room must have a unique identifier per level.`,
        severity: "error",
      });
    }
    
    levelRoomIds.add(room.id);
    roomCompositeKeys.add(compositeKey);
  }

  // 6. Check for duplicate opening IDs
  const openingIds = new Set<string>();
  for (const opening of plan.openings) {
    if (openingIds.has(opening.id)) {
      errors.push({
        field: `openings.${opening.id}`,
        message: `Duplicate opening ID "${opening.id}". Each opening must have a unique identifier.`,
        severity: "error",
      });
    }
    openingIds.add(opening.id);
  }

  return errors;
}

/**
 * Format validation errors for display.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return "";

  const errorMessages = errors
    .filter((e) => e.severity === "error")
    .map((e) => `• ${e.message}`)
    .join("\n");

  const warningMessages = errors
    .filter((e) => e.severity === "warning")
    .map((e) => `• ${e.message}`)
    .join("\n");

  let output = "";
  if (errorMessages) {
    output += `ERRORS:\n${errorMessages}`;
  }
  if (warningMessages) {
    if (output) output += "\n\n";
    output += `WARNINGS:\n${warningMessages}`;
  }

  return output;
}
