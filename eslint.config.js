import config from "@saas-maker/eslint-config/vite-legacy";

export default [
  {
    ignores: ["tmp/**", "**/.astro/**", "**/dist/**", "**/node_modules/**"],
  },
  ...config,
];
