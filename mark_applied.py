#!/usr/bin/env python3
"""
Interactive Job Application Tracker
Mark jobs as "Applied" and save to Excel
"""

import pandas as pd
import os
from datetime import datetime

EXCEL_FILE = 'jobs_master.xlsx'

def clear_screen():
    """Clear terminal screen"""
    os.system('clear' if os.name == 'posix' else 'cls')

def show_unapplied_jobs(df):
    """Display jobs that haven't been applied to"""
    unapplied = df[df['Applied'] != 'Applied'].copy()
    
    if len(unapplied) == 0:
        print("🎉 You've applied to all jobs!")
        return None
    
    print(f"\n📋 {len(unapplied)} Jobs Available to Apply:\n")
    print("=" * 100)
    
    for idx, row in unapplied.iterrows():
        skill_score = row.get('Skill Score', 0)
        tier = row.get('Tier', '')
        company = row.get('Company', 'Unknown')[:30]
        title = row.get('Title', 'Unknown')[:50]
        new_marker = ' ✨' if row.get('New') == '✨ NEW' else ''
        
        print(f"{idx:3d}. [{skill_score:3.0f}%] {tier:15s} {company:30s} | {title}{new_marker}")
    
    print("=" * 100)
    return unapplied

def mark_as_applied(df, indices):
    """Mark specified jobs as Applied"""
    for idx in indices:
        if idx in df.index:
            df.at[idx, 'Applied'] = 'Applied'
    return df

def save_excel(df):
    """Save DataFrame back to Excel"""
    try:
        with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl') as writer:
            # Sheet 1: All Jobs
            df.to_excel(writer, sheet_name='All Jobs', index=False)
            
            # Sheet 2: Top Matches
            top_matches = df[df['Skill Score'] >= 70].copy()
            top_matches = top_matches.sort_values('Skill Score', ascending=False)
            top_matches.to_excel(writer, sheet_name='Top Matches', index=False)
            
            # Sheet 3: Applied
            applied = df[df['Applied'] == 'Applied'].copy()
            applied.to_excel(writer, sheet_name='Applied', index=False)
        
        print(f"✅ Excel file updated: {EXCEL_FILE}")
        return True
    except Exception as e:
        print(f"❌ Error saving file: {e}")
        return False

def main():
    clear_screen()
    print("=" * 100)
    print("  📊 JOB APPLICATION TRACKER - Mark Jobs as Applied")
    print("=" * 100)
    
    # Load Excel
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name='All Jobs')
        print(f"✅ Loaded {len(df)} jobs from {EXCEL_FILE}\n")
    except Exception as e:
        print(f"❌ Error loading Excel: {e}")
        return
    
    while True:
        # Show unapplied jobs
        unapplied = show_unapplied_jobs(df)
        if unapplied is None:
            break
        
        print("\n📝 Commands:")
        print("  • Enter job numbers (comma-separated): 1,5,12")
        print("  • 'filter 90' - Show only 90%+ matches")
        print("  • 'new' - Show only new jobs (✨ NEW)")
        print("  • 'save' - Save and exit")
        print("  • 'quit' - Exit without saving")
        
        choice = input("\n👉 Your choice: ").strip().lower()
        
        if choice == 'quit':
            print("👋 Exiting without saving...")
            break
        
        elif choice == 'save':
            if save_excel(df):
                print("✅ All changes saved!")
            break
        
        elif choice == 'new':
            clear_screen()
            new_jobs = df[df['New'] == '✨ NEW'].copy()
            print(f"\n✨ {len(new_jobs)} NEW Jobs:\n")
            for idx, row in new_jobs.iterrows():
                print(f"{idx:3d}. [{row['Skill Score']:3.0f}%] {row['Company'][:30]:30s} | {row['Title'][:50]}")
            input("\nPress Enter to continue...")
            clear_screen()
        
        elif choice.startswith('filter'):
            try:
                threshold = int(choice.split()[1])
                clear_screen()
                filtered = df[df['Skill Score'] >= threshold].copy()
                print(f"\n🎯 {len(filtered)} Jobs with {threshold}%+ match:\n")
                for idx, row in filtered.iterrows():
                    applied_mark = '✓' if row['Applied'] == 'Applied' else ' '
                    print(f"[{applied_mark}] {idx:3d}. [{row['Skill Score']:3.0f}%] {row['Company'][:30]:30s} | {row['Title'][:50]}")
                input("\nPress Enter to continue...")
                clear_screen()
            except:
                print("❌ Invalid filter command. Use: filter 90")
        
        else:
            # Parse job numbers
            try:
                indices = [int(x.strip()) for x in choice.split(',')]
                
                # Validate indices
                valid_indices = [i for i in indices if i in df.index]
                invalid_indices = [i for i in indices if i not in df.index]
                
                if invalid_indices:
                    print(f"⚠️  Invalid job numbers: {invalid_indices}")
                
                if valid_indices:
                    # Show what will be marked
                    print(f"\n📝 Marking {len(valid_indices)} jobs as Applied:")
                    for idx in valid_indices:
                        print(f"  ✓ {df.at[idx, 'Company']} - {df.at[idx, 'Title'][:50]}")
                    
                    confirm = input("\nConfirm? (y/n): ").strip().lower()
                    if confirm == 'y':
                        df = mark_as_applied(df, valid_indices)
                        print(f"✅ Marked {len(valid_indices)} jobs as Applied!")
                        
                        # Auto-save after each update
                        save_excel(df)
                        input("\nPress Enter to continue...")
                    
                clear_screen()
                
            except ValueError:
                print("❌ Invalid input. Use comma-separated numbers like: 1,5,12")
                input("\nPress Enter to continue...")
                clear_screen()

if __name__ == "__main__":
    main()
