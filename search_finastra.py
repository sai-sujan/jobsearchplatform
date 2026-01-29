import pandas as pd
import glob
import os

BACKUP_DIR = "outputs"

def search_finastra():
    print("🔎 Searching for Finastra in all backups...")
    backup_files = glob.glob(os.path.join(BACKUP_DIR, "**/*.xlsx"), recursive=True)
    
    found_any = False
    
    for bk_path in backup_files:
        try:
            if "~$" in bk_path: continue
            
            # Read backup (try different engines/formats if needed, but default is usually ok)
            try:
                df = pd.read_excel(bk_path)
            except:
                continue
                
            # Normalize column names
            c_col = None
            if 'Company' in df.columns: c_col = 'Company'
            elif 'Company Name' in df.columns: c_col = 'Company Name'
            
            if not c_col: continue
            
            # Filter for Finastra
            finastra_jobs = df[df[c_col].astype(str).str.contains('Finastra', case=False, na=False)]
            
            if not finastra_jobs.empty:
                print(f"✅ Found Finastra in {bk_path} ({len(finastra_jobs)} rows)")
                
                # Check description validity
                d_col = None
                if 'Job Description' in df.columns: d_col = 'Job Description'
                elif 'Description' in df.columns: d_col = 'Description'
                
                if d_col:
                    valid_desc = finastra_jobs[finastra_jobs[d_col].astype(str).str.len() > 50]
                    if not valid_desc.empty:
                        print(f"   🎉 HAS VALID DESCRIPTION! ({len(valid_desc)} rows)")
                        found_any = True
                        # Print one desc snippet
                        print(f"   Snippet: {str(valid_desc.iloc[0][d_col])[:100]}...")
                    else:
                        print("   ❌ Descriptions are empty/short.")
                else:
                    print("   ❌ No Description column.")
                    
        except Exception as e:
            continue

    if not found_any:
        print("🛑 Finastra NOT found with valid description in any backup.")

if __name__ == "__main__":
    search_finastra()
