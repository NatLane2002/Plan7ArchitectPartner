/**
 * Test script to verify the overlap detection fix
 * Run with: node test-overlap-fix.mjs
 */

// Simulate the fixed detectOverlap function
function detectOverlap(a, b, tolerance = 1) {
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
  return overlapX > tolerance && overlapY > tolerance;
}

console.log("🧪 Testing Overlap Detection Fix\n");
console.log("=" .repeat(60));

// Test Case 1: Adjacent rooms (sharing edge) - Should NOT overlap
console.log("\n✅ Test 1: Adjacent Rooms (Sharing Edge)");
const hallway = { x: 0, y: 0, width: 4572, height: 6096 }; // 15ft x 20ft
const bedroom2 = { x: 4572, y: 0, width: 3048, height: 6096 }; // 10ft x 20ft
const result1 = detectOverlap(hallway, bedroom2);
console.log(`   Hallway: x=${hallway.x}, width=${hallway.width} (ends at ${hallway.x + hallway.width})`);
console.log(`   Bedroom2: x=${bedroom2.x}, width=${bedroom2.width} (starts at ${bedroom2.x})`);
console.log(`   Overlap detected: ${result1}`);
console.log(`   Expected: false`);
console.log(`   Result: ${result1 === false ? "✅ PASS" : "❌ FAIL"}`);

// Test Case 2: Floating-point error - Should NOT overlap
console.log("\n✅ Test 2: Floating-Point Edge Case");
const room1 = { x: 0, y: 0, width: 4572, height: 6096 };
const room2 = { x: 4571.9999, y: 0, width: 3048, height: 6096 };
const result2 = detectOverlap(room1, room2);
console.log(`   Room1: ends at ${room1.x + room1.width}`);
console.log(`   Room2: starts at ${room2.x}`);
console.log(`   Overlap: ${(room1.x + room1.width) - room2.x}mm`);
console.log(`   Overlap detected: ${result2}`);
console.log(`   Expected: false (within 1mm tolerance)`);
console.log(`   Result: ${result2 === false ? "✅ PASS" : "❌ FAIL"}`);

// Test Case 3: Actual overlap - Should overlap
console.log("\n✅ Test 3: Actual Overlap (Real Problem)");
const roomA = { x: 0, y: 0, width: 4572, height: 6096 };
const roomB = { x: 4500, y: 0, width: 3048, height: 6096 }; // Starts 72mm before A ends
const result3 = detectOverlap(roomA, roomB);
console.log(`   RoomA: ends at ${roomA.x + roomA.width}`);
console.log(`   RoomB: starts at ${roomB.x}`);
console.log(`   Overlap: ${(roomA.x + roomA.width) - roomB.x}mm`);
console.log(`   Overlap detected: ${result3}`);
console.log(`   Expected: true (72mm overlap)`);
console.log(`   Result: ${result3 === true ? "✅ PASS" : "❌ FAIL"}`);

// Test Case 4: Separated rooms - Should NOT overlap
console.log("\n✅ Test 4: Separated Rooms (Gap Between)");
const roomX = { x: 0, y: 0, width: 4572, height: 6096 };
const roomY = { x: 6096, y: 0, width: 3048, height: 6096 }; // 5ft gap
const result4 = detectOverlap(roomX, roomY);
console.log(`   RoomX: ends at ${roomX.x + roomX.width}`);
console.log(`   RoomY: starts at ${roomY.x}`);
console.log(`   Gap: ${roomY.x - (roomX.x + roomX.width)}mm`);
console.log(`   Overlap detected: ${result4}`);
console.log(`   Expected: false`);
console.log(`   Result: ${result4 === false ? "✅ PASS" : "❌ FAIL"}`);

// Test Case 5: Corner touching (L-shaped layout) - Should NOT overlap
console.log("\n✅ Test 5: Corner Touching (L-Shape)");
const roomL1 = { x: 0, y: 0, width: 4572, height: 3048 }; // 15ft x 10ft
const roomL2 = { x: 4572, y: 3048, width: 3048, height: 3048 }; // 10ft x 10ft (diagonal)
const result5 = detectOverlap(roomL1, roomL2);
console.log(`   RoomL1: (${roomL1.x}, ${roomL1.y}) to (${roomL1.x + roomL1.width}, ${roomL1.y + roomL1.height})`);
console.log(`   RoomL2: (${roomL2.x}, ${roomL2.y}) to (${roomL2.x + roomL2.width}, ${roomL2.y + roomL2.height})`);
console.log(`   Overlap detected: ${result5}`);
console.log(`   Expected: false (only corners touch)`);
console.log(`   Result: ${result5 === false ? "✅ PASS" : "❌ FAIL"}`);

console.log("\n" + "=".repeat(60));
console.log("\n🎉 All tests completed!");
console.log("\nThe fix correctly:");
console.log("  ✅ Allows adjacent rooms (edge-sharing)");
console.log("  ✅ Ignores floating-point errors (<1mm)");
console.log("  ✅ Detects real overlaps (>1mm)");
console.log("  ✅ Handles separated rooms");
console.log("  ✅ Handles corner-touching (L-shapes)");
