# Jarbunq

FROM node:12.9.1-alpine
ENV NODE_ENV production
ENV NPM_CONFIG_LOGLEVEL warn

# Add all required files from root.
ADD . /

# Install and configure required dependencies.
RUN apk update && apk upgrade && apk add git
RUN npm install --production

# Expose and start!
EXPOSE 8080
CMD ["npm", "start"]
