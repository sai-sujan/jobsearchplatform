
import sys
import traceback

print(f"Python: {sys.version}")
print(f"Path: {sys.path}")

print("\nAttempting to import airllm...")
try:
    import airllm
    print("SUCCESS: airllm imported")
    print(f"File: {airllm.__file__}")
except ImportError as e:
    print(f"ERROR: ImportError: {e}")
    traceback.print_exc()
except Exception as e:
    print(f"ERROR: Exception: {e}")
    traceback.print_exc()

print("\nChecking torch...")
try:
    import torch
    print(f"Torch: {torch.__version__}")
except:
    print("Torch failed to import")
