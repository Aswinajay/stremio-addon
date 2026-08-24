FROM node:18-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Cloud Run injects PORT (default 8080); server.js already reads process.env.PORT
ENV PORT=8080

EXPOSE 8080

CMD [ "node", "server.js" ]
