"""
Excel to JSON Converter for Dashboard
Reads jobs_master.xlsx and creates dashboard_data.json
"""

import pandas as pd
import json
from datetime import datetime

def convert_excel_to_json():
    """Convert jobs_master.xlsx to JSON for dashboard"""
    
    try:
        # Read Excel file
        df = pd.read_excel('jobs_master.xlsx', sheet_name='All Jobs')
        
        # Convert to dict and handle NaN values
        jobs = df.to_dict('records')
        
        # Clean up data
        for job in jobs:
            for key, value in job.items():
                if pd.isna(value):
                    job[key] = '' if isinstance(value, str) else 0
        
        # Calculate statistics
        total_jobs = len(jobs)
        yes_jobs = len([j for j in jobs if j.get('Verdict') == 'YES'])
        good_matches = len([j for j in jobs if j.get('Skill Score', 0) >= 70])
        perfect_matches = len([j for j in jobs if j.get('Skill Score', 0) >= 90])
        
        # Create dashboard data
        dashboard_data = {
            'jobs': jobs,
            'stats': {
                'total': total_jobs,
                'yes_verdict': yes_jobs,
                'good_matches': good_matches,
                'perfect_matches': perfect_matches,
                'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
        }
        
        # Save to JSON
        with open('dashboard_data.json', 'w') as f:
            json.dump(dashboard_data, f, indent=2)
        
        print(f"✅ Converted {total_jobs} jobs to dashboard_data.json")
        print(f"   • Good matches (70%+): {good_matches}")
        print(f"   • Perfect matches (90%+): {perfect_matches}")
        
    except FileNotFoundError:
        print("❌ jobs_master.xlsx not found. Run find_jobs.py first.")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    convert_excel_to_json()
