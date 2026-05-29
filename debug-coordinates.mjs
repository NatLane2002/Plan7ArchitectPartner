/**
 * Debug script to visualize room coordinates and identify adjacency issues
 */

import { generateFloorPlanGeometry } from './src/lib/bsp-engine.ts';

const testPlan = {
  project_title: "Debug Test",
  architectural_style: "Modern",
  exterior_wall_thickness_mm: 250,
  interior_wall_thickness_mm: 120,
  stories: 1,
  footprint_dimensions: {
    width: 18288,
    length: 12192,
    total_area_sqft_calculated: 2400
  },
  rooms: [
    {
      id: "central_hallway",
      name: "Central Hallway",
      room_type: "hallway",
      grid_x: 20,
      grid_y: 12,
      level: 1,
      width_ft: 27,
      length_ft: 4,
      floor_material: "hardwood"
    },
    {
      id: "master_bedroom",
      name: "Master Bedroom",
      room_type: "bedroom",
      grid_x: 0,
      grid_y: 18,
      level: 1,
      width_ft: 16,
      length_ft: 14,
      floor_material: "carpet"
    }
  ],
  openings: [
    {
      id: "hallway_to_master",
      type: "door",
      connecting: ["central_hallway", "master_bedroom"],
      width_mm: 900,
      height_mm: 2100
    }
  ],
  construction_notes: "Debug test"
};

const FT_TO_MM = 304.8;

console.log("🔍 Debugging Room Adjacency\n");

// Calculate room boundaries in mm
testPlan.rooms.forEach(room => {
  const x1 = room.grid_x * FT_TO_MM;
  const y1 = room.grid_y * FT_TO_MM;
  const x2 = x1 + (room.width_ft * FT_TO_MM);
  const y2 = y1 + (room.length_ft * FT_TO_MM);
  
  console.log(`${room.name} (${room.id}):`);
  console.log(`  Grid: (${room.grid_x}, ${room.grid_y}) → (${room.grid_x + room.width_ft}, ${room.grid_y + room.length_ft})`);
  console.log(`  MM:   (${Math.round(x1)}, ${Math.round(y1)}) → (${Math.round(x2)}, ${Math.round(y2)})`);
  console.log(`  Size: ${room.width_ft}ft × ${room.length_ft}ft\n`);
});

// Check adjacency
const hallway = testPlan.rooms[0];
const bedroom = testPlan.rooms[1];

const h_x1 = hallway.grid_x * FT_TO_MM;
const h_y1 = hallway.grid_y * FT_TO_MM;
const h_x2 = h_x1 + (hallway.width_ft * FT_TO_MM);
const h_y2 = h_y1 + (hallway.length_ft * FT_TO_MM);

const b_x1 = bedroom.grid_x * FT_TO_MM;
const b_y1 = bedroom.grid_y * FT_TO_MM;
const b_x2 = b_x1 + (bedroom.width_ft * FT_TO_MM);
const b_y2 = b_y1 + (bedroom.length_ft * FT_TO_MM);

console.log("Adjacency Analysis:");
console.log(`Hallway bottom (y2): ${Math.round(h_y2)}mm (grid: ${hallway.grid_y + hallway.length_ft})`);
console.log(`Bedroom top (y1):    ${Math.round(b_y1)}mm (grid: ${bedroom.grid_y})`);
console.log(`Gap: ${Math.round(b_y1 - h_y2)}mm (${(b_y1 - h_y2) / FT_TO_MM}ft)`);
console.log(`Wall thickness: ${testPlan.interior_wall_thickness_mm}mm\n`);

console.log(`Hallway X range: ${Math.round(h_x1)} - ${Math.round(h_x2)}mm (grid: ${hallway.grid_x} - ${hallway.grid_x + hallway.width_ft})`);
console.log(`Bedroom X range: ${Math.round(b_x1)} - ${Math.round(b_x2)}mm (grid: ${bedroom.grid_x} - ${bedroom.grid_x + bedroom.width_ft})`);
console.log(`X overlap: ${Math.max(h_x1, b_x1)} - ${Math.min(h_x2, b_x2)}mm\n`);

// Run the actual geometry generation
try {
  const geometry = generateFloorPlanGeometry(testPlan);
  console.log("Geometry Results:");
  console.log(`- Openings placed: ${geometry.openings.length}/${testPlan.openings.length}`);
  
  if (geometry.openings.length > 0) {
    console.log("\n✅ Door was placed:");
    geometry.openings.forEach(o => {
      console.log(`  ${o.room1} <-> ${o.room2} at (${Math.round(o.x)}, ${Math.round(o.y)})`);
    });
  } else {
    console.log("\n❌ Door was NOT placed!");
    console.log("\nPossible reasons:");
    console.log(`1. Gap (${Math.round(b_y1 - h_y2)}mm) exceeds tolerance (${testPlan.interior_wall_thickness_mm * 1.5}mm)`);
    console.log(`2. Rooms don't overlap in X direction`);
    console.log(`3. Overlap is too small (< 300mm)`);
  }
} catch (error) {
  console.error("Error:", error);
}
