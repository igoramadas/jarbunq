# Jarbunq Docker

FROM node:alpine
WORKDIR /app

# Copy package and install Node dependencies.
COPY package.json package-lock.json* ./
RUN npm install --production

# Add application files.
COPY . ./

# Expose and start!
EXPOSE 8080
CMD ["npm", "start"]
