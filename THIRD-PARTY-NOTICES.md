# Third-party notices

Notcha's own source code is MIT licensed (see [LICENSE](LICENSE)). The components
below ship inside release builds and keep their own terms.

## ffmpeg

The Shelf's file converter runs a bundled ffmpeg binary. In a packaged build it lives at
`resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe`.

- Installed from: [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static)
- Binary licence: **GNU General Public License v3.0** — the build includes `libx264`
- ffmpeg source and build instructions: <https://ffmpeg.org/download.html>
- Windows build artefacts: <https://github.com/BtbN/FFmpeg-Builds>

If you redistribute a Notcha installer or the unpacked app, ship this notice together
with a copy of the GPLv3 text and a way to obtain the corresponding ffmpeg source. The
full text of the licence is in `node_modules/ffmpeg-static/LICENSE` after `npm install`.
