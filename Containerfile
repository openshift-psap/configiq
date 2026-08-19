# Multi-stage Next.js 14 build
ARG NEXT_PUBLIC_AICONFIGURATOR_API_URL=https://aiconfigurator.dev

FROM node:20-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN NEXT_PUBLIC_AICONFIGURATOR_API_URL=${NEXT_PUBLIC_AICONFIGURATOR_API_URL} npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
RUN addgroup -g 1001 -S configiq && adduser -S configiq -u 1001

COPY --from=builder --chown=configiq:configiq /app/.next/standalone ./
COPY --from=builder --chown=configiq:configiq /app/.next/static ./.next/static
COPY --from=builder --chown=configiq:configiq /app/public ./public

USER configiq

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "server.js"]
