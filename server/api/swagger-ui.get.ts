/**
 * GET /api/swagger-ui
 * Serve interactive Swagger UI using local swagger-ui-dist
 */

import { defineEventHandler, setHeader } from 'h3'

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/html')
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GHOST API - Interactive Documentation</title>
  <link rel="stylesheet" type="text/css" href="/api/swagger-assets/swagger-ui.css" />
  <link rel="icon" type="image/png" href="/api/swagger-assets/favicon-32x32.png" sizes="32x32" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      display: none;
    }
    .swagger-ui .info {
      margin: 20px 0;
    }
    .swagger-ui .info .title {
      color: #2c3e50;
    }
    .custom-header {
      background: #2c3e50;
      color: white;
      padding: 20px;
      text-align: center;
      margin-bottom: 20px;
    }
    .custom-header h1 {
      margin: 0;
      font-family: 'Titillium Web', sans-serif;
    }
    .custom-header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <h1>GHOST API</h1>
    <p>Interactive API Documentation</p>
  </div>
  <div id="swagger-ui"></div>

  <script src="/api/swagger-assets/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="/api/swagger-assets/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    window.onload = function() {
      // Begin Swagger UI call region
      const ui = SwaggerUIBundle({
        url: '/api/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        tryItOutEnabled: true,
        filter: true,
        requestInterceptor: function(req) { return req; }
      });
      // End Swagger UI call region
      window.ui = ui;
    };
  </script>
</body>
</html>`
})
