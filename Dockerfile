# Development image; production builds expose one Node HTTP server.
FROM node:24-bookworm-slim
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci
COPY . .
EXPOSE 3000 5173
CMD ["npm", "run", "dev"]
