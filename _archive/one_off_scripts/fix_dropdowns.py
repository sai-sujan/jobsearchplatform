#!/usr/bin/env python3
"""Fix date/time inputs to select dropdowns and update status dropdown styling"""

# Read the file
with open('dashboard/src/App.jsx', 'r') as f:
    lines = f.readlines()

# Find and fix the date input (around line 325-332)
for i in range(len(lines)):
    # Fix date input
    if 'Filter by Date</label>' in lines[i]:
        # Check if next few lines have input type="date"
        for j in range(i+1, min(i+10, len(lines))):
            if 'type="date"' in lines[j]:
                # Found the date input, replace it with select
                # Find the closing tag
                end_idx = j
                while end_idx < len(lines) and '/>' not in lines[end_idx]:
                    end_idx += 1
                
                # Replace with select dropdown
                new_content = '''          <select 
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          >
            <option value="">All Dates</option>
            {uniqueDates.map(date => (
              <option key={date} value={date}>
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
              </option>
            ))}
          </select>
'''
                lines[j:end_idx+1] = [new_content]
                break
    
    # Fix time input
    if 'Filter by Time</label>' in lines[i]:
        # Check if next few lines have input type="time"
        for j in range(i+1, min(i+10, len(lines))):
            if 'type="time"' in lines[j]:
                # Found the time input, replace it with select
                end_idx = j
                while end_idx < len(lines) and '/>' not in lines[end_idx]:
                    end_idx += 1
                
                # Replace with select dropdown
                new_content = '''          <select 
            value={filterTime}
            onChange={(e) => setFilterTime(e.target.value)}
          >
            <option value="">All Times</option>
            {uniqueTimes.map(time => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
'''
                lines[j:end_idx+1] = [new_content]
                break
    
    # Fix status dropdown styling
    if 'Application Status:' in lines[i]:
        # Look for the select tag with inline styles
        for j in range(i, min(i+15, len(lines))):
            if '<select' in lines[j] and 'jobStatuses' in lines[j]:
                # Found it, need to replace inline style with className
                # Find the end of the select opening tag
                end_idx = j
                while end_idx < len(lines) and '>' not in lines[end_idx]:
                    end_idx += 1
                
                # Replace with className version
                new_select = '''                  <select 
                    value={jobStatuses[job.Link] || 'not_applied'}
                    onChange={(e) => handleStatusChange(job.Link, e.target.value)}
                    className="status-select"
                  >
'''
                lines[j:end_idx+1] = [new_select]
                
                # Also update the label
                lines[i-2] = '                <div style={{marginTop: \'12px\', paddingTop: \'12px\', borderTop: \'1px solid #e5e7eb\'}}>\n'
                lines[i-1] = '                  <label style={{fontSize: \'0.8rem\', color: \'#6b7280\', marginBottom: \'6px\', display: \'block\', fontWeight: 500}}>\n'
                lines[i] = '                    Status:\n'
                break

# Write back
with open('dashboard/src/App.jsx', 'w') as f:
    f.writelines(lines)

print("✅ Fixed date/time dropdowns and status styling!")
