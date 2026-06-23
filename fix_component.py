import re

with open('src/components/CleanerDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the component at the end
pattern = r'// ── CHECK-IN / FINISH BUTTONS.*?\n\}\;'
match = re.search(pattern, content, re.DOTALL)
if match:
    component = match.group(0)
    # Remove from end
    content = content[:match.start()] + content[match.end():]
    # Insert before export const CleanerDashboard
    insert_point = content.find('export const CleanerDashboard')
    content = content[:insert_point] + component + '\n\n' + content[insert_point:]
    with open('src/components/CleanerDashboard.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Done')
else:
    print('Component not found')
