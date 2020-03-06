# Jarbunq Docker image

# BUILDER
FROM node:alpine AS jarbunq-builder
WORKDIR /app
COPY . .
RUN npm install
RUN node_modules/.bin/tsc

# DEPENDENCIES
FROM node:alpine AS jarbunq-dependencies
WORKDIR /app
COPY . .
RUN apk update && apk upgrade && npm install --production

# FINAL IMAGE
FROM node:alpine AS jarbunq-final
ENV NODE_ENV=production
WORKDIR /app
COPY . .
COPY --from=jarbunq-builder ./app/lib ./lib
COPY --from=jarbunq-dependencies ./app/node_modules ./node_modules
EXPOSE 8080
CMD ["npm", "start"]
