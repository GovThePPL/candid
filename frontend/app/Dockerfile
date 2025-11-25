FROM node:latest
#RUN npm install expo

RUN mkdir -p /usr/src/app
WORKDIR /usr/src
COPY ./frontend app/

WORKDIR /usr/src/app/

EXPOSE 9001

ENTRYPOINT ["npx"]

CMD ["expo", "start", "--port", "9001"]
