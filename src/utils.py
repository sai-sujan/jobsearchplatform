"""
Shared Utilities
-----------------
Consolidated utility functions used across multiple modules.
"""

import os
import re
import fcntl
import shutil
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Optional


def load_excel_safe(file_path: Path, sheet_name: str = 'All Jobs') -> pd.DataFrame:
    """
    Load Excel with sheet name fallback.
    Tries the named sheet first, falls back to first sheet.
    Aborts on true read errors.
    """
    try:
        return pd.read_excel(file_path, sheet_name=sheet_name)
    except (KeyError, ValueError):
        return pd.read_excel(file_path, sheet_name=0)


def create_backup(source_path: Path, backup_dir: Path, max_backups: int = 10) -> Optional[Path]:
    """
    Create a timestamped backup of a file.
    Keeps only the last `max_backups` backups.
    Returns the backup path, or None if source doesn't exist.
    Raises SystemExit on failure (data safety).
    """
    if not source_path.exists():
        return None

    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"{source_path.stem}_backup_{timestamp}{source_path.suffix}"

    try:
        shutil.copy2(source_path, backup_path)
        print(f"[BACKUP] Created: {backup_path.name}")

        # Prune old backups
        backups = sorted(backup_dir.glob(f"{source_path.stem}_backup_*{source_path.suffix}"))
        if len(backups) > max_backups:
            for old_backup in backups[:-max_backups]:
                old_backup.unlink()

        return backup_path
    except Exception as e:
        print(f"[ERROR] Failed to create backup: {e}")
        print("[ERROR] Aborting to prevent data loss.")
        raise SystemExit(1)


def acquire_file_lock(lock_path: Path):
    """
    Acquire an exclusive file lock. Returns the lock file descriptor.
    Raises SystemExit if another instance holds the lock.
    """
    try:
        lock_fd = open(lock_path, 'w')
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock_fd
    except (IOError, OSError):
        print("[ERROR] Another instance is running. Wait for it to finish.")
        raise SystemExit(1)


def release_file_lock(lock_fd, lock_path: Path):
    """Release a file lock and clean up the lock file."""
    if lock_fd:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        lock_fd.close()
        try:
            os.remove(lock_path)
        except OSError:
            pass


def escape_latex(text: str) -> str:
    """Escape special LaTeX characters. Handles Unicode dashes/quotes."""
    if not isinstance(text, str):
        return str(text)
    # Unicode replacements
    text = text.replace('\u2013', '--').replace('\u2014', '---')
    text = text.replace('\u201c', '``').replace('\u201d', "''")
    text = text.replace('\u2018', "'").replace('\u2019', "'")
    text = text.replace('\u2026', '...')
    # LaTeX special chars
    for char, replacement in [('&', r'\&'), ('%', r'\%'), ('$', r'\$'),
                               ('#', r'\#'), ('_', r'\_'), ('~', r'\textasciitilde{}')]:
        text = re.sub(r'(?<!\\)' + re.escape(char), replacement, text)
    return text


def sanitize_company_name(name: str) -> str:
    """Sanitize company name for use in filenames."""
    if not name:
        return 'unknown'
    return re.sub(r'[^\w\s-]', '', name).replace(' ', '_')
