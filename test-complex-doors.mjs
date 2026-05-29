/**
 * Complex test case: Multi-room house with bathrooms, closets, and secondary bedrooms
 * This tests the exact scenario described in the bug report
 */

import { generateFloorPlanGeometry } from './src/lib/bsp-engine.ts';

const complexFloorPlan = {
  project_title: "Complex Multi-Room Test",
  architectural_style: "Modern Farmhouse",
  exterior_wall_thickness_mm: 250,
  interior_wall_thickness_mm: 120,
  stories: 1,
  footprint_dimensions: {
    width: 18288, // 60ft
    length: 12192, // 40ft
    total_area_sqft_calculated: 2400
  },
  rooms: [
    // Main living area
    {
      id: "living_room",
      name: "Living Room",
      room_type: "living_area",
      grid_x: 0,
      grid_y: 0,
      level: 1,
      width_ft: 20,
      length_ft: 18,
      floor_material: "hardwood"
    },
    // Kitchen adjacent to living room
    {
      id: "kitchen",
      name: "Kitchen",
      room_type: "kitchen",
      grid_x: 20,
      grid_y: 0,
      level: 1,
      width_ft: 15,
      length_ft: 12,
      floor_material: "tile"
    },
    // Dining room adjacent to kitchen
    {
      id: "dining_room",
      name: "Dining Room",
      room_type: "dining",
      grid_x: 35,
      grid_y: 0,
      level: 1,
      width_ft: 12,
      length_ft: 12,
      floor_material: "hardwood"
    },
    // Central hallway (extends further left to overlap with bedroom)
    {
      id: "central_hallway",
      name: "Central Hallway",
      room_type: "hallway",
      grid_x: 10,
      grid_y: 12,
      level: 1,
      width_ft: 37,
      length_ft: 4,
      floor_material: "hardwood"
    },
    // Master bedroom (FIXED: Now properly adjacent to hallway at y=16)
    {
      id: "master_bedroom",
      name: "Master Bedroom",
      room_type: "bedroom",
      grid_x: 0,
      grid_y: 16,
      level: 1,
      width_ft: 20,
      length_ft: 16,
      floor_material: "carpet"
    },
    // Master bathroom (CRITICAL TEST: Small bathroom adjacent to bedroom)
    {
      id: "master_bathroom",
      name: "Master Bathroom",
      room_type: "bathroom",
      grid_x: 0,
      grid_y: 32,
      level: 1,
      width_ft: 10,
      length_ft: 8,
      floor_material: "tile"
    },
    // Master closet (CRITICAL TEST: Small closet adjacent to bedroom)
    {
      id: "master_closet",
      name: "Master Closet",
      room_type: "closet",
      grid_x: 10,
      grid_y: 32,
      level: 1,
      width_ft: 10,
      length_ft: 8,
      floor_material: "carpet"
    },
    // Guest bedroom
    {
      id: "guest_bedroom",
      name: "Guest Bedroom",
      room_type: "bedroom",
      grid_x: 24,
      grid_y: 16,
      level: 1,
      width_ft: 12,
      length_ft: 11,
      floor_material: "carpet"
    },
    // Guest bathroom (CRITICAL TEST: Small bathroom off hallway)
    {
      id: "guest_bathroom",
      name: "Guest Bathroom",
      room_type: "bathroom",
      grid_x: 36,
      grid_y: 16,
      level: 1,
      width_ft: 6,
      length_ft: 8,
      floor_material: "tile"
    },
    // Office
    {
      id: "office",
      name: "Home Office",
      room_type: "office",
      grid_x: 42,
      grid_y: 16,
      level: 1,
      width_ft: 10,
      length_ft: 12,
      floor_material: "hardwood"
    },
    // Laundry room (CRITICAL TEST: Small utility room)
    {
      id: "laundry",
      name: "Laundry Room",
      room_type: "utility",
      grid_x: 36,
      grid_y: 24,
      level: 1,
      width_ft: 6,
      length_ft: 8,
      floor_material: "tile"
    }
  ],
  openings: [
    // Main circulation
    {
      id: "living_to_kitchen",
      type: "archway",
      connecting: ["living_room", "kitchen"],
      width_mm: 1200,
      height_mm: 2400
    },
    {
      id: "kitchen_to_dining",
      type: "archway",
      connecting: ["kitchen", "dining_room"],
      width_mm: 1200,
      height_mm: 2400
    },
    {
      id: "kitchen_to_hallway",
      type: "door",
      connecting: ["kitchen", "central_hallway"],
      width_mm: 900,
      height_mm: 2100
    },
    // CRITICAL: Master suite connections
    {
      id: "hallway_to_master",
      type: "door",
      connecting: ["central_hallway", "master_bedroom"],
      width_mm: 900,
      height_mm: 2100
    },
    {
      id: "master_to_bathroom",
      type: "door",
      connecting: ["master_bedroom", "master_bathroom"],
      width_mm: 760,
      height_mm: 2100
    },
    {
      id: "master_to_closet",
      type: "door",
      connecting: ["master_bedroom", "master_closet"],
      width_mm: 760,
      height_mm: 2100
    },
    // CRITICAL: Guest area connections
    {
      id: "hallway_to_guest",
      type: "door",
      connecting: ["central_hallway", "guest_bedroom"],
      width_mm: 900,
      height_mm: 2100
    },
    {
      id: "hallway_to_guest_bath",
      type: "door",
      connecting: ["central_hallway", "guest_bathroom"],
      width_mm: 760,
      height_mm: 2100
    },
    // Office and laundry
    {
      id: "hallway_to_office",
      type: "door",
      connecting: ["central_hallway", "office"],
      width_mm: 900,
      height_mm: 2100
    },
    {
      id: "guest_bath_to_laundry",
      type: "door",
      connecting: ["guest_bathroom", "laundry"],
      width_mm: 760,
      height_mm: 2100
    },
    // Exterior connections
    {
      id: "front_door",
      type: "door",
      connecting: ["living_room", "exterior"],
      width_mm: 1000,
      height_mm: 2400
    },
    {
      id: "living_window",
      type: "window",
      connecting: ["living_room", "exterior"],
      width_mm: 1800,
      height_mm: 1500
    }
  ],
  construction_notes: "Complex test with small bathrooms, closets, and multiple bedrooms"
};

