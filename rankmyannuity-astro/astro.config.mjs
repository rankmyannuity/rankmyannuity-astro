// @ts-check
// Phase 3 Astro config. Added:
//   - rollup-plugin-visualizer in build.rollupOptions for bundle-separation verification
//   - No change to integrations, output, or site
//
// Still static output. Still no SSR. The calculator React island hydrates
// client-side only — Astro does not render it on the server.

import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  site: 'https://rankmyannuity.pro',
  trailingSlash: 'never',
  output: 'static',
  build: { format: 'directory' },
  integrations: [
    mdx(),
    react(),
    tailwind({ applyBaseStyles: false }),
    sitemap(),
  ],
  vite: {
    build: {
      rollupOptions: {
        plugins: [
          visualizer({
            filename: 'dist/_bundle-report.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: false,
          }),
        ],
      },
    },
  },
});
