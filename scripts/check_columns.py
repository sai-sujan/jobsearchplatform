
import pandas as pd

excel_path = "/Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications/jobs_master.xlsx"
df = pd.read_excel(excel_path)
print("Columns:", list(df.columns))
print("First row samples:")
print(df.iloc[0])
