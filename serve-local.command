#!/bin/bash
# Beacon — local test server launcher (Mac)
# Double-click to start a local web server and open Beacon in your browser.
# Leave the Terminal window open while testing; close it to stop the server.
cd "$(dirname "$0")"
echo "Starting Beacon local server at http://localhost:8000 ..."
echo "Leave this window open while testing. Close it to stop."
# Open the browser after a short delay so the server is up
( sleep 1 && open "http://localhost:8000" ) &
python3 -m http.server 8000
