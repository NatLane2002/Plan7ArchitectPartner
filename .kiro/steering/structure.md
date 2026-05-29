# Project Structure

> **Note:** This project is in its initial setup phase. Update this file as the folder structure is established.

## Current State

No source files exist yet. The structure below is a recommended starting point for an architecture drafting application.

## Recommended Structure

```
ArchDraftUniversal/
├── .kiro/                  # Kiro AI assistant configuration
│   └── steering/           # AI steering rules (product, tech, structure)
├── src/                    # Application source code
│   ├── components/         # Reusable UI components
│   ├── features/           # Feature-specific modules (canvas, toolbar, etc.)
│   ├── models/             # Data models and types
│   ├── services/           # Business logic and external integrations
│   ├── store/              # State management
│   ├── utils/              # Shared utility functions
│   └── main.ts             # Application entry point
├── tests/                  # Test files (mirror src/ structure)
├── public/                 # Static assets
├── docs/                   # Project documentation
└── package.json            # Project manifest (or equivalent)
```

## Conventions

- Mirror `src/` structure inside `tests/` — test files live alongside or parallel to the code they test
- Feature modules in `src/features/` are self-contained: each owns its components, logic, and types
- Shared types and interfaces go in `src/models/`
- No business logic in UI components — delegate to `src/services/` or `src/store/`

> Update this file to reflect the actual structure once source files are added.
