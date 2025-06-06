ARG BUILD_FROM
FROM $BUILD_FROM

ENV LANG C.UTF-8

# Install dependencies
RUN apk add --no-cache avahi ffmpeg alsa-utils nodejs npm

# Copy run script and app files
COPY run.sh /run.sh
RUN chmod +x /run.sh

WORKDIR /app
COPY package.json /app/package.json
COPY index.js /app/index.js

RUN npm install --production

CMD ["/run.sh"]
