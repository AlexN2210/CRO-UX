FROM node:22.19-bookworm

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npm", "start"]