console.log("🧪 Testing Complex Door Placement (Bathrooms, Closets, Secondary Bedrooms)...\n");
console.log("Test Configuration:");
console.log(`- Interior wall thickness: ${complexFloorPlan.interior_wall_thickness_mm}mm`);
console.log(`- Number of rooms: ${complexFloorPlan.rooms.length}`);
console.log(`- Number of openings: ${complexFloorPlan.openings.length}`);
console.log(`- Critical test cases:`);
console.log(`  • Master bedroom → Master bathroom`);
console.log(`  • Master bedroom → Master closet`);
console.log(`  • Central hallway → Guest bathroom`);
console.log(`  • Guest bathroom → Laundry room\n`);

try {
  const geometry = generateFloorPlanGeometry(complexFloorPlan);
  
  console.log("✅ Geometry generation successful!\n");
  console.log("Results:");
  console.log(`- Rooms placed: ${geometry.rooms.length}`);
  console.log(`- Walls generated: ${geometry.walls.length}`);
  console.log(`- Openings placed: ${geometry.openings.length}/${complexFloorPlan.openings.length}\n`);
  
  // Check for critical connections
  const criticalConnections = [
    ["master_bedroom", "master_bathroom"],
    ["master_bedroom", "master_closet"],
    ["central_hallway", "guest_bathroom"],
    ["guest_bathroom", "laundry"]
  ];
  
  const placedMap = new Map();
  geometry.openings.forEach(opening => {
    const key1 = `${opening.room1}-${opening.room2}`;
    const key2 = `${opening.room2}-${opening.room1}`;
    placedMap.set(key1, opening);
    placedMap.set(key2, opening);
  });
  
  let allCriticalPlaced = true;
  console.log("Critical Connection Status:");
  criticalConnections.forEach(([room1, room2]) => {
    const key = `${room1}-${room2}`;
    if (placedMap.has(key)) {
      const opening = placedMap.get(key);
      console.log(`  ✅ ${room1} <-> ${room2}`);
      console.log(`     Position: (${Math.round(opening.x)}mm, ${Math.round(opening.y)}mm), Angle: ${opening.angle}°`);
    } else {
      console.log(`  ❌ ${room1} <-> ${room2} - MISSING!`);
      allCriticalPlaced = false;
    }
  });
  
  console.log();
  
  if (geometry.openings.length === complexFloorPlan.openings.length && allCriticalPlaced) {
    console.log("🎉 SUCCESS: All doors placed correctly, including critical small rooms!");
  } else {
    console.log("❌ FAILURE: Some doors were not placed!");
    
    if (!allCriticalPlaced) {
      console.log("\n⚠️  CRITICAL: Small bathrooms/closets are still inaccessible!");
    }
    
    console.log("\nAll missing doors:");
    complexFloorPlan.openings.forEach(opening => {
      const key = `${opening.connecting[0]}-${opening.connecting[1]}`;
      if (!placedMap.has(key)) {
        console.log(`  ❌ ${opening.connecting[0]} <-> ${opening.connecting[1]}`);
      }
    });
  }
  
} catch (error) {
  console.error("❌ ERROR during geometry generation:");
  console.error(error);
  process.exit(1);
}
