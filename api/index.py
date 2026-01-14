import sys
import os

# Add project root to Python path so we can import app.py
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import app  # <-- imports your Flask instance