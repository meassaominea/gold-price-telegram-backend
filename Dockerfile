FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy dependency specifications
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy application files
COPY . .

# Create directory for persistent data
RUN mkdir -p /app/data

# Environment configuration
ENV NODE_ENV=production
ENV PORT=5600
ENV DATA_DIR=/app/data

EXPOSE 5600

CMD ["node", "--max-old-space-size=256", "index.js"]
