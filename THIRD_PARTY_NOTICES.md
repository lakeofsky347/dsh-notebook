# Third-party notices

## DeepSeek Harness running whale

The activity indicator in `src/client.js` includes the APNG animation and adapts the static SVG path and mask presentation from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), copyright (c) 2026 DeepSeek, under the MIT License below.

Source revision: `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`.

Source files:

- `packages/client/ui-chat/src/client/assets/running-whale@2x.png`
- `packages/client/ui-chat/src/client/chat/RunningWhaleTail.tsx`
- `packages/client/ui-chat/src/client/chat/ChatView.module.css`

The unmodified animation is embedded as a data URL so the notebook client works through the host module loader without a separate asset route. It is 28 × 28 pixels, 60 frames over 3 seconds, with SHA-256 `0fd990d118113d19af7af4480f2b55d610b103451a08be6f7bf5a146823f8bd3`. The same animation is included in the installed `@deepseek-ai/dsh-client-ui-chat` version `0.2.2-rc.3`.

Notebook-specific changes: React element creation, scoped CSS classes, the fixed indicator slot, accessible busy announcements, and the user motion preference. The native current-color mask and static SVG fallback are preserved for reduced motion, forced colors, and unsupported masks.

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
