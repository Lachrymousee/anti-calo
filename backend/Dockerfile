FROM node:24-bookworm-slim

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY shared/abi/ /app/shared/abi/

ENV NODE_ENV=development
EXPOSE 3001

CMD ["npm", "start"]
