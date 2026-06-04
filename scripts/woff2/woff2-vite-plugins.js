// Self-host fonts from diagrams.free; do not load from upstream Excalidraw CDN.
const FONT_ASSET_PATH = "/";

/**
 * Custom vite plugin for auto-prefixing `EXCALIDRAW_ASSET_PATH` woff2 fonts in `excalidraw-app`.
 *
 * @returns {import("vite").PluginOption}
 */
module.exports.woff2BrowserPlugin = () => {
  let isDev;

  return {
    name: "woff2BrowserPlugin",
    enforce: "pre",
    config(_, { command }) {
      isDev = command === "serve";
    },
    transform(code, id) {
      // using copy / replace as fonts defined in the `.css` don't have to be manually copied over (vite/rollup does this automatically),
      // but at the same time can't be easily prefixed with the `EXCALIDRAW_ASSET_PATH` only for the `excalidraw-app`
      if (!isDev && id.endsWith("/excalidraw/fonts/fonts.css")) {
        return `/* WARN: The following content is generated during excalidraw-app build */

      @font-face {
        font-family: "Assistant";
        src: url(./Assistant-Regular.woff2) format("woff2");
        font-weight: 400;
        style: normal;
        display: swap;
      }

      @font-face {
        font-family: "Assistant";
        src: url(./Assistant-Medium.woff2) format("woff2");
        font-weight: 500;
        style: normal;
        display: swap;
      }

      @font-face {
        font-family: "Assistant";
        src: url(./Assistant-SemiBold.woff2) format("woff2");
        font-weight: 600;
        style: normal;
        display: swap;
      }

      @font-face {
        font-family: "Assistant";
        src: url(./Assistant-Bold.woff2) format("woff2");
        font-weight: 700;
        style: normal;
        display: swap;
      }`;
      }

      if (!isDev && id.endsWith("excalidraw-app/index.html")) {
        return code.replace(
          "<!-- PLACEHOLDER:EXCALIDRAW_APP_FONTS -->",
          `<script>
        window.EXCALIDRAW_ASSET_PATH = "${FONT_ASSET_PATH}";
      </script>`,
        );
      }
    },
  };
};
