FROM node:20-alpine

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev

COPY server.js server.js
COPY simulation.js simulation.js
COPY tournament.js tournament.js
COPY metrics.js metrics.js
COPY benchmark.js benchmark.js
COPY stress-test.js stress-test.js
COPY match-worker.js match-worker.js

EXPOSE 3000

CMD ["npm", "start"]
