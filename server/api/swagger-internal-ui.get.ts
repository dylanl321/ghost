/**
 * GET /api/swagger-internal-ui
 * Serve the authenticated internal API reference.
 */

import { defineEventHandler, setHeader } from 'h3'

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/html')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GHOST Internal API</title>
  <link rel="stylesheet" href="/api/swagger-assets/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/swagger-assets/swagger-ui-bundle.js"></script>
  <script src="/api/swagger-assets/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api/swagger-internal.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
        tryItOutEnabled: true,
        filter: true
      });
    };
  </script>
</body>
</html>`
})
