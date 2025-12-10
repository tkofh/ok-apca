# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ok-apca - A TypeScript library that generates static CSS for gamut-mapped OKLCH colors with APCA-based contrast colors. The CSS runs without JavaScript; all computation is done at build time.

## Architecture

This is a turborepo monorepo using pnpm workspaces:

- `packages/ok-apca` - The main library package

### How It Works

Given a fixed hue, the library:
1. Computes the sRGB gamut boundary using color.js (finds L_max and C_peak)
2. Pre-computes Y-conversion coefficients for APCA contrast calculations
3. Generates CSS that accepts `--lightness` and `--chroma` as runtime inputs
4. Optionally generates contrast color logic using APCA and Cardano's formula

## Development Commands

```bash
pnpm install      # Install dependencies
pnpm build        # Build all packages
pnpm test         # Run tests
pnpm check        # Lint with biome
pnpm check:fix    # Auto-fix lint issues
pnpm format       # Format code
```

## Tech Stack

- **Package Manager**: pnpm with workspaces
- **Monorepo**: Turborepo
- **Linting/Formatting**: Biome (aggressive config)
- **Testing**: Vitest
- **Building**: tsdown
- **Color Math**: colorjs.io

## Code Style

- Biome enforces strict linting rules (see `biome.json`)
- No default exports (except config files)
- Named exports only
- Tabs for indentation
- Single quotes for strings
- No semicolons (ASI)
- Use `.ts` extensions in all imports

## Workflow Rules

- After modifying `biome.json`, always run `pnpm check:fix` before proceeding with other work to ensure all files are updated with the new rules/formatting
