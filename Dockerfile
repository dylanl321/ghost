# Use a Node.js base image. See full list of images here: https://hub.docker.com/_/node
FROM node:23-alpine

# Maintainer information
LABEL maintainer="AWSProductTeam@gd-ms.com"

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first (for efficient caching of dependencies)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the application files from the build context into the image
COPY . .

# Build the application with more heap to avoid OOM errors
RUN NODE_OPTIONS=--max-old-space-size=8192 npm run build

# The port this container will listen on (informational only)
EXPOSE 3000

# Create a non-root user for running the app (for extra security)
# RUN adduser -D appuser && chown -R appuser /app
# USER appuser

# Run the application
CMD ["npm", "start"]

