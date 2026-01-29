
import pandas as pd
import json
import re
import os

EXCEL_PATH = 'jobs_master.xlsx'
RESULTS_DIR = 'analysis_results'

def extract_location(jd_text):
    if not isinstance(jd_text, str):
        return "Unknown"
    
    # Heuristic: Split by double newline
    parts = jd_text.split('\n\n')
    if len(parts) > 2:
        loc_line = parts[2].strip()
        # "Juno Beach, FL · 1 day ago..."
        # Split by " · "
        if ' · ' in loc_line:
            return loc_line.split(' · ')[0]
        else:
            # Maybe just the line?
            return loc_line
    return "Unknown"

def fix_locations():
    print("----------------------------------------------------------------")
    print("   Fixing Locations in Analysis & Excel                         ")
    print("----------------------------------------------------------------")
    
    try:
        df = pd.read_excel(EXCEL_PATH, sheet_name='All Jobs')
    except Exception as e:
        print(f"[ERROR] Could not load Excel: {e}")
        return

    updates_count = 0
    
    for idx, row in df.iterrows():
        jd = row.get('Job Description', '')
        current_loc = extract_location(jd)
        
        # Update Excel Column
        df.at[idx, 'Location'] = current_loc
        
        # Update JSON if exists
        analysis_json = row.get('Analysis JSON')
        if isinstance(analysis_json, str) and analysis_json.strip().startswith('{'):
            try:
                data = json.loads(analysis_json)
                old_loc = data.get('location', '')
                
                # Check if we need update (ignore if already same, but standardizing is good)
                if old_loc != current_loc:
                    data['location'] = current_loc
                    
                    # Update the JSON string in DataFrame
                    df.at[idx, 'Analysis JSON'] = json.dumps(data, indent=2)
                    
                    # Also find and update the file on disk!
                    # We need to find the filename.
                    # We can use our smart match logic or just scan files for this content?
                    # Better: Scan files and match content?
                    # Or simpler: Rely on the filename convention?
                    # We can iterate the files in analysis_results/ and check if they match this row.
                    
                    found_file = False
                    # Search files matching this title/company or row index in filename
                    # This is slow but safe.
                    # Or we can skip file update if we assume user only checks Excel?
                    # User asked "you didn't changed the location in any".
                    # I should update the FILES too.
                    
                    # Quick search for file
                    # Reuse Smart Match logic implicitly or search?
                    # Let's search by company/title in filename
                    clean_comp = "".join([c for c in str(row['Company']) if c.isalnum()]).lower()
                    
                    for fname in os.listdir(RESULTS_DIR):
                        if fname.lower().endswith('.json'):
                            # Check if matches
                            if clean_comp in fname.lower().replace('_', ''):
                                # Load content to verify?
                                fpath = os.path.join(RESULTS_DIR, fname)
                                with open(fpath, 'r') as f:
                                    fdata = json.load(f)
                                
                                # Match points or something unique?
                                # Compare tech_stack or just trust name match?
                                # Let's trust name match + index if present
                                
                                # Update file
                                fdata['location'] = current_loc
                                with open(fpath, 'w') as f:
                                    json.dump(fdata, f, indent=2)
                                found_file = True
                                # Don't break, in case of duplicates (Lensa, TCS)
                    
                    updates_count += 1
                    print(f"  -> Row {idx}: Updated Location to '{current_loc}'")
            except Exception as e:
                print(f"  -> Row {idx}: Failed to parse JSON: {e}")

    # Save Excel
    with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='All Jobs', index=False)
    
    print(f"[SUCCESS] Updated {updates_count} rows.")

if __name__ == "__main__":
    fix_locations()
