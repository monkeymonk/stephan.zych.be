# VHS tape — capture the SSH TUI to stills. Driven by scripts/screenshot-tui.sh,
# which builds ./tui/tui first and runs this from the repo root. Outputs raw PNGs
# into .vhs-tmp/; the wrapper converts them to WebP and routes them to the two
# asset buckets. Docs: https://github.com/charmbracelet/vhs
Output .vhs-tmp/_discard.gif

Set Shell "bash"
Set FontSize 15
Set Width 1280
Set Height 820
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 0

# Launch the TUI straight in the terminal (no SSH); content/ is at the repo root.
Hide
Type "CONTENT_DIR=content ./tui/tui -local"
Enter
Sleep 3s
Show
Sleep 500ms
Screenshot .vhs-tmp/tui-home.png

# Jump to the blog list (global nav key) and capture the feed.
Type "b"
Sleep 1s
Screenshot .vhs-tmp/tui-blog.png

# Open the top post and capture the Glamour-rendered reader.
Enter
Sleep 1500ms
Screenshot .vhs-tmp/tui-reader.png
