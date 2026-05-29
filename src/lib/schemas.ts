import { z } from "zod";
import { validateFloorPlan } from "./validators";

// ── Highly Detailed Room Schema ──
export const RoomSchema = z.object({
  id: z.string().describe("Unique room identifier in snake_case, e.g. 'master_bedroom'"),
  name: z.string().describe("Human-readable room name, e.g. 'Master Bedroom'"),
  room_type: z.enum([
    "living_area", "kitchen", "dining", "bedroom", "bathroom", 
    "hallway", "entry", "garage", "utility", "office", "closet", "outdoor"
  ]).describe("Categorization of the space"),
  grid_x: z.number().int().describe("Top-left X coordinate of the room on a 1ft grid. (0 is furthest left)"),
  grid_y: z.number().int().describe("Top-left Y coordinate of the room on a 1ft grid. (0 is furthest top)"),
  level: z.number().int().default(1).describe("Floor level (1 for ground, 2 for second floor, etc.)"),
  width_ft: z.number().int().min(3).describe("Width of the room in feet (X-axis span)"),
  length_ft: z.number().int().min(3).describe("Length of the room in feet (Y-axis span)"),
  floor_material: z.enum(["hardwood", "tile", "carpet", "concrete", "laminate"]).optional(),
});

// ── Detailed Opening Schema ──
export const OpeningSchema = z.object({
  id: z.string().describe("Unique opening identifier, e.g. 'front_door', 'kitchen_window_1'"),
  type: z.enum([
    "door",
    "window",
    "sliding_door",
    "double_door",
    "archway",
    "pocket_door",
    "garage_door",
  ]).describe("Type of architectural opening"),
  connecting: z.tuple([z.string(), z.string()]).describe("Pair of room IDs connected by this opening. Use 'exterior' for outside connections."),
  width_mm: z.number().positive().describe("Exact width of opening in mm. standard doors=900, exterior doors=1000, double doors=1800, garage doors=2400-4800, windows=varies(600-2400)"),
  height_mm: z.number().positive().default(2100).describe("Height of the opening in mm (standard door=2100, garage door=2100-2400)"),
});

// ── Dimensions Schema ──
export const FootprintSchema = z.object({
  width: z.number().positive().describe("Total exterior width of building footprint in millimeters"),
  length: z.number().positive().describe("Total exterior length of building footprint in millimeters"),
  total_area_sqft_calculated: z.number().positive().describe("Total structural square footage for consistency check"),
});

// ── Master Floor Plan Schema for AI Output ──
export const FloorPlanSchema = z.object({
  project_title: z.string().describe("Name of the project"),
  architectural_style: z.string().describe("E.g., Modern Farmhouse, Mid-Century, American Craftsman"),
  footprint_dimensions: FootprintSchema,
  exterior_wall_thickness_mm: z.number().default(250).describe("Thickness of exterior walls (usually 200-300mm depending on insulation/brick)"),
  interior_wall_thickness_mm: z.number().default(120).describe("Thickness of interior walls (usually 100-150mm for drywall/studs)"),
  stories: z.number().int().min(1).max(3).default(1).describe("Number of floor levels in this plan"),
  rooms: z.array(RoomSchema).min(1).describe("List of all rooms defined in the floor plan"),
  openings: z.array(OpeningSchema).min(1).describe("List of all doors, windows, and passthroughs"),
  construction_notes: z.string().describe("Any general layout notes for the CAD professional or architect."),
}).superRefine((data, ctx) => {
  // Run comprehensive spatial validation
  const errors = validateFloorPlan(data);
  
  for (const error of errors) {
    if (error.severity === "error") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error.message,
        path: error.field.split("."),
      });
    }
  }
});

export type Room = z.infer<typeof RoomSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Footprint = z.infer<typeof FootprintSchema>;
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

export interface UserInput {
  natural_language: string;
  square_footage?: number;
  num_bedrooms?: number;
  num_bathrooms?: number;
  style?: string;
}

