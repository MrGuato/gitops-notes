// @ts-check
import { defineConfig } from "astro/config";

// Two deployment targets share this config.
// GitHub Pages serves the site under /gitops-notes, which is the default.
// The container build passes ASTRO_BASE=/ and ASTRO_SITE=<cluster hostname>
// so the same source produces root-relative links for the cluster.
const site = process.env.ASTRO_SITE || "https://mrguato.github.io";
const base = process.env.ASTRO_BASE || "/gitops-notes";

// https://astro.build/config
export default defineConfig({
  site,
  base,
  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    },
  },
  vite: {
    build: {
      // Never inline small scripts or stylesheets. The container sends a
      // Content-Security-Policy that forbids inline scripts.
      assetsInlineLimit: 0,
    },
  },
});
