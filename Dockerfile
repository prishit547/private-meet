# =============================================================
# Stage 1: Build the React Client
# =============================================================
FROM node:22-alpine AS client-builder

WORKDIR /build/client

# Copy package descriptors and install dependencies
COPY client/package*.json ./
RUN npm ci

# Copy client source files and compile production bundle
COPY client/ ./
RUN npm run build

# =============================================================
# Stage 2: Production Server Runner
# =============================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install production dependencies for server
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server code
COPY server/ ./server/

# Copy compiled React frontend from Stage 1
COPY --from=client-builder /build/client/dist ./client/dist

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Start server
WORKDIR /app/server
CMD ["node", "server.js"]
