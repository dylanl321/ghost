# Use a Node.js base image with Debian (includes build tools for native modules)
FROM node:22

# Maintainer information
LABEL maintainer="AWSProductTeam@gd-ms.com"

# Set working directory
WORKDIR /app

# Upgrade npm to avoid the "Exit handler never called" crash in npm 10.x
RUN npm install -g npm@latest

# Copy package.json and package-lock.json first (for efficient caching of dependencies)
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps
# nuxt prepare can fail on first build (no .nuxt dir yet), so allow it to
RUN npx nuxt prepare || true

# Copy the application files from the build context into the image
COPY . .

# Ensure tsx is available for the bundle:support prebuild script
RUN npm install -g tsx

# Build the application with more heap to avoid OOM errors
RUN NODE_OPTIONS="--max-old-space-size=8192" npm run build

# The port this container will listen on (informational only)
EXPOSE 3000

# Create a non-root user for running the app (for extra security)
# RUN adduser -D appuser && chown -R appuser /app
# USER appuser

# Run the application
CMD ["npm", "start"]
