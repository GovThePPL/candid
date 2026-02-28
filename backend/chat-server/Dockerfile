FROM python:3.12-slim

WORKDIR /app

COPY backend/chat-server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/chat-server/ .

EXPOSE 8002

RUN useradd -m -u 1000 app
USER app

CMD ["python", "-m", "chat_server"]
