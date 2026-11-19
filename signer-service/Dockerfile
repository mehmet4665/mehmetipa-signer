FROM debian:bookworm-slim AS zsign-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git build-essential pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch v1.1.2 https://github.com/zhlynn/zsign.git
RUN make -C /src/zsign/build/linux -j2

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 ca-certificates unzip python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=zsign-build /src/zsign/bin/zsign /usr/local/bin/zsign
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
RUN mkdir -p /tmp/mehmetipa
EXPOSE 8080
USER node
CMD ["node", "server.js"]
