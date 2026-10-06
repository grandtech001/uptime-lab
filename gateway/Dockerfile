## to find the right digest for docker image -> docker buildx imagetools inspect node:22-slim | head -3
FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

WORKDIR /app
COPY gateway/package.json gateway/package-lock.json ./
RUN npm ci --omit=dev
COPY gateway/ .
USER node
CMD [ "node","index.js" ]