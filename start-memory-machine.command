#!/bin/bash
# Memory Machine launcher — double-click or open from Automator
# Runs in Terminal with full shell environment (nvm, etc.)

cd "$(dirname "$0")"

# If server already running, just open browser
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  open "http://localhost:3000"
  exit 0
fi

# Kill any stuck process on 3000
pid=$(lsof -ti :3000 2>/dev/null)
[ -n "$pid" ] && kill -9 $pid 2>/dev/null
sleep 2

echo "Starting Memory Machine v3..."
npm run dev &
# Wait for server to be ready
for i in {1..15}; do
  sleep 2
  lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 && break
done
open "http://localhost:3000"
wait
