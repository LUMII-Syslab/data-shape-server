FROM node:20-alpine3.19

ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV

ARG PORT=3000
ENV PORT $PORT
EXPOSE $PORT

ARG DB_URL
ENV DB_URL $DB_URL

RUN npm i npm@latest -g

USER node

RUN mkdir -p /opt/app && chown -R node:node /opt/app
WORKDIR /opt/app

COPY server/package.json server/package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

ENV PATH /opt/app/node_modules/.bin:$PATH

COPY --chown=node:node server/ .

CMD [ "node", "./bin/www" ]