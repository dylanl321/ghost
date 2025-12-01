# Build stage
FROM node:23-alpine AS builder

# Maintainer information
LABEL maintainer="AWSProductTeam@gd-ms.com"

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps flag
RUN npm install --legacy-peer-deps

# Copy application files
COPY . .

# Build the application with more heap to avoid OOM errors
RUN NODE_OPTIONS="--max-old-space-size=8192" npm run build

# Production stage
FROM node:23-alpine

# Install runtime dependencies for native modules
RUN apk add --no-cache python3

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built application from builder stage
COPY --from=builder /app/.output /app/.output

# The port this container will listen on (informational only)
EXPOSE 3000

# Create a non-root user for running the app (for extra security)
RUN adduser -D appuser && chown -R appuser /app
USER appuser

# Run the application
CMD ["node", ".output/server/index.mjs"]
