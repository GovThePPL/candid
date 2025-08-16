FROM ubuntu:24.04
RUN apt -y update
RUN apt install -y postgresql-common
RUN /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y

RUN apt -y install default-jre python3 python3-pip postgresql-client-17
RUN pip3 install openapi-generator-cli pipreqs psycopg2-binary --break-system-packages
RUN mkdir -p /usr/src/docs

COPY ./docs/api.yaml /usr/src/docs/
COPY ./backend/server/openapi-config.json /usr/src/docs/

RUN mkdir -p /usr/src/app
WORKDIR /usr/src
RUN openapi-generator-cli generate -i docs/api.yaml -g python-flask -o app/ -c docs/openapi-config.json
COPY ./backend/server/controllers/ app/candid/controllers/

WORKDIR /usr/src/app/

#RUN pipreqs --force .
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

EXPOSE 8000

ENTRYPOINT ["python3"]

CMD ["-m", "candid"]
