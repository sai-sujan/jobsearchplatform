import json
import glob
import os
import copy

ANALYSIS_DIR = "analysis_results"

def restore_suggested():
    print("🔄 Restoring 'suggested_tech_stack' by copying 'tech_stack'...")
    
    json_files = glob.glob(os.path.join(ANALYSIS_DIR, "*.json"))
    count = 0
    
    for path in json_files:
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            # Copy tech_stack to suggested_tech_stack
            # This ensures both fields exist and match
            if 'tech_stack' in data:
                data['suggested_tech_stack'] = copy.deepcopy(data['tech_stack'])
                
                with open(path, 'w') as f:
                    json.dump(data, f, indent=2)
                
                count += 1
                
        except Exception as e:
            print(f"❌ Error processing {path}: {e}")
            
    print("\n✅ RESTORE COMPLETE")
    print(f"  Populated 'suggested_tech_stack' in {count} files.")
    print("  State: 'tech_stack' (Yours) matches 'suggested_tech_stack' (Suggested).")

if __name__ == "__main__":
    restore_suggested()
