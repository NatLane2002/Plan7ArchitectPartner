# 🎨 ArchDraft Universal - Design System Reference

## Color Palette

### Background Scale (OLED Dark Mode)
```css
#0A0A0A  /* App background - Pure OLED black */
#0d0d0d  /* Sidebar panels */
#09090b  /* Input fields, cards */
#000000  /* Canvas background - Absolute black */
```

### Border Scale
```css
#18181b  /* Primary borders (zinc-900) */
#27272a  /* Secondary borders (zinc-800) */
```

### Text Scale
```css
#fafafa  /* Primary text (zinc-50) */
#a1a1aa  /* Secondary text (zinc-400) */
#71717a  /* Muted text (zinc-500) */
#52525b  /* Disabled text (zinc-600) */
```

### Accent Colors
```css
#6366f1  /* Primary - Indigo 500 */
#818cf8  /* Primary hover - Indigo 400 */
#8b5cf6  /* Secondary - Purple 600 */
#10b981  /* Success - Emerald 500 */
#22d3ee  /* Info - Cyan 400 */
#f59e0b  /* Warning - Amber 500 */
#ef4444  /* Error - Red 500 */
#a855f7  /* Accent - Purple 500 */
```

---

## Typography

### Font Families
```css
Primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
Monospace: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace
```

### Type Scale
```css
/* Headers */
.section-title: 11px, 600 weight, uppercase, 0.08em tracking
.canvas-title: 11px, 600 weight, uppercase, 0.08em tracking
.inspector-title: 10px, 600 weight, uppercase, 0.1em tracking

/* Body */
.workflow-textarea: 13px, 1.5 line-height
.room-name: 13px, 500 weight
.data-row: 13px

/* Small */
.workflow-hint: 11px
.room-metric-value: 11px, monospace, 600 weight
.workflow-textarea-code: 11px, monospace, 1.6 line-height

/* Micro */
.inspector-badge: 9px, 700 weight, monospace
.layer-tag: 9px, monospace
.level-label: 9px, 700 weight, 0.12em tracking
```

---

## Spacing System

### Layout
```css
Header height: 56px
Canvas header: 48px
Sidebar left: 320px
Sidebar right: 280px
```

### Internal Spacing
```css
Section padding: 16px
Section gap: 12px, 16px
Card padding: 10px 12px
Button padding: 10px 16px (workflow), 14px 20px (download)
```

### Border Radius
```css
Large: 12px (modals, sections)
Medium: 8px (cards, inputs)
Small: 6px (buttons, tags)
Micro: 4px (badges, step indicators)
```

---

## Component Patterns

### Step Badges
```css
.step-badge-1: rgba(99, 102, 241, 0.15) bg, #818cf8 text
.step-badge-2: rgba(34, 211, 238, 0.15) bg, #22d3ee text
.step-badge-3: rgba(16, 185, 129, 0.15) bg, #10b981 text
```

### Status Badges
```css
.status-badge-idle: rgba(113, 113, 122, 0.1) bg, #71717a text
.status-badge-working: rgba(99, 102, 241, 0.1) bg, #818cf8 text, pulse animation
.status-badge-done: rgba(16, 185, 129, 0.1) bg, #10b981 text
.status-badge-error: rgba(239, 68, 68, 0.1) bg, #ef4444 text
```

### Buttons
```css
Primary: linear-gradient(135deg, #6366f1, #8b5cf6)
Primary hover: linear-gradient(135deg, #818cf8, #a78bfa) + lift
Secondary: transparent bg, #27272a border, #a1a1aa text
Secondary hover: #6366f1 border, rgba(99, 102, 241, 0.05) bg
```

---

## Effects & Animations

### Glassmorphism
```css
backdrop-filter: blur(8px-12px)
background: rgba(10, 10, 10, 0.6-0.8)
border: 1px solid #18181b
```

### Ambient Glows
```css
Orb 1: #6366f1, 500px, blur(120px), opacity 0.08
Orb 2: #22d3ee, 500px, blur(120px), opacity 0.08
Float animation: 10s ease-in-out infinite
```

### Dot Matrix Pattern
```css
background-image: radial-gradient(circle, #18181b 1px, transparent 1px)
background-size: 20px 20px
opacity: 0.3
```

### Transitions
```css
Standard: all 0.2s ease
Colors: transition-colors duration-200
Hover lift: transform: translateY(-1px to -2px)
```

### Animations
```css
fadeInUp: 0.4s cubic-bezier(0.4, 0, 0.2, 1)
statusPulse: 2s infinite
pulse-bounce: 1.4s infinite ease-in-out
float: 10s ease-in-out infinite
```

---

## Interaction States

### Focus
```css
border-color: #6366f1
box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1)
```

### Hover (Buttons)
```css
Primary: gradient shift + translateY(-1px) + shadow
Secondary: border color change + subtle bg
Icon buttons: bg-white/5
```

### Disabled
```css
opacity: 0.4-0.5
cursor: not-allowed
transform: none
```

---

## Responsive Breakpoints

```css
@media (max-width: 1280px)
  Sidebars: 280px left, 260px right

@media (max-width: 1024px)
  Layout: Single column stack
  Sidebars: max-height 40vh
  Canvas: Full width between
```

---

## Accessibility

- All interactive elements have focus states
- Color contrast meets WCAG AA standards
- Semantic HTML structure
- ARIA labels on form inputs
- Button type attributes specified
- Keyboard navigation supported

---

## Best Practices

1. **Always use monospace fonts for numerical data**
2. **Uppercase + tracking for section headers**
3. **Subtle borders over heavy shadows**
4. **Glassmorphism for overlays and headers**
5. **Dot matrix pattern for drafting surfaces**
6. **Ambient glows for depth, not decoration**
7. **Animations should be purposeful, not distracting**
8. **Dark canvas (#000) for visual focus areas**

---

**This design system ensures consistency across all future features and components.**
