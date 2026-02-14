
import json
import os
from typing import Set
from ..settings import settings

class HistoryManager:
    """
    Manages a persistent history of processed job URLs to prevent duplicates across runs.
    """
    def __init__(self, history_file: str = "processed_jobs_history.json"):
        self.history_file = str(settings.HISTORY_FILE)
        self.processed_urls: Set[str] = self._load_history()

    def _load_history(self) -> Set[str]:
        """Load history from JSON file."""
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, 'r') as f:
                    data = json.load(f)
                    return set(data.get("urls", []))
            except Exception as e:
                print(f"[WARNING] Failed to load history: {e}")
                return set()
        return set()

    def save_history(self):
        """Save current history to JSON file."""
        try:
            with open(self.history_file, 'w') as f:
                json.dump({"urls": list(self.processed_urls)}, f, indent=2)
            print(f"[INFO] History saved ({len(self.processed_urls)} jobs).")
        except Exception as e:
            print(f"[ERROR] Failed to save history: {e}")

    def exists(self, url: str) -> bool:
        """Check if URL URL has already been processed."""
        # Simple normalization: remove query params
        clean_url = url.split("?")[0]
        return clean_url in self.processed_urls

    def add(self, url: str):
        """Add a URL to the history."""
        clean_url = url.split("?")[0]
        self.processed_urls.add(clean_url)
