import { z } from "zod";

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
  type: z.enum(["door", "window", "sliding_door", "double_door", "archway", "pocket_door"]).describe("Type of architectural opening"),
  connecting: z.tuple([z.string(), z.string()]).describe("Pair of room IDs connected by this opening. Use 'exterior' for outside connections."),
  width_mm: z.number().positive().describe("Exact width of opening in mm. standard doors=900, exterior doors=1000, double doors=1800, windows=varies(600-2400)"),
  height_mm: z.number().positive().default(2100).describe("Height of the opening in mm (standard door=2100)"),
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
  construction_notes: z.string().describe("Any general layout notes for the drafts-person or Plan7 architect user."),
});

export type Room = z.infer<typeof RoomSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Footprint = z.infer<typeof FootprintSchema>;
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

// Returns a minified string representation of the schema for the LLM prompt
export function getPromptSystemInstruction(): string {
  return `You are a Master Architect designing highly realistic, precise floor plans.
You will receive a client's requirements. Your job is to output a raw JSON object string strictly matching the following schema.
Do NOT wrap the output in markdown code blocks. Output ONLY valid JSON.

CRITICAL GRID INSTRUCTIONS:
You are literally drawing the house on a 1-foot by 1-foot Cartesian grid.
- X grows from left to right.
- Y grows from top to bottom.
- The top-left corner of the main house should be at (0,0).
- NO OVERLAPPING ROOMS ON THE SAME LEVEL! Every room must have exclusive grid space per floor.
- CRITICAL MULTI-STORY RULE: If 'stories' is 2, you MUST use the 'level' property (1 or 2). DO NOT lay out Level 2 horizontally next to Level 1! Level 2 rooms MUST be placed at the EXACT SAME grid_x/grid_y coordinate space as Level 1 so they stack perfectly vertically. Stairwells MUST have identical grid_x, grid_y, width_ft, and length_ft on BOTH levels.
- TO MAKE ROOMS ADJACENT, they must share mathematical borders. If the Kitchen is at x:0, y:0, width:15, length:20, and the Living Room is to its right, the Living Room MUST start at x:15.
- LEAVE NO GAPS between interior rooms unless it is an explicit outdoor courtyard. Hallways are rooms too! Use hallway rooms to connect distant spaces.
- Real houses are rarely perfect squares; use L-shapes, T-shapes, or staggered rooms for realistic, interesting profiles.

CRITICAL OPENING INSTRUCTIONS (DOORS & WINDOWS):
- You MUST connect interior rooms with "door", "archway", or "pocket_door".
- NEVER connect two interior rooms with a "window". Windows MUST ONLY connect an interior room to "exterior".

SCHEMA:
{
  "project_title": "string",
  "architectural_style": "string",
  "footprint_dimensions": {
    "width": "total grid width needed (feet)",
    "length": "total grid height needed (feet)",
    "total_area_sqft_calculated": "sum of room square footage"
  },
  "exterior_wall_thickness_mm": 250,
  "interior_wall_thickness_mm": 120,
  "stories": 1,
  "rooms": [
    {
      "id": "string (snake_case)",
      "name": "string",
      "room_type": "living_area | kitchen | dining | bedroom | bathroom | hallway | entry | garage | utility | office | closet | outdoor",
      "grid_x": "number (top-left X coordinate)",
      "grid_y": "number (top-left Y coordinate)",
      "level": "number (1 for ground, 2 for upper, etc.)",
      "width_ft": "number (width in feet)",
      "length_ft": "number (length in feet)",
      "floor_material": "hardwood | tile | carpet | concrete"
    }
  ],
  "openings": [
    {
      "id": "string",
      "type": "door | window | sliding_door | double_door | archway",
      "connecting": ["room_id", "room_id or 'exterior'"],
      "width_mm": "number (900 for doors, 1800 for doubles)"
    }
  ],
  "construction_notes": "string"
}`;
}