// Returns a minified string representation of the schema for the LLM prompt
export function getPromptSystemInstruction(): string {
  return `You are a Master Architect and CAD data engineer. Your ONLY job is to output a single, raw, valid JSON object that strictly conforms to the schema below. This JSON will be machine-parsed — any deviation will cause a hard failure.

════════════════════════════════════════════════════════════
OUTPUT RULES (ABSOLUTE — ZERO EXCEPTIONS)
════════════════════════════════════════════════════════════
1. Output ONLY the raw JSON object. No markdown, no code fences, no explanation, no commentary before or after.
2. Every field marked as required MUST be present. Do not omit any field.
3. All enum values MUST be copied exactly as written — case-sensitive, no variations.
4. All numeric fields MUST be numbers (not strings). All string fields MUST be strings.
5. Room IDs and opening IDs MUST be unique snake_case strings (e.g. "master_bedroom", "front_door").

════════════════════════════════════════════════════════════
GRID COORDINATE SYSTEM
════════════════════════════════════════════════════════════
You are drawing the house on a 1-foot × 1-foot Cartesian grid.
- grid_x: columns, grows LEFT → RIGHT (0 = leftmost)
- grid_y: rows, grows TOP → BOTTOM (0 = topmost)
- Every room occupies a rectangle: top-left corner at (grid_x, grid_y), spanning width_ft columns and length_ft rows.

RULE — NO OVERLAPS: On the same level, no two rooms may share any grid cell. Each cell belongs to exactly one room.
RULE — NO GAPS: Rooms must be packed tightly. If two rooms are meant to be adjacent, their edges must touch exactly. Example: Room A at x=0, width=15 → Room B to its right MUST start at x=15.
RULE — USE HALLWAYS: If two rooms are not directly adjacent, add a hallway room between them. Hallways are real rooms with room_type "hallway".
RULE — REALISTIC SHAPES: Real houses are not perfect rectangles. Use L-shapes, T-shapes, and offset wings to create authentic floor plans.

MULTI-STORY RULE (CRITICAL):
- If stories > 1, Level 2 rooms MUST use the EXACT SAME grid_x/grid_y coordinate space as Level 1 (they stack vertically, not side-by-side).
- Stairwells MUST appear on BOTH levels with identical grid_x, grid_y, width_ft, and length_ft.
- DO NOT place Level 2 rooms to the right of Level 1 rooms. They must overlap in grid space.

════════════════════════════════════════════════════════════
OPENING RULES (DOORS, WINDOWS, GARAGE DOORS)
════════════════════════════════════════════════════════════
RULE — INTERIOR CONNECTIONS: Rooms on the same level that share a wall MUST be connected by a door, archway, or pocket_door. Every room must be reachable.
RULE — WINDOWS ARE EXTERIOR ONLY: A window MUST always connect a room to "exterior". NEVER use "window" between two interior rooms.
RULE — GARAGE DOORS (CRITICAL): Any opening in a garage room that leads to the outside MUST use type "garage_door". NEVER use "door" for a garage-to-exterior opening. The garage_door MUST be placed on the WIDEST exterior wall of the garage room — this is the front face where a car drives in. A standard attached garage is wider than it is deep (e.g. 22ft wide × 20ft deep), so the garage door goes on the 22ft wall. NEVER place a garage door on a narrow side wall.
RULE — DOUBLE DOORS: Use "double_door" for grand entries, main front doors of large homes, and any opening wider than 1500mm between two rooms or to exterior. Double doors get their own distinct color in the diagram and their own DXF layer for Plan7Architect import.
RULE — DOOR WIDTHS: standard interior door=900mm, exterior entry door=1000mm, double door=1800mm, garage door=2400mm (single) or 4800mm (double-wide).

════════════════════════════════════════════════════════════
VALID ENUM VALUES — COPY EXACTLY
════════════════════════════════════════════════════════════
room_type:     "living_area" | "kitchen" | "dining" | "bedroom" | "bathroom" | "hallway" | "entry" | "garage" | "utility" | "office" | "closet" | "outdoor"
opening type:  "door" | "window" | "sliding_door" | "double_door" | "archway" | "pocket_door" | "garage_door"
floor_material:"hardwood" | "tile" | "carpet" | "concrete" | "laminate"

════════════════════════════════════════════════════════════
SCHEMA (all fields required unless marked optional)
════════════════════════════════════════════════════════════
{
  "project_title": "string — descriptive name for this project",
  "architectural_style": "string — e.g. Modern Farmhouse, Mid-Century Modern, American Craftsman",
  "footprint_dimensions": {
    "width": number (mm) — total exterior width of the building,
    "length": number (mm) — total exterior depth of the building,
    "total_area_sqft_calculated": number — exact sum of ALL room areas (width_ft × length_ft for every room)
  },
  "exterior_wall_thickness_mm": 250,
  "interior_wall_thickness_mm": 120,
  "stories": number (integer 1–3),
  "rooms": [
    {
      "id": "snake_case unique string",
      "name": "Human Readable Name",
      "room_type": "<see valid enum above>",
      "grid_x": integer (top-left X on 1ft grid),
      "grid_y": integer (top-left Y on 1ft grid),
      "level": integer (1 = ground floor, 2 = second floor),
      "width_ft": integer ≥ 3,
      "length_ft": integer ≥ 3,
      "floor_material": "<see valid enum above — optional>"
    }
  ],
  "openings": [
    {
      "id": "snake_case unique string",
      "type": "<see valid enum above — GARAGE ROOMS MUST USE garage_door TO EXTERIOR>",
      "connecting": ["room_id_1", "room_id_2 or 'exterior'"],
      "width_mm": number (see door width rules above),
      "height_mm": 2100
    }
  ],
  "construction_notes": "string — any notes for the CAD professional"
}

════════════════════════════════════════════════════════════
SELF-CHECK BEFORE OUTPUTTING (run these checks mentally)
════════════════════════════════════════════════════════════
□ Does total_area_sqft_calculated equal the exact sum of (width_ft × length_ft) for every room?
□ Are all room IDs unique? Are all opening IDs unique?
□ Do any two rooms on the same level share a grid cell? (They must not.)
□ Does every interior room have at least one door/archway connecting it to an adjacent room?
□ Does every garage room have a garage_door (not "door") connecting it to "exterior"?
□ Is the garage_door placed on the WIDEST exterior wall of the garage (the front face, not a side wall)?
□ Are grand entries or wide openings (>1500mm) using "double_door" type?
□ Do all windows connect to "exterior" only?
□ Are all enum values spelled exactly as listed above?
□ Is the output raw JSON with no markdown wrapping?`;
}
