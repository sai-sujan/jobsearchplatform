import pandas as pd
import os
import json

df = pd.read_excel('jobs_master.xlsx', sheet_name='All Jobs')

# Update Row 6 (VRPRO)
p6 = os.path.abspath("analysis_results/6_VRPRO_IT_AI_ML_Engineer.json")
with open(p6, 'r') as f: d6 = json.load(f)
df.at[6, 'Analysis File'] = p6
df.at[6, 'Analysis JSON'] = json.dumps(d6)
df.at[6, 'Skill Score'] = d6['ats_score']

# Update Row 7 (Southwire)
p7 = os.path.abspath("analysis_results/7_Southwire_Company_PT_Professional_AI_ML_Engineer.json")
with open(p7, 'r') as f: d7 = json.load(f)
df.at[7, 'Analysis File'] = p7
df.at[7, 'Analysis JSON'] = json.dumps(d7)
df.at[7, 'Skill Score'] = d7['ats_score']

# Update Row 8 (EVONA)
p8 = os.path.abspath("analysis_results/8_EVONA_Sensor_Fusion_Machine_Learning_Engineer.json")
with open(p8, 'r') as f: d8 = json.load(f)
df.at[8, 'Analysis File'] = p8
df.at[8, 'Analysis JSON'] = json.dumps(d8)
df.at[8, 'Skill Score'] = d8['ats_score']

df.to_excel('jobs_master.xlsx', sheet_name='All Jobs', index=False)
print("Updated Rows 6, 7, 8 in Excel.")
