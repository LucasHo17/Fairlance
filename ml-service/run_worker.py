import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Prevent macOS fork safety error when worker forks processes
os.environ["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] = "YES"

# Load environment variables from workspace root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from rq import Connection, Worker, SimpleWorker
from app.queue import redis_conn

if __name__ == "__main__":
    # Use SimpleWorker on macOS (darwin) due to fork restrictions, standard Worker on Linux (Production)
    WorkerClass = SimpleWorker if sys.platform == "darwin" else Worker
    print(f"Starting Fairlance ML Background Task Worker ({WorkerClass.__name__})...")
    with Connection(redis_conn):
        worker = WorkerClass(["ml-tasks"])
        worker.work()

