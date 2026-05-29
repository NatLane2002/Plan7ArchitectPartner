/**
 * Test script to verify door placement fix
 * Run with: node test-door-placement.mjs
 */

import { generateFloorPlanGeometry } from './src/lib/bsp-engine.ts';

// Test case: Simple floor plan with adjacent rooms that should have doors
const testFloorPlan = {
  project_title: "Door Placement Test",
  architectural_style: "Modern",
  exterior_wall_thickness_mm: 250,
  interior_wall_thickness_mm: 120,
  stories: 1,
  footprint_dimensions: {
    width: 12192, // 40ft in mm
    length: 9144,  // 30ft in mm
    total_area_sqft_calculated: 1200
  },
  rooms: [
    {
      id: "living_room",
      name: "Living Room",
      room_type: "living_area",
      grid_x: 0,
      grid_y: 0,
      level: 1,
      width_ft: 20,
      length_ft: 15,
      floor_material: "hardwood"
    },
    {
      id: "kitchen",
      name: "Kitchen",
      room_type: "kitchen",
      grid_x: 20, // Adjacent to living room (living room ends at x=20)
      grid_y: 0,
      level: 1,
      width_ft: 15,
      length_ft: 12,
      floor_material: "tile"
    },
    {
      id: "hallway",
      name: "Hallway",
      room_type: "hallway",
      grid_x: 20,
      grid_y: 12, // Adjacent to kitchen (kitchen ends at y=12)
      level: 1,
      width_ft: 15,
      length_ft: 3,
      floor_material: "hardwood"
    },
    {
      id: "bathroom",
      name: "Bathroom",
      room_type: "bathroom",
      grid_x: 20,
      grid_y: 15, // Adjacent to hallway (hallway ends at y=15)
      level: 1,
      width_ft: 8,
      length_ft: 6,
      floor_material: "tile"
    },
    {
      id: "bedroom",
      name: "Bedroom",
      room_type: "bedroom",
      grid_x: 28, // Adjacent to bathroom (bathroom ends at x=28)
      grid_y: 15,
      level: 1,
      width_ft: 12,
      length_ft: 12,
      floor_material: "carpet"
    }
  ],
  openings: [
    {
      id: "living_to_kitchen",
      type: "door",
      connecting: ["living_room", "kitchen"],
      width_mm: 900,
      height_mm: 2100
    },
    {
      id: "kitchen_to_hallway",
      type: "door",
      connecting: ["kitchen", "hallway"],
      width_mm: 900,
      height_mm: 2100
    },
    {
      id: "hallway_to_bathroom",
      type: "door",
      connecting: ["hallway", "bathroom"],
      width_mm: 760,
      height_mm: 2100
    },
    {
      id: "bathroom_to_bedroom",
      type: "door",
      connecting: ["bathroom", "bedroom"],
      width_mm: 760,
      height_mm: 2100
    }
  ],
  construction_notes: "Test floor plan for door placement verification"
};

console.log("🧪 Testing Door Placement Fix...\n");
console.log("Test Configuration:");
console.log(`- Interior wall thickness: ${testFloorPlan.interior_wall_thickness_mm}mm`);
console.log(`- Number of rooms: ${testFloorPlan.rooms.length}`);
console.log(`- Number of openings: ${testFloorPlan.openings.length}\n`);

try {
  const geometry = generateFloorPlanGeometry(testFloorPlan);
  
  console.log("✅ Geometry generation successful!\n");
  console.log("Results:");
  console.log(`- Rooms placed: ${geometry.rooms.length}`);
  console.log(`- Walls generated: ${geometry.walls.length}`);
  console.log(`- Openings placed: ${geometry.openings.length}/${testFloorPlan.openings.length}\n`);
  
  if (geometry.openings.length === testFloorPlan.openings.length) {
    console.log("✅ SUCCESS: All doors were placed correctly!");
    console.log("\nDoor Details:");
    geometry.openings.forEach(opening => {
      console.log(`  - ${opening.room1} <-> ${opening.room2}`);
      console.log(`    Position: (${Math.round(opening.x)}mm, ${Math.round(opening.y)}mm)`);
      console.log(`    Angle: ${opening.angle}°`);
      console.log(`    Width: ${opening.width}mm\n`);
    });
  } else {
    console.log("❌ FAILURE: Some doors were not placed!");
    console.log(`Expected: ${testFloorPlan.openings.length}, Got: ${geometry.openings.length}`);
    
    const placedConnections = new Set(
      geometry.openings.map(o => `${o.room1}-${o.room2}`)
    );
    
    console.log("\nMissing doors:");
    testFloorPlan.openings.forEach(opening => {
      const key = `${opening.connecting[0]}-${opening.connecting[1]}`;
      if (!placedConnections.has(key)) {
        console.log(`  ❌ ${opening.connecting[0]} <-> ${opening.connecting[1]}`);
      }
    });
  }
  
} catch (error) {
  console.error("❌ ERROR during geometry generation:");
  console.error(error);
  process.exit(1);
}
