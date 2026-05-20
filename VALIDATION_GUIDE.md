# ArchDraft Universal - Validation System Guide

## Overview

ArchDraft Universal implements a comprehensive spatial validation system that enforces geometric constraints and architectural rules before DXF compilation. This ensures mathematically sound, structurally valid floor plans.

---

## Validation Rules

### 1. Room Overlap Detection

**Rule:** Rooms on the same level must not occupy overlapping space.

**Mathematical Condition:**
```
Overlap = (X₁,min < X₂,max ∧ X₁,max > X₂,min) ∧ (Y₁,min < Y₂,max ∧ Y₁,max > Y₂,min)
```

**Example Error:**
```
Room overlap detected on Level 1: "Master Bedroom" and "Living Room" occupy the same space. 
Rooms on the same level must not overlap.
```

**How to Fix:**
- Adjust `grid_x`, `grid_y`, `width_ft`, or `length_ft` to eliminate overlap
- Ensure rooms are placed adjacent, not overlapping
- Use the grid coordinate system correctly (0,0 is top-left)

---

### 2. Footprint Area Consistency

**Rule:** Sum of room areas must match declared footprint area within ±10% tolerance.

**Mathematical Condition:**
```
|Σ(room_width × room_length) - total_area_sqft_calculated| ≤ total_area_sqft_calculated × 0.1
```

**Example Error:**
```
Footprint area mismatch: Declared 1500 sq ft, but sum of room areas is 1650.5 sq ft. 
Difference of 150.5 sq ft exceeds 10% tolerance.
```

**How to Fix:**
- Recalculate `footprint_dimensions.total_area_sqft_calculated`
- Adjust room dimensions to match target area
- Account for hallways, closets, and utility spaces

---

### 3. Window-to-Exterior Enforcement

**Rule:** Windows must connect an interior room to "exterior". Windows cannot connect two interior rooms.

**Example Error:**
```
Window "bedroom_2_window" connects two interior rooms ("bedroom_2" and "hallway"). 
Windows must connect to "exterior".
```

**How to Fix:**
```json
// ❌ WRONG
{
  "type": "window",
  "connecting": ["bedroom_2", "hallway"]
}

// ✅ CORRECT
{
  "type": "window",
  "connecting": ["bedroom_2", "exterior"]
}
```

---

### 4. Opening Adjacency Validation

**Rule:** Interior openings (doors) should connect rooms that share a wall.

**Severity:** Warning (not blocking)

**Example Warning:**
```
Opening "door_1" connects non-adjacent rooms "Kitchen" and "Garage". 
Rooms must share a wall to have a connecting opening.
```

**How to Fix:**
- Ensure rooms are placed adjacent (share an edge)
- Check grid coordinates for proper alignment
- Tolerance: `interior_wall_thickness × 0.5 + 50mm`

---

### 5. Minimum Room Dimensions

**Rule:** Rooms must be at least 3 feet in both width and length.

**Example Error:**
```
Room "Closet" has dimensions 2' × 4'. Minimum dimension is 3 feet.
```

**How to Fix:**
```json
// ❌ WRONG
{
  "width_ft": 2,
  "length_ft": 4
}

// ✅ CORRECT
{
  "width_ft": 3,
  "length_ft": 4
}
```

---

### 6. Duplicate ID Detection

**Rule:** Each room and opening must have a unique identifier.

**Example Error:**
```
Duplicate room ID "bedroom_1". Each room must have a unique identifier.
```

**How to Fix:**
- Use unique snake_case IDs: `bedroom_1`, `bedroom_2`, `bedroom_3`
- Use descriptive IDs: `master_bedroom`, `guest_bedroom_1`

---

## Validation Flow

```
User Pastes JSON
      ↓
Zod Schema Parse
      ↓
.superRefine() Triggered
      ↓
validateFloorPlan()
      ↓
┌─────────────────────────┐
│ 1. Room Collisions      │
│ 2. Area Consistency     │
│ 3. Opening Constraints  │
│ 4. Minimum Dimensions   │
│ 5. Duplicate IDs        │
└─────────────────────────┘
      ↓
Errors Found? ──Yes──> Return 400 with formatted errors
      │
      No
      ↓
Generate Geometry
      ↓
Return Preview/DXF
```

---

## Error Severity Levels

### ERROR (Blocking)
- Room overlaps
- Area mismatch >10%
- Windows connecting interior rooms
- Minimum dimension violations
- Duplicate IDs
- Non-existent room references

