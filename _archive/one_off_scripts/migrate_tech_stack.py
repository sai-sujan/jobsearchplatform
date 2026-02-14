import json
import os
import glob
import copy
from pathlib import Path

DEFAULT_STACK_PATH = "config/default_stack.json"
ANALYSIS_DIR = "analysis_results"

def migrate():
    print("🚀 Starting Tech Stack Migration (v2)...")
    
    # 1. Load Default Stack
    if not os.path.exists(DEFAULT_STACK_PATH):
        print(f"❌ Default stack not found at {DEFAULT_STACK_PATH}")
        return

    with open(DEFAULT_STACK_PATH, 'r') as f:
        default_stack = json.load(f)
    print(f"✅ Loaded Default Stack with {len(default_stack)} categories.")

    # 2. Find JSONs
    json_files = glob.glob(os.path.join(ANALYSIS_DIR, "*.json"))
    print(f"📂 Found {len(json_files)} analysis files.")

    migrated_count = 0
    skipped_count = 0

    for path in json_files:
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            # Check if already migrated
            if 'suggested_tech_stack' in data:
                skipped_count += 1
                continue
                
            # Perform Migration
            # 1. Move current 'tech_stack' to 'suggested_tech_stack'
            # Note: Pop it so 'tech_stack' is cleared
            current_stack = data.get('tech_stack', {})
            data['suggested_tech_stack'] = current_stack
            
            # 2. Set 'tech_stack' to Default Stack (Deep Copy to avoid ref issues)
            data['tech_stack'] = copy.deepcopy(default_stack)
            
            # Save back
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
                
            migrated_count += 1
            
        except Exception as e:
            print(f"❌ Error processing {path}: {e}")

    print("\n" + "="*50)
    print(f"  MIGRATION COMPLETE")
    print(f"  ✅ Migrated: {migrated_count}")
    print(f"  ⏭️  Skipped (Already done): {skipped_count}")
    print("="*50)

if __name__ == "__main__":
    migrate()
