"""
Standalone entrypoint for background workers (no Flask/HTTP).

Imports candid.controllers which initializes the DB pool and starts
workers based on environment variables. This process then blocks
until SIGTERM/SIGINT for graceful K8s shutdown.

Usage:
    python -m candid.worker_entrypoint

Environment variables (control which workers run):
    POLIS_ENABLED=true              Polis sync worker (5s poll)
    MF_ENABLED=true                 Matrix factorization worker (30min)
    APPROVAL_REMINDER_ENABLED=true  Approval reminder worker (1hr)
    AVATAR_NSFW_ENABLED=true        Avatar NSFW check worker (5s poll)

K8s deployment:
    API pods:    POLIS_ENABLED=false MF_ENABLED=false APPROVAL_REMINDER_ENABLED=false
    Worker pod:  POLIS_ENABLED=true  MF_ENABLED=true  APPROVAL_REMINDER_ENABLED=true
"""

import signal
import sys
import time

# Importing candid.controllers triggers:
# 1. DB connection pool initialization
# 2. Worker thread startup (based on *_ENABLED env vars)
# 3. atexit handlers for graceful shutdown
import candid.controllers  # noqa: F401

print("Worker process started", flush=True)


def shutdown(sig, frame):
    """Handle SIGTERM/SIGINT for graceful K8s pod termination."""
    print("Received shutdown signal", flush=True)
    sys.exit(0)  # atexit handlers will stop workers


signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

# Keep process alive — worker threads are daemonic
while True:
    time.sleep(1)
