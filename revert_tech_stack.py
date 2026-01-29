import json
import glob
import os

ANALYSIS_DIR = "analysis_results"

def revert_stack():
    print("⏪ Starting Revert Process...")
    
    json_files = glob.glob(os.path.join(ANALYSIS_DIR, "*.json"))
    fixed_count = 0
    
    for path in json_files:
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            # Check if suggested_tech_stack exists
            if 'suggested_tech_stack' in data:
                # REVERT: Copy suggested back to tech_stack
                # This restores the original analysis data to the main field
                data['tech_stack'] = data['suggested_tech_stack']
                
                # We optionally keep 'suggested_tech_stack' or remove it.
                # User asked to "revert", likely implying they want the old structure?
                # But keeping it is safer for the UI (Split View will just show "All Added").
                # Let's keep it for now. 
                
                with open(path, 'w') as f:
                    json.dump(data, f, indent=2)
                
                fixed_count += 1
            else:
                print(f"⚠️ Skipping {path}: No suggested_tech_stack to revert from.")
                
        except Exception as e:
            print(f"❌ Error reverting {path}: {e}")
            
    print("\n✅ REVERT COMPLETE")
    print(f"  Restored {fixed_count} files.")
    print("  'tech_stack' is now populated with the full analysis data again.")

if __name__ == "__main__":
    revert_stack()
