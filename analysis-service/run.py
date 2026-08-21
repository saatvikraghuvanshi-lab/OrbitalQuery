#!/usr/bin/env python3
"""Entry point for the EO Analysis Service."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
