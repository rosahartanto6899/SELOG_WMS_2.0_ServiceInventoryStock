###################
# BUILD
###################
FROM node:22-slim AS build

# Install required packages for native modules (canvas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libgif-dev \
    libjpeg-dev \
    libpango1.0-dev \
    librsvg2-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY src ./src
COPY tsconfig.json .
COPY tslint.json .
COPY tsoa.json .
COPY .env .
COPY package*.json ./
COPY tsconfig-paths-bootstrap.js .

RUN npm ci --ignore-scripts --audit=false && \
    npm rebuild --ignore-scripts && \
    npm run build

###################
# DEPLOY
###################

FROM node:22-slim AS deploy

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libgif7 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Jakarta

# Create a non-root user
RUN adduser --disabled-password --gecos "" --uid 1001 appuserlogis

WORKDIR /app

# Copy files from build stage with correct ownership and read-only permissions
COPY --from=build --chown=appuserlogis:appuserlogis --chmod=555 /app/node_modules ./node_modules
COPY --from=build --chown=appuserlogis:appuserlogis --chmod=555 /app/dist ./dist
COPY --from=build --chown=appuserlogis:appuserlogis --chmod=444 /app/package*.json ./
COPY --from=build --chown=appuserlogis:appuserlogis --chmod=444 /app/tsconfig*.json ./
COPY --from=build --chown=appuserlogis:appuserlogis --chmod=400 /app/.env ./.env
COPY --from=build --chown=appuserlogis:appuserlogis --chmod=555 /app/tsconfig-paths-bootstrap.js ./

USER appuserlogis

EXPOSE 3000
EXPOSE 8080

CMD ["npm", "run", "start"]