**Result:** Validation fails, no DXF generated

### WARNING (Non-blocking)
- Non-adjacent room connections
- Unusual room proportions

**Result:** Validation passes, warnings logged

---

## Testing Validation

### Test Case 1: Overlapping Rooms
```json
{
  "rooms": [
    {
      "id": "room_1",
      "grid_x": 0,
      "grid_y": 0,
      "width_ft": 10,
      "length_ft": 10
    },
    {
      "id": "room_2",
      "grid_x": 5,
      "grid_y": 5,
      "width_ft": 10,
      "length_ft": 10
    }
  ]
}
```
**Expected:** ERROR - Room overlap detected

---

### Test Case 2: Window Between Interior Rooms
```json
{
  "openings": [
    {
      "id": "bad_window",
      "type": "window",
      "connecting": ["bedroom", "hallway"],
      "width_mm": 1200
    }
  ]
}
```
**Expected:** ERROR - Windows must connect to exterior

---

### Test Case 3: Area Mismatch
```json
{
  "footprint_dimensions": {
    "total_area_sqft_calculated": 1000
  },
  "rooms": [
    // Sum of room areas = 1200 sq ft
  ]
}
```
**Expected:** ERROR - Area difference exceeds 10% tolerance

---

## Dynamic Tolerances

### Interior Wall Placement
```typescript
tolerance = interior_wall_thickness_mm × 0.5
// Default: 120mm × 0.5 = 60mm
```

### Exterior Wall Placement
```typescript
tolerance = exterior_wall_thickness_mm × 0.5
// Default: 250mm × 0.5 = 125mm
```

### Room Adjacency Check
```typescript
tolerance = interior_wall_thickness_mm + 50mm
// Default: 120mm + 50mm = 170mm
```

---

## Best Practices

1. **Start with a Grid Sketch**
   - Draw your floor plan on graph paper (1 square = 1 foot)
   - Mark room positions with (x, y) coordinates
   - Ensure no overlaps visually

2. **Calculate Areas First**
   - Sum all room areas before setting footprint
   - Include hallways, closets, and utility spaces
   - Add 5-10% buffer for walls

3. **Place Rooms Adjacently**
   - If Kitchen ends at x=15, Living Room should start at x=15
   - No gaps between interior rooms (unless intentional courtyard)
   - Use hallways to connect distant spaces

4. **Windows Only to Exterior**
   - Never connect two interior rooms with a window
   - Use doors, archways, or pocket doors for interior connections

5. **Use Descriptive IDs**
   - `master_bedroom` not `room_1`
   - `front_door` not `opening_1`
   - `kitchen_window_1` not `window_1`

---

## Debugging Tips

### Error: "Room overlap detected"
1. Print room coordinates and dimensions
2. Visualize on graph paper
3. Check for copy-paste errors in coordinates

### Error: "Area mismatch"
1. Calculate sum of room areas manually
2. Compare to declared footprint
3. Check for missing rooms (hallways, closets)

### Error: "Non-adjacent rooms"
1. Check if rooms share an edge
2. Verify grid coordinates align
3. Ensure rooms are on the same level

---

## API Error Response Format

```json
{
  "error": "Validation failed on AI JSON output",
  "message": "rooms: Room overlap detected on Level 1: \"Master Bedroom\" and \"Living Room\" occupy the same space. Rooms on the same level must not overlap.\nopenings.window_1: Window \"window_1\" connects two interior rooms (\"bedroom_2\" and \"hallway\"). Windows must connect to \"exterior\".",
  "details": {
    "rooms": ["Room overlap detected..."],
    "openings": {
      "window_1": ["Window connects two interior rooms..."]
    }
  }
}
```

---

## Validation Utilities

### geometry-utils.ts
- `detectOverlap()` - AABB collision detection
- `detectRoomCollisions()` - Multi-level collision detection
- `calculateTotalRoomArea()` - Area summation
- `areRoomsAdjacent()` - Edge-sharing detection

### validators.ts
- `validateFloorPlan()` - Comprehensive validation
- `formatValidationErrors()` - User-friendly formatting

---

## Future Enhancements

- [ ] Stairwell validation (must exist on all levels)
- [ ] Load-bearing wall detection
- [ ] Plumbing stack alignment (bathrooms/kitchens)
- [ ] Minimum hallway width enforcement
- [ ] Door swing clearance validation
- [ ] Window placement height validation

---

**For questions or issues, refer to the main documentation or open an issue on GitHub.**
