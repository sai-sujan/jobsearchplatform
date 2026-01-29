
import sys

dependencies = [
    "airllm",
    "torch",
    "transformers",
    "playwright",
    "pandas",
    "openpyxl"
]

missing = []
for dep in dependencies:
    try:
        __import__(dep)
        print(f"✓ {dep} installed")
    except ImportError:
        missing.append(dep)
        print(f"✗ {dep} NOT installed")

if missing:
    print(f"\nMissing dependencies: {', '.join(missing)}")
    sys.exit(1)
else:
    print("\nAll dependencies ready.")
    sys.exit(0)
