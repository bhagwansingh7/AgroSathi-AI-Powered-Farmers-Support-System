FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# devDependencies are installed too so `docker compose exec backend npm test` works
RUN npm install --include=dev --no-audit --no-fund
COPY . .
EXPOSE 5000
USER node
CMD ["node", "src/server.js"]
