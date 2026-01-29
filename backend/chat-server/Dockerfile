FROM python:3.12-slim

WORKDIR /app

COPY backend/chat-server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/chat-server/ .

EXPOSE 8002

CMD ["python", "-m", "chat_server"]
