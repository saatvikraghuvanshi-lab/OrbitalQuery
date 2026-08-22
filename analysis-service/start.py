#!/usr/bin/env python3
"""Start the EO Analysis Service in the background."""
import subprocess
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app",
     "--host", "0.0.0.0", "--port", "8000"],
    stdout=open("/tmp/analysis.log", "w"),
    stderr=subprocess.STDOUT,
    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
)
print(f"Started PID {proc.pid}")
