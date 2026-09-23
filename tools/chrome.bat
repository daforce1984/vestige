@echo off
REM Visible debug Chrome for the Homeworld x Gundam WebGPU film (dedicated profile, single test tab).
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\chrome_automation\homeworld_film" --remote-debugging-port=9011 --remote-allow-origins=* --disable-backgrounding-occluded-windows --disable-background-timer-throttling --disable-renderer-backgrounding --autoplay-policy=no-user-gesture-required --window-size=1600,1000 about:blank
