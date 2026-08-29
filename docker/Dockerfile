FROM node:22-trixie-slim
WORKDIR /app
COPY package*.json .
# --omit=dev is safe: tests use node:test (stdlib), devDeps are only eslint/prettier
ARG NICTOOL_VALIDATE_SPEC
RUN npm install --omit=dev \
  && if [ -n "$NICTOOL_VALIDATE_SPEC" ]; then \
    npm install --omit=dev --no-save "$NICTOOL_VALIDATE_SPEC"; \
  fi
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
