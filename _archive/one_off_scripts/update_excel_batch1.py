import pandas as pd
import os
import json

df = pd.read_excel('jobs_master.xlsx', sheet_name='All Jobs')

def update_row(idx, filename):
    path = os.path.abspath(f"analysis_results/{filename}")
    if os.path.exists(path):
        with open(path, 'r') as f: data = json.load(f)
        df.at[idx, 'Analysis File'] = path
        df.at[idx, 'Analysis JSON'] = json.dumps(data)
        df.at[idx, 'Skill Score'] = data.get('ats_score', 0)
        df.at[idx, 'Location'] = data.get('location', '')
        print(f"Updated Row {idx}: {filename}")
    else:
        print(f"File missing for Row {idx}: {filename}")

update_row(0, '0_Hydrogen_Group_AI_ML_Engineer.json')
update_row(1, '1_Finastra_AI_Engineer.json')
update_row(2, '2_Finastra_AI_Engineer_2.json')

df.to_excel('jobs_master.xlsx', sheet_name='All Jobs', index=False)
