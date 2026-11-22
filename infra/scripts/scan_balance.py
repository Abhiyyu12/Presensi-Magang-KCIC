import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'apps/api/prisma/seed.ts'
src = open(path, encoding='utf8').read()
clean = re.sub(r"'(?:\\.|[^'\\])*'", "''", src)
clean = re.sub(r'"(?:\\.|[^"\\])*"', '""', clean)
clean = re.sub(r'//[^\n]*', '', clean)
lines = src.split('\n')
for i, line in enumerate(clean.split('\n'), 1):
    s = line.rstrip()
    if not s.endswith(';'):
        continue
    bal = sum(1 for c in s if c in '{([') - sum(1 for c in s if c in '})]')
    if bal != 0:
        print(f'line {i} bal {bal}: {lines[i-1][:220]}')
