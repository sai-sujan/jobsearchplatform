import json
import glob
import os

ANALYSIS_DIR = "analysis_results"

# Minimal Stack to reset to
# This ensures "Yours" is small, so "Suggested" (Blue) chips appear as available (+)
MINIMAL_STACK = {
    "Programming Languages": ["Python", "SQL"],
    "ML Frameworks & Libraries": ["PyTorch", "TensorFlow"]
}

def fix_overlap():
    print("🔧 Starting Tech Stack Overlap Fix...")
    
    json_files = glob.glob(os.path.join(ANALYSIS_DIR, "*.json"))
    print(f"📂 Found {len(json_files)} files to process.")
    
    fixed_count = 0
    
    for path in json_files:
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            # Ensure suggested_tech_stack exists (it should, from previous migration)
            if 'suggested_tech_stack' not in data:
                print(f"⚠️ Skipping {path}: No suggested_tech_stack found (run migrate first?)")
                continue
                
            # Reset tech_stack to Minimal
            # We preserve ONLY the keys in MINIMAL_STACK, rest are removed from "Yours"
            # so they can be "Suggested" again.
            data['tech_stack'] = MINIMAL_STACK
            
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
                
            fixed_count += 1
            
        except Exception as e:
            print(f"❌ Error fixing {path}: {e}")
            
    print("\n✅ FIX COMPLETE")
    print(f"  Processed: {fixed_count} files")
    print("  'Your Stack' has been reset to Python, SQL, PyTorch, TensorFlow.")
    print("  'Suggested' section should now show all other skills as available (+).")

if __name__ == "__main__":
    fix_overlap()
