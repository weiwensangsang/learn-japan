from pathlib import Path
import re,json,collections,hashlib,itertools,sys
from sudachipy import dictionary,tokenizer
ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/jlpt-n1-analysis')
tok=dictionary.Dictionary().create()
counts=collections.Counter(); docs=collections.defaultdict(set); raw=set(); oov=collections.Counter(); summaries=[]; seen=set(); duplicates=[]
for p in sorted(ROOT.glob('*.pdf')):
    q=p.with_suffix('.ocr.txt') if p.with_suffix('.ocr.txt').exists() else p.with_suffix('.txt')
    if not q.exists():continue
    text=q.read_text()
    # Some answer/script PDFs begin with Chinese explanations. Keep only the
    # listening transcript when the explicit section heading is present.
    marker=re.search(r'听\s*力\s*原\s*文',text)
    if marker and text[:marker.start()].count('解析')>=3:text=text[marker.end():]
    digest=hashlib.sha256(re.sub(r'\s+','',text).encode()).hexdigest()
    if digest in seen:duplicates.append(p.name);continue
    seen.add(digest)
    if len(re.findall(r'[\u3040-\u30ff]',text))<100:continue
    lines=[]
    for line in text.splitlines():
        line=re.sub(r'^(?:男|女)(?:[１２12])?\s*[：:]\s*','',line)
        if re.fullmatch(r'\s*(?:問題|問|正解|答案|読解|聴解|听解|听力原文)\s*[0-9０-９一二三四五]*\s*',line):continue
        if not re.search(r'[\u3040-\u30ff\u4e00-\u9fff]',line):continue
        if any(w in line for w in ['成都帝京','日语能力','内部资料','环球中心','春熙路','答案解析','日语学习','正确答案','参考答案','日本留学','www.','http','微信公众号']):continue
        if re.search(r'[语译释说这该试词听读选对]',line) and not re.search(r'[\u3040-\u30ff]',line):continue
        line=re.sub(r'([\u3040-\u30ff\u4e00-\u9fff])\s+([\u3040-\u30ff\u4e00-\u9fff])',r'\1\2',line)
        lines.append(line)
    c=collections.Counter()
    for m in itertools.chain.from_iterable(tok.tokenize(line,tokenizer.Tokenizer.SplitMode.C) for line in lines):
        pos=m.part_of_speech(); lemma=m.normalized_form()
        if not re.search(r'[\u3040-\u30ff\u4e00-\u9fff]',lemma):continue
        if pos[0] in ['補助記号','空白','記号'] or pos[1]=='数詞':continue
        if m.is_oov():oov[lemma]+=1;continue
        raw.add((lemma,pos[0]))
        if pos[0] not in ['名詞','代名詞','動詞','形容詞','形状詞','副詞','接続詞','感動詞'] or pos[1]=='固有名詞':continue
        c[lemma]+=1; docs[lemma].add(p.stem[:7])
    counts.update(c)
    summaries.append({'file':p.name,'used_text':q.name,'content_lemmas':len(c),'content_tokens':sum(c.values())})
total=sum(counts.values()); top=sum(n for _,n in counts.most_common(2000))
result={'scope':'Available files only, not certified complete ten-year corpus','split_mode':'Sudachi C','dictionary':'sudachidict_core 20260723.1','files_used':len(summaries),'exam_dates':len({x['file'][:7] for x in summaries}),'known_lemma_pos_types':len(raw),'known_content_lemmas':len(counts),'content_tokens':total,'top2000_content_token_coverage':top/total if total else None,'oov_types':len(oov),'duplicates':duplicates,'files':summaries}
(ROOT/'stats.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
with (ROOT/'vocabulary.tsv').open('w') as f:
    f.write('lemma\tcount\texam_dates\n')
    for word,n in counts.most_common():f.write(f'{word}\t{n}\t{len(docs[word])}\n')
print(json.dumps({k:v for k,v in result.items() if k!='files'},ensure_ascii=False,indent=2))
