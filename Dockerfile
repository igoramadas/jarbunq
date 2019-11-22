# Jarbunq Docker

FROM node:13.1.0-alpine
WORKDIR /app

# Install and configure required basic dependencies.
RUN apk update && apk upgrade

# Copy package and install Node dependencies.
COPY package.json package-lock.json* ./
RUN npm install --production

# Add application files.
COPY . ./

# Expose and start!
EXPOSE 8080
CMD ["npm", "start"]
