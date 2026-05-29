# ✅ Multi-Story Building Fix - Duplicate Room ID Resolution

## 🎯 Problem Identified

When generating a **two-story floor plan**, the validation system incorrectly flagged stairwells as duplicate room IDs:

```
Validation Error
rooms.stairwell: Duplicate room ID "stairwell". 
Each room must have a unique identifier.
```

## 🏗️ Root Cause Analysis

### The Architectural Reality

In multi-story buildings, certain rooms **span multiple levels vertically**:
- **Stairwells** connect Level 1 and Level 2
- **Elevator shafts** run through all floors
- **Vertical chases** (plumbing, HVAC) stack vertically

These rooms should have the **same base ID** across levels because they represent the **same architectural element** in 3D space.

### The Old Validation Logic (BROKEN)

```typescript
// OLD CODE - Too strict for multi-story buildings
const roomIds = new Set<string>();
for (const room of plan.rooms) {
  if (roomIds.has(room.id)) {
    errors.push({
      field: `rooms.${room.id}`,
      message: `Duplicate room ID "${room.id}". Each room must have a unique identifier.`,
      severity: "error",
    });
  }
  roomIds.add(room.id);
}
```

**Problem**: This checks for duplicate IDs **globally** across all levels, which is incorrect for multi-story buildings.

### Example Scenario

```json
{
  "rooms": [
    {
      "id": "stairwell",
      "name": "Stairwell",
      "level": 1,
      "grid_x": 10,
      "grid_y": 5,
      "width_ft": 5,
      "length_ft": 8
    },
    {
      "id": "stairwell",
      "name": "Stairwell",
      "level": 2,
      "grid_x": 10,
      "grid_y": 5,
      "width_ft": 5,
      "length_ft": 8
    }
  ]
}
```

**Old Logic**: ❌ "Duplicate room ID 'stairwell'" (WRONG!)
**Correct Logic**: ✅ Same stairwell on two levels (CORRECT!)

---

## ✅ The Solution

### New Level-Aware Validation

```typescript
// NEW CODE - Level-aware duplicate checking
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
```

### Key Improvements

1. **Composite Key System**: `"roomId_L{level}"` (e.g., `"stairwell_L1"`, `"stairwell_L2"`)
2. **Level-Aware Checking**: Only flags duplicates **on the same level**
3. **Vertical Continuity**: Allows the same room ID across different levels
4. **Clear Error Messages**: Specifies which level has the duplicate

---

## 🏗️ How It Works

### Composite Key Generation

```typescript
Room ID: "stairwell"
Level: 1
Composite Key: "stairwell_L1"

Room ID: "stairwell"
Level: 2
Composite Key: "stairwell_L2"

Result: Two unique keys, no conflict ✅
```

### Level-Based Grouping

```typescript
Level 1 Rooms: Set { "living_room", "kitchen", "stairwell" }
Level 2 Rooms: Set { "bedroom_1", "bedroom_2", "stairwell" }

Check: Is "stairwell" duplicate on Level 1? NO ✅
Check: Is "stairwell" duplicate on Level 2? NO ✅
```

---

## 📊 Validation Logic Comparison

### Scenario 1: Valid Multi-Story Stairwell

```json
{
  "rooms": [
    { "id": "stairwell", "level": 1 },
    { "id": "stairwell", "level": 2 }
  ]
}
```

| Logic | Result | Reason |
|-------|--------|--------|
| **Old** | ❌ Error | Global duplicate check |
| **New** | ✅ Valid | Different levels allowed |

---

### Scenario 2: Invalid Duplicate on Same Level

```json
{
  "rooms": [
    { "id": "bedroom", "level": 1 },
    { "id": "bedroom", "level": 1 }
  ]
}
```

| Logic | Result | Reason |
|-------|--------|--------|
| **Old** | ❌ Error | Duplicate detected |
| **New** | ❌ Error | Duplicate on same level |

**Both correctly flag this as an error** ✅

---

### Scenario 3: Multiple Rooms Across Levels

```json
{
  "rooms": [
    { "id": "living_room", "level": 1 },
    { "id": "bedroom_1", "level": 2 },
    { "id": "bedroom_2", "level": 2 },
    { "id": "stairwell", "level": 1 },
    { "id": "stairwell", "level": 2 }
  ]
}
```

| Room | Level | Old Logic | New Logic |
|------|-------|-----------|-----------|
| living_room | 1 | ✅ Valid | ✅ Valid |
| bedroom_1 | 2 | ✅ Valid | ✅ Valid |
| bedroom_2 | 2 | ✅ Valid | ✅ Valid |
| stairwell | 1 | ✅ Valid | ✅ Valid |
| stairwell | 2 | ❌ Error | ✅ Valid |

**New logic correctly handles multi-story buildings** ✅

---

## 🔧 Additional Fix: Room Map Enhancement

### The Problem

The `roomMap` used for opening validation also needed updating to handle multi-level rooms:

```typescript
// OLD CODE - Single-level map
const roomMap = new Map(plan.rooms.map((r) => [r.id, r]));
```

**Issue**: If two rooms have the same ID on different levels, the map would only store the last one.

### The Solution

```typescript
// NEW CODE - Multi-level aware map
const roomMap = new Map<string, Room>();
for (const room of plan.rooms) {
  const level = room.level || 1;
  const compositeKey = `${room.id}_L${level}`;
  roomMap.set(compositeKey, room);
  // Also keep the simple ID for backward compatibility
  if (!roomMap.has(room.id)) {
    roomMap.set(room.id, room);
  }
}
```

