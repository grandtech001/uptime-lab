FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
WORKDIR /app
COPY services/scheduler/package.json services/scheduler/package-lock.json ./
RUN npm ci --omit=dev
COPY services/scheduler/ .
USER node
CMD [ "node","index.js" ]