#!/bin/sh
set -e

# Start Express API + Socket.IO on port 3001
node server/dist/index.js &

# Serve React static files on port 5173
serve -s client/dist -l 5173
