# Use a Bun-Native Toolchain Without Vite, Webpack, or Node.js

We use Bun exclusively for dependency management, bundling, and serving—relying on `Bun.serve()` with Bun's native HTML route bundler for fast local development and `build.ts` (`Bun.build()` + Tailwind) for static production output—instead of Vite, Webpack, or Node.js. This keeps the runtime and build stack single-tool and minimal, at the cost of foregoing Vite's plugin ecosystem.
