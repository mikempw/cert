FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends git curl openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install acme.sh without cron
ENV ACME_HOME=/opt/acme
RUN git clone https://github.com/acmesh-official/acme.sh /opt/acme.sh \
 && cd /opt/acme.sh \
 && ./acme.sh --install --home "$ACME_HOME" --force \
 && ln -s "$ACME_HOME/acme.sh" /usr/local/bin/acme.sh


WORKDIR /app
RUN python -m pip install --upgrade pip
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ⬅️ make /app importable at top-level
ENV PYTHONPATH=/app

# ⬅️ copy ALL app files (including adapters/)
COPY . /app

ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7000"]
