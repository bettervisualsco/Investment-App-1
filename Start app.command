#!/bin/zsh
# Double-click this file to open the Investment Planner on this Mac.
# Keep the Terminal window open while you use the app; close it to stop.
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"
[ -d node_modules ] || npm install
(sleep 2; open "http://localhost:5173") &
npm run dev -- --port 5173
