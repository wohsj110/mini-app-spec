# Export settings: watermark toggle

## Background

Users report that exported images are forcibly stamped with the app watermark; professional users need watermark-free exports when delivering to clients.

## Requirements

1. Add an "Export watermark" toggle to the "Export settings" page, default on.
2. With the toggle off, exported images no longer get the watermark overlay; on keeps the current behavior.
3. The toggle state is remembered across sessions (kill the process, reopen the app, last choice persists).
4. No design mock yet; visuals follow the existing toggle style on the export settings page.

## Acceptance criteria

- Export with the toggle off → the final image has no watermark.
- Restart the app → the toggle keeps the last choice.
