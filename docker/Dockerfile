FROM node:22-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json .
# --omit=dev is safe: tests use node:test (stdlib), devDeps are only eslint/prettier
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
