// MathJax 3 self-hosted component bundles (under `mathjax/es5/`) are IIFE scripts with no type
// declarations — importing them only triggers a side effect (they read `window.MathJax` config and
// attach the typesetting API to it). These ambient declarations satisfy the type checker for the
// lazy dynamic imports in `src/components/math/render-math.ts` without pulling in `any`.
declare module 'mathjax/es5/tex-mml-chtml.js';
declare module 'mathjax/es5/input/asciimath.js';
