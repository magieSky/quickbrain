FROM docker.m.daocloud.io/library/postgres:16
COPY pgvector.deb /tmp/pgvector.deb
RUN dpkg -i /tmp/pgvector.deb && rm /tmp/pgvector.deb

