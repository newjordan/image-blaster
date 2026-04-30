#!/bin/bash
# Runs at session start. Stdout is injected into Claude's context.

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || cd "$(dirname "$0")/../.."

# --- .env checks ---
if [ ! -f .env ]; then
  echo "⚠️  .env missing — copy .env.example to .env and fill in required keys."
else
  grep -q "^WORLD_LABS_API_KEY=." .env || echo "⚠️  WORLD_LABS_API_KEY not set in .env"
  grep -q "^FAL_KEY=." .env           || echo "⚠️  FAL_KEY not set in .env"
fi

# --- worlds/ status ---
if [ -d worlds ] && [ "$(ls worlds/ 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
  WORLD_LIST=$(ls worlds/)
  echo "Worlds available: $(echo "$WORLD_LIST" | wc -l | tr -d ' ') — $(echo "$WORLD_LIST" | tr '\n' ' ')"
else
  echo "No worlds yet. Use /create-world to generate one."
fi

# --- input/ staging ---
if [ -d input ]; then
  FILES=$(ls input/ 2>/dev/null | grep -v '^$' | tr '\n' ' ')
  [ -n "$FILES" ] && echo "Staged in input/: $FILES"
fi

exit 0
