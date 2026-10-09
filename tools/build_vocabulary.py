"""Validate the 2,000-word CSV and rebuild its reading views."""
import collections
import csv
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'vocabulary'
with (OUT / 'core-2000.csv').open(encoding='utf-8-sig', newline='') as source:
    rows = list(csv.DictReader(source))

assert len(rows) == 2000, 'Expected exactly 2,000 rows'
assert [int(r['id']) for r in rows] == list(range(1, 2001))
assert len({r['jmdict_id'] for r in rows}) == 2000
assert len({(r['word'], r['reading']) for r in rows}) == 2000
for row in rows:
    for field in ['word', 'reading', 'romaji', 'meaning_zh', 'gloss_en', 'jmdict_id']:
        assert row[field].strip(), (row['id'], field)
    assert re.search(r'[\u4e00-\u9fff]', row['meaning_zh']), row['id']
    assert re.fullmatch(r'[\u3040-\u30ff／]+', row['reading']), row['id']
    index = int(row['id'])
    expected_day = 1 + (index - 1) // 143 if index <= 1716 else 13 + (index - 1717) // 142
    assert int(row['day']) == expected_day, row['id']
counts = collections.Counter(int(row['day']) for row in rows)
assert counts == {**{day: 143 for day in range(1, 13)}, 13: 142, 14: 142}


def table(group):
    text = '| 编号 | 词语 | 假名读音 | 罗马字 | 中文简义 |\n'
    text += '| ---: | --- | --- | --- | --- |\n'
    for row in group:
        text += '| ' + ' | '.join(
            row[key].replace('|', '／').replace('\n', ' ')
            for key in ['id', 'word', 'reading', 'romaji', 'meaning_zh']
        ) + ' |\n'
    return text


master = '# 两周核心2000词总表\n\n'
master += '用于面向 N1 的第一轮快速浏览，只求见过、眼熟；这是首批学习词，不是官方 N1 完整词表。\n\n'
master += '词条、读音及英文对照使用 JMdict／EDRDG 数据，版权属于 James William BREEN 与 EDRDG，依 CC BY-SA 4.0 使用。本词表数据也按 CC BY-SA 4.0 分享。中文简义含机器辅助及人工修订。来源与限制见[词表说明](README.md)。\n\n'
for day in range(1, 15):
    group = [r for r in rows if int(r['day']) == day]
    description = f'编号 {group[0]["id"]}–{group[-1]["id"]}，共 {len(group)} 词。'
    master += f'## 第 {day} 天\n\n{description}\n\n' + table(group) + '\n'
    daily = f'# 第{day}天核心词浏览\n\n{description}用 30 分钟浏览，不测验、不要求当场记熟；疑问留给具体词条解释。\n\n'
    daily += '[词表说明与来源](../README.md) · [完整词表](../core-2000.md)\n\n'
    (OUT / 'days' / f'day-{day:02d}.md').write_text(daily + table(group), encoding='utf-8')
(OUT / 'core-2000.md').write_text(master.rstrip() + '\n', encoding='utf-8')
print('Validated 2,000 unique entries; rebuilt full table and all 14 daily lists.')