**Benefits**:
1. Stores rooms with composite keys (`"stairwell_L1"`, `"stairwell_L2"`)
2. Maintains backward compatibility with simple IDs
3. Allows opening validation to work correctly across levels

---

## 🎯 Real-World Use Cases

### Use Case 1: Two-Story House with Stairwell

```json
{
  "stories": 2,
  "rooms": [
    // Level 1
    { "id": "entry", "level": 1 },
    { "id": "living_room", "level": 1 },
    { "id": "kitchen", "level": 1 },
    { "id": "stairwell", "level": 1, "grid_x": 15, "grid_y": 10 },
    
    // Level 2
    { "id": "master_bedroom", "level": 2 },
    { "id": "bedroom_2", "level": 2 },
    { "id": "stairwell", "level": 2, "grid_x": 15, "grid_y": 10 }
  ]
}
```

**Result**: ✅ **VALID** - Stairwell correctly spans both levels

---

### Use Case 2: Three-Story Building with Elevator

```json
{
  "stories": 3,
  "rooms": [
    { "id": "elevator_shaft", "level": 1, "grid_x": 5, "grid_y": 5 },
    { "id": "elevator_shaft", "level": 2, "grid_x": 5, "grid_y": 5 },
    { "id": "elevator_shaft", "level": 3, "grid_x": 5, "grid_y": 5 }
  ]
}
```

**Result**: ✅ **VALID** - Elevator shaft correctly spans all three levels

---

### Use Case 3: Invalid - Duplicate Bedroom on Same Level

```json
{
  "stories": 2,
  "rooms": [
    { "id": "bedroom", "level": 2, "grid_x": 0, "grid_y": 0 },
    { "id": "bedroom", "level": 2, "grid_x": 10, "grid_y": 0 }
  ]
}
```

**Result**: ❌ **ERROR** - "Duplicate room ID 'bedroom' on Level 2"

---

## 📐 Architectural Correctness

### Why This Matters

In real architecture:
1. **Stairwells** must align vertically across floors
2. **Elevator shafts** run through all levels
3. **Vertical chases** (plumbing, HVAC) stack perfectly
4. **Load-bearing columns** align vertically

### The Grid Alignment Rule

For vertical continuity, rooms with the same ID across levels **should** have:
- ✅ Same `grid_x` coordinate
- ✅ Same `grid_y` coordinate
- ✅ Same `width_ft` dimension
- ✅ Same `length_ft` dimension

**Example**:
```json
{
  "id": "stairwell",
  "level": 1,
  "grid_x": 10,
  "grid_y": 5,
  "width_ft": 5,
  "length_ft": 8
}

{
  "id": "stairwell",
  "level": 2,
  "grid_x": 10,  // ✅ Same X
  "grid_y": 5,   // ✅ Same Y
  "width_ft": 5, // ✅ Same width
  "length_ft": 8 // ✅ Same length
}
```

**Result**: Perfect vertical alignment in 3D space ✅

---

## 🧪 Testing Scenarios

### Test 1: Single-Story Building (Backward Compatibility)

```json
{ "stories": 1, "rooms": [
  { "id": "living_room", "level": 1 },
  { "id": "kitchen", "level": 1 }
]}
```

**Expected**: ✅ Valid (no changes to single-story behavior)

---

### Test 2: Two-Story with Stairwell

```json
{ "stories": 2, "rooms": [
  { "id": "stairwell", "level": 1 },
  { "id": "stairwell", "level": 2 }
]}
```

**Expected**: ✅ Valid (stairwell spans both levels)

---

### Test 3: Duplicate on Same Level

```json
{ "stories": 2, "rooms": [
  { "id": "bedroom", "level": 2 },
  { "id": "bedroom", "level": 2 }
]}
```

**Expected**: ❌ Error - "Duplicate room ID 'bedroom' on Level 2"

---

### Test 4: Complex Multi-Story

```json
{ "stories": 2, "rooms": [
  { "id": "living_room", "level": 1 },
  { "id": "kitchen", "level": 1 },
  { "id": "stairwell", "level": 1 },
  { "id": "master_bedroom", "level": 2 },
  { "id": "bedroom_2", "level": 2 },
  { "id": "stairwell", "level": 2 }
]}
```

**Expected**: ✅ Valid (all rooms unique per level, stairwell spans both)

---

## 📁 Files Modified

1. ✅ `src/lib/validators.ts` - Level-aware duplicate checking + room map enhancement

---

## 🎯 Impact

### Before Fix
- ❌ Two-story buildings rejected
- ❌ Stairwells flagged as duplicates
- ❌ Multi-story validation broken

### After Fix
- ✅ Two-story buildings accepted
- ✅ Stairwells correctly validated
- ✅ Multi-story validation working
- ✅ Backward compatible with single-story

---

## 💡 Key Takeaways

1. **Architectural Correctness**: Vertical rooms (stairwells, elevators) should have the same ID across levels
2. **Level-Aware Validation**: Check for duplicates **per level**, not globally
3. **Composite Keys**: Use `"roomId_L{level}"` for internal tracking
4. **Backward Compatibility**: Single-story buildings work exactly as before
5. **Clear Error Messages**: Specify which level has the duplicate

---

**Status**: ✅ **FIXED AND TESTED**

**Build Status**: ✅ No TypeScript errors

**Multi-Story Support**: ✅ Fully functional

**Ready for Use**: ✅ Yes - Paste your two-story JSON again!
