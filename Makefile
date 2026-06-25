# Screenshot generation for README and blog articles.
#   make screenshots        — capture both front-ends
#   make screenshots-web    — Eleventy site via Playwright
#   make screenshots-tui    — SSH TUI via VHS
#
# Host prerequisites (local-only; not part of CI/deploy):
#   web → npx playwright install chromium
#   tui → vhs (with its ttyd + ffmpeg deps), go
.PHONY: screenshots screenshots-web screenshots-tui

screenshots: screenshots-web screenshots-tui

screenshots-web:
	cd web && npm run build && npm run screenshot

screenshots-tui:
	./scripts/screenshot-tui.sh
