# Use the official Node.js image.
# Hugging Face provides 16GB RAM for free on 'Blank' Docker spaces!
FROM node:18-slim

# Create and change to the app directory.
WORKDIR /app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json and package-lock.json are copied.
COPY package*.json ./

# Install dependencies.
RUN npm install

# Copy local code to the container image.
COPY . .

# Hugging Face Spaces default port is 7860
ENV PORT=7860

# Since Hugging Face has 16GB RAM, we can set a much higher limit for buffering movies!
# This makes 4K streaming even smoother.
ENV RAM_LIMIT_MB=14000

# Expose the port
EXPOSE 7860

# Run the web service on container startup.
CMD [ "node", "server.js" ]
