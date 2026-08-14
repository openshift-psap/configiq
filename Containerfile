# Build from repo root:
#   podman build -f Containerfile -t gpu-calc-v2:latest .

FROM node:20-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# NEXT_PUBLIC_* vars are inlined at build time — must be set here, not at runtime
ARG NEXT_PUBLIC_AICONFIGURATOR_API_URL=https://aic-backend.apps.ocp4.intlab.redhat.com
ENV NEXT_PUBLIC_AICONFIGURATOR_API_URL=${NEXT_PUBLIC_AICONFIGURATOR_API_URL}

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /src/public ./public
COPY --from=builder /src/.next/standalone ./
COPY --from=builder /src/.next/static ./.next/static

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "server.js"]
