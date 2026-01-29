import pandas as pd
import glob
import os

MASTER_PATH = "jobs_master.xlsx"
BACKUP_DIR = "outputs"

def restore_descriptions():
    print("🚑 Starting Description Recovery...")
    
    # 1. Load Master
    try:
        df_master = pd.read_excel(MASTER_PATH, sheet_name='All Jobs')
        print(f"[INFO] Loaded Master: {len(df_master)} rows")
    except Exception as e:
        print(f"[ERROR] Loading Master failed: {e}")
        return

    # 2. Find all backups
    backup_files = glob.glob(os.path.join(BACKUP_DIR, "**/*.xlsx"), recursive=True)
    print(f"[INFO] Found {len(backup_files)} backup files to scan.")
    
    # 3. Build Comparison Map
    desc_map = {}
    
    for bk_path in backup_files:
        try:
            if "~$" in bk_path: continue
            
            try:
                bk_df = pd.read_excel(bk_path)
            except:
                continue
                
            # Column Normalization
            c_col = 'Company'
            if 'Company Name' in bk_df.columns: c_col = 'Company Name'
            
            t_col = 'Title'
            if 'Job Title' in bk_df.columns: t_col = 'Job Title'
            
            # Check for Description Column
            d_col = None
            if 'Job Description' in bk_df.columns: d_col = 'Job Description'
            elif 'Description' in bk_df.columns: d_col = 'Description'
            
            if not d_col: continue
            
            for _, row in bk_df.iterrows():
                desc = str(row.get(d_col, ''))
                if len(desc) < 50 or desc.lower() == 'nan':
                    continue
                    
                c_val = row.get(c_col, '')
                t_val = row.get(t_col, '')
                
                if pd.isna(c_val): c_val = ''
                if pd.isna(t_val): t_val = ''
                
                company = str(c_val).lower().strip()
                title = str(t_val).lower().strip()
                
                if not company or not title: continue
                
                key = (company, title)
                if key not in desc_map:
                    desc_map[key] = desc
                    
        except Exception as e:
            continue
            
    print(f"[INFO] Constructed Index with {len(desc_map)} descriptions.")
    
    # 4. Restore
    restored_count = 0
    matched_keys = set()
    
    # Helper to clean string
    def clean_str(s):
        return "".join([c for c in s if c.isalnum()]).lower()

    # Pre-compute cleaned keys for Map
    clean_map = {}
    for k, v in desc_map.items():
        ck = (clean_str(k[0]), clean_str(k[1]))
        clean_map[ck] = v

    for idx, row in df_master.iterrows():
        current_desc = str(row.get('Job Description', ''))
        
        # If missing/short
        if len(current_desc) < 50 or current_desc.lower() == 'nan':
            c_val = str(row.get('Company', '')).lower().strip()
            t_val = str(row.get('Title', '')).lower().strip()
            
            # Strategy 1: Exact Match
            key = (c_val, t_val)
            found_desc = desc_map.get(key)
            
            # Strategy 2: Clean Match
            if not found_desc:
                ck = (clean_str(c_val), clean_str(t_val))
                found_desc = clean_map.get(ck)
            
            # Strategy 3: Company Match + Title Substring
            if not found_desc:
                # Iterate all map keys (slow but fine for 60 rows)
                best_match = None
                for (mc, mt), desc in desc_map.items():
                    if mc == c_val or clean_str(mc) == clean_str(c_val):
                        # Company matches. Check title.
                        if mt in t_val or t_val in mt:
                            found_desc = desc
                            break
                        # Check clean title subset
                        if clean_str(mt) in clean_str(t_val) or clean_str(t_val) in clean_str(mt):
                            found_desc = desc
                            break

            if found_desc:
                df_master.at[idx, 'Job Description'] = found_desc
                restored_count += 1
                matched_keys.add(key)
            else:
                if idx < 3:
                     pass # print(f"[DEBUG] Failed to Match Row {idx}: {key}")

    print(f"[SUCCESS] Restored {restored_count} descriptions.")
    
    # 5. Save
    if restored_count > 0:
        df_master.to_excel(MASTER_PATH, index=False, sheet_name='All Jobs')
        print("[SAVED] Updated jobs_master.xlsx")
        
        df_master.to_csv('jobs_temp.csv', index=False)
        print("[SAVED] Updated jobs_temp.csv")
    else:
        # Save CSV anyway if Descriptions are now present (maybe manual match failed but map empty?)
        if len(desc_map) > 0:
             print("[WARN] Map validation passed but no rows updated? Check keys.")

if __name__ == "__main__":
    restore_descriptions()
