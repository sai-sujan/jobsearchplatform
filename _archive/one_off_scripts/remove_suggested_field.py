import json
import glob
import os

ANALYSIS_DIR = "analysis_results"

def clean_json_files():
    print("🧹 Starting Cleanup...")
    
    json_files = glob.glob(os.path.join(ANALYSIS_DIR, "*.json"))
    cleaned_count = 0
    
    for path in json_files:
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            # Remove 'suggested_tech_stack' if it exists
            if 'suggested_tech_stack' in data:
                del data['suggested_tech_stack']
                
                with open(path, 'w') as f:
                    json.dump(data, f, indent=2)
                
                cleaned_count += 1
                
        except Exception as e:
            print(f"❌ Error cleaning {path}: {e}")
            
    print("\n✅ CLEANUP COMPLETE")
    print(f"  Removed 'suggested_tech_stack' from {cleaned_count} files.")
    print("  Files are now in their original Phase 12 state.")

if __name__ == "__main__":
    clean_json_files()
