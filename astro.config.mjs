import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  site: "https://wahkonsalodge.com",
  base: "/",
  integrations: [
    mdx(),
    sitemap({
      filter: (page) =>
        !page.endsWith("/404.html") &&
        !page.endsWith("/404/") &&
        !page.endsWith("/request-coloring-page/sent/"),
    }),
    icon(),
  ],
});
