ARG NODE_VERSION=22.23.1
ARG NPM_VERSION=11.18.0

# Build dependencies and compile the self-contained Nitro server output.
FROM node:${NODE_VERSION}-bookworm AS build

ARG NPM_VERSION

# Set working directory
WORKDIR /app

# npm 10 can fail with "Exit handler never called" in this dependency graph.
# Keep npm deterministic and scope the internal registry configuration to this build stage.
RUN npm install -g npm@${NPM_VERSION} && \
    npm config set strict-ssl false && \
    npm config set registry https://nexus.engapps.gd-ms.us/repository/TOS-npm/

# Copy package.json and package-lock.json first (for efficient caching of dependencies)
COPY package*.json ./

# Install dependencies
# Workaround for npm optional dependencies bug with oxc-parser:
# 1. Install without running postinstall scripts
# 2. Rebuild optional dependencies
# 3. Run postinstall script (nuxt prepare) separately
RUN npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund && \
    npm rebuild
RUN npm run postinstall

# Copy the application files from the build context into the image
COPY . .

# Build the application with more heap to avoid OOM errors
RUN NODE_OPTIONS="--max-old-space-size=8192" npm run build

# The production image needs only Node and Nitro's generated output.
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

LABEL maintainer="AWSProductTeam@gd-ms.com"

WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    chown node:node /app

COPY --from=build --chown=node:node /app/.output ./.output

EXPOSE 3000
USER node

CMD ["node", ".output/server/index.mjs"]
