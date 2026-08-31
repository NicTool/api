FROM node:22-trixie-slim
WORKDIR /app
COPY package*.json .
# --omit=dev is safe: tests use node:test (stdlib), devDeps are only eslint/prettier
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
