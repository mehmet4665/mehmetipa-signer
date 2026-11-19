FROM python:3.12-slim-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git g++ make pkg-config libssl-dev zlib1g-dev && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/zhlynn/zsign.git /src/zsign && make -C /src/zsign/build/linux

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 zlib1g && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/zsign/bin/zsign /usr/local/bin/zsign
RUN pip install --no-cache-dir flask==3.1.2 gunicorn==23.0.0 && useradd -m signer
WORKDIR /app
COPY server.py /app/server.py
USER signer
EXPOSE 8080
CMD ["gunicorn","--bind","0.0.0.0:8080","--workers","1","--timeout","300","server:app"]
