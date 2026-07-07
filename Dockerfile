# Use a Node.js base image with Debian (includes build tools for native modules)
FROM node:22

# Maintainer information
LABEL maintainer="AWSProductTeam@gd-ms.com"

# Set working directory
WORKDIR /app

# node:22 ships with npm 10.x which has a crash bug ("Exit handler never called")
# that silently leaves node_modules incomplete. Upgrade to npm 11 before anything else.
# Also disable strict-ssl so the internal Nexus registry (self-signed CA) is trusted.
RUN npm install -g npm@latest && \
    npm config set strict-ssl false && \
    npm config set registry https://nexus.engapps.gd-ms.us/repository/TOS-npm/

# Copy package.json and package-lock.json first (for efficient caching of dependencies)
COPY package*.json ./

# Install dependencies
# Workaround for npm optional dependencies bug with oxc-parser:
# 1. Install without running postinstall scripts
# 2. Rebuild optional dependencies
# 3. Run postinstall script (nuxt prepare) separately
RUN npm install --legacy-peer-deps --ignore-scripts && \
    npm rebuild
RUN npm run postinstall || true

# Copy the application files from the build context into the image
COPY . .

# Build the application with more heap to avoid OOM errors
RUN NODE_OPTIONS="--max-old-space-size=8192" npm run build

# The port this container will listen on (informational only)
EXPOSE 3000

# Create a non-root user for running the app (for extra security)
# RUN adduser -D appuser && chown -R appuser /app
# USER appuser

# Run the application
CMD ["npm", "start"]
