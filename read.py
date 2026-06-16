import json
from typing import List, Dict, Any, Tuple, Optional

MORPH_MAP = {
    "Plural": "s",
    "Possessive": "z",
    "3rd Person Singular": "3s",
    "Past Tense": "ed",
    "Past Participle": "en",
    "Progressive": "ing",
}
MORPH_INV = {v: k for k, v in MORPH_MAP.items()}

def _reconstruct_surface(lemma: str, suf: str) -> str:

    if suf == "z":
        return lemma + "'s"
    elif suf == "3s":
        return lemma + "s"
    else:
        return lemma + suf

def json_to_salt(json_text: str, pause_tol: float = 0.12) -> str:
    data = json.loads(json_text)

    words_meta: List[Dict[str, Any]] = data.get("words", [])
    base_tokens: List[str] = [w.get("word", "") for w in words_meta] if words_meta else (data.get("text", "") or "").split()
    n = len(base_tokens)
    if n == 0:
        return ""

    morphemes = data.get("morphemes", []) or []
    tokens = base_tokens[:]
    for m in morphemes:
        idx = m.get("index")
        if isinstance(idx, int) and 0 <= idx < n:
            form = m.get("morpheme_form")
            infl = m.get("inflectional_morpheme")
            if form == "<IRR>":
                continue
            suf = MORPH_MAP.get(infl)
            if suf:
                lemma = m.get("lemma") or tokens[idx]
                tokens[idx] = f"{lemma}/{suf}"

    def merge_adjacent_spans(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not items:
            return []
        spans = []
        for it in items:
            ws = sorted([w for w in it.get("words", []) if isinstance(w, int)])
            if ws:
                spans.append({"words": ws})
        spans.sort(key=lambda x: x["words"][0])

        merged = [spans[0]]
        for sp in spans[1:]:
            prev = merged[-1]
            if prev["words"][-1] + 1 == sp["words"][0]:
                prev["words"].extend(sp["words"])
            else:
                merged.append(sp)

        for sp in merged:
            ws = sorted(sp["words"])
            sp["words"] = ws
            sp["mark_location"] = ws[-1]
            sp["content"] = " ".join(tokens[i] for i in ws if 0 <= i < n)
        return merged

    reps_merged = merge_adjacent_spans(data.get("repetitions", []) or [])
    revs_merged = merge_adjacent_spans(data.get("revisions", []) or [])
    mazes_merged = merge_adjacent_spans(data.get("mazes", []) or [])

    before_marks: List[List[str]] = [[] for _ in range(n)]
    after_marks:  List[List[str]] = [[] for _ in range(n)]
    covered = [False] * n

    def add_paren_for_spans(spans: List[Dict[str, Any]]):
        for sp in spans:
            ws = sp["words"]
            if not ws: continue
            s, e = ws[0], ws[-1]
            if 0 <= s < n: before_marks[s].append("(")
            if 0 <= e < n: after_marks[e].append(")")
            for k in ws:
                if 0 <= k < n: covered[k] = True

    add_paren_for_spans(reps_merged)
    add_paren_for_spans(revs_merged)
    add_paren_for_spans(mazes_merged)

    filler_list = data.get("fillerwords", []) or []
    used_filler_idx = set()

    def find_token_index_for_filler(fil: Dict[str, Any]) -> Optional[int]:
        content = (fil.get("content") or "").strip()
        st, ed = fil.get("start"), fil.get("end")
        if words_meta and isinstance(st, (int, float)) and isinstance(ed, (int, float)):
            for i, wm in enumerate(words_meta):
                wst, wed = wm.get("start"), wm.get("end")
                if isinstance(wst, (int, float)) and isinstance(wed, (int, float)):
                    if (wst >= st - pause_tol) and (wed <= ed + pause_tol):
                        return i
        if content:
            content_low = content.lower()
            for i, tk in enumerate(tokens):
                if i in used_filler_idx: continue
                if tk.lower() == content_low:
                    return i
        return None

    for fil in filler_list:
        idx = find_token_index_for_filler(fil)
        if idx is None or not (0 <= idx < n): continue
        if not covered[idx]:
            before_marks[idx].append("(")
            after_marks[idx].append(")")
            covered[idx] = True
        used_filler_idx.add(idx)

    pauses = data.get("pauses", []) or []
    pauses_after: List[List[str]] = [[] for _ in range(n)]
    pre_pauses: List[str] = []

    gaps: List[Tuple[int, float, float]] = []
    if words_meta:
        first_st = words_meta[0].get("start")
        if isinstance(first_st, (int, float)):
            gaps.append((-1, float("-inf"), first_st))
        for i in range(n - 1):
            a_end = words_meta[i].get("end")
            b_st = words_meta[i + 1].get("start")
            if isinstance(a_end, (int, float)) and isinstance(b_st, (int, float)) and b_st >= a_end:
                gaps.append((i, a_end, b_st))
        last_ed = words_meta[-1].get("end")
        if isinstance(last_ed, (int, float)):
            gaps.append((n - 1, last_ed, float("inf")))

    def assign_pause_to_gap(p: Dict[str, Any]) -> Optional[int]:
        st, ed = p.get("start"), p.get("end")
        if not isinstance(st, (int, float)) or not isinstance(ed, (int, float)) or not gaps:
            return None
        for after_i, gst, ged in gaps:
            cond_st = (gst == float("-inf") and ed <= gst + pause_tol) or abs(gst - st) <= pause_tol
            cond_ed = (ged == float("inf") and st >= ged - pause_tol) or abs(ged - ed) <= pause_tol
            if cond_st and cond_ed:
                return after_i
        pmid = (st + ed) / 2.0
        best_after, best_dist = None, float("inf")
        for after_i, gst, ged in gaps:
            gs = gst if gst != float("-inf") else ed
            ge = ged if ged != float("inf") else st
            if gs > ge: continue
            gmid = (gs + ge) / 2.0
            d = abs(gmid - pmid)
            if d < best_dist:
                best_dist, best_after = d, after_i
        return best_after

    for p in pauses:
        d = p.get("duration")
        if not isinstance(d, (int, float)):
            st, ed = p.get("start"), p.get("end")
            if isinstance(st, (int, float)) and isinstance(ed, (int, float)):
                d = max(0.0, ed - st)
            else:
                continue
        tag = f":{round(float(d) + 1e-9, 1):.1f}"
        slot = assign_pause_to_gap(p) if words_meta else None
        if slot is None:
            pauses_after[-1].append(tag)
        elif slot == -1:
            pre_pauses.append(tag)
        else:
            pauses_after[slot].append(tag)

    out: List[str] = []
    out.extend(pre_pauses)
    for i, tk in enumerate(tokens):
        pre = "".join(before_marks[i])
        post = "".join(after_marks[i])
        out.append(f"{pre}{tk}{post}")
        if pauses_after[i]:
            out.extend(pauses_after[i])
    return " ".join(out)

def _parse_salt(salt_text: str):
    raw_tokens = salt_text.strip().split()
    words: List[str] = []
    mazes: List[Dict[str, Any]] = []
    morphemes: List[Dict[str, Any]] = []
    pauses_with_gap: List[Tuple[int, float]] = []
    first_token_is_pause = bool(raw_tokens and raw_tokens[0].startswith(":"))

    active_maze_start: Optional[int] = None
    word_index = 0
    current_gap = -1

    def _strip_parens(tok: str) -> Tuple[int, str, int]:
        lead = 0
        while tok.startswith("("):
            lead += 1
            tok = tok[1:]
        trail = 0
        while tok.endswith(")") and tok != ")":
            trail += 1
            tok = tok[:-1]
        if tok == ")":
            tok = ""
            trail += 1
        return lead, tok, trail

    for tok in raw_tokens:
        if tok.startswith(":"):
            try:
                dur = float(tok[1:])
                pauses_with_gap.append((current_gap, round(dur, 1)))
            except ValueError:
                pass
            continue

        lead, core, trail = _strip_parens(tok)
        if lead > 0 and active_maze_start is None:
            active_maze_start = word_index

        if core:
            words.append(core)
            if "/" in core:
                parts = core.split("/")
                if len(parts) == 2 and parts[1] in MORPH_INV:
                    lemma, suf = parts
                    morphemes.append({
                        "word": _reconstruct_surface(lemma, suf),
                        "lemma": lemma,
                        "index": word_index,
                        "inflectional_morpheme": MORPH_INV[suf],
                        "morpheme_form": f"/{suf}"
                    })
            word_index += 1
            current_gap = word_index - 1

        if trail > 0 and active_maze_start is not None:
            s = active_maze_start
            e = word_index - 1
            if e >= s:
                span = list(range(s, e + 1))
                content = " ".join(words[i] for i in span)
                mazes.append({"content": content, "words": span, "mark_location": e})
            active_maze_start = None

    return {
        "text": " ".join(words),
        "words": words,
        "mazes": mazes,
        "pauses_with_gap": pauses_with_gap,
        "morphemes": morphemes,
        "first_token_is_pause": first_token_is_pause,
    }

def _edit_align(ref: List[str], new: List[str]) -> List[Tuple[str, Optional[int], Optional[int]]]:
    m, n = len(ref), len(new)
    dp = [[0]*(n+1) for _ in range(m+1)]
    bt = [[None]*(n+1) for _ in range(m+1)]
    for i in range(m+1):
        dp[i][0] = i
        if i > 0: bt[i][0] = ("D", i-1, None)
    for j in range(n+1):
        dp[0][j] = j
        if j > 0: bt[0][j] = ("I", None, j-1)
    for i in range(1, m+1):
        for j in range(1, n+1):
            if ref[i-1] == new[j-1]:
                dp[i][j] = dp[i-1][j-1]
                bt[i][j] = ("M", i-1, j-1)
            else:
                cands = [
                    (dp[i-1][j-1]+1, ("R", i-1, j-1)),
                    (dp[i-1][j]+1,   ("D", i-1, None)),
                    (dp[i][j-1]+1,   ("I", None, j-1)),
                ]
                dp[i][j], bt[i][j] = min(cands, key=lambda x: x[0])
    ops = []
    i, j = m, n
    while i > 0 or j > 0:
        op, ri, rj = bt[i][j]
        ops.append((op, ri, rj))
        if op in ("M","R"): i -= 1; j -= 1
        elif op == "D": i -= 1
        else: j -= 1
    return list(reversed(ops))

def _restore_word_times_edit(
    ref_words: List[Dict[str, Any]],
    new_tokens: List[str],
    seg_start: float,
    seg_end: float
) -> List[Dict[str, Any]]:
    m = len(ref_words)
    ref_tokens = [w.get("word","") for w in ref_words]
    ops = _edit_align(ref_tokens, new_tokens)

    out = [{"word": tk, "start": None, "end": None} for tk in new_tokens]

    def rtime(i):
        if 0 <= i < m:
            return ref_words[i].get("start"), ref_words[i].get("end")
        return None, None
    def rdur(i):
        s,e = rtime(i)
        if isinstance(s,(int,float)) and isinstance(e,(int,float)):
            return max(0.0, e-s), s, e
        return 0.0, s, e

    anchor_map: Dict[int, Dict[str, Any]] = {}
    for op, ri, rj in ops:
        if op in ("M","R"):
            anchor_map[ri] = {"new_idx": rj, "op": op}

    for op, ri, rj in ops:
        if op in ("M","R"):
            rs,re = rtime(ri)
            if rj is not None:
                out[rj]["start"] = rs
                out[rj]["end"] = re

    blocks = []
    cur = {"left": None, "items": []}
    for t in ops:
        op, ri, rj = t
        if op in ("M","R"):
            cur["right"] = (ri, rj, op)
            blocks.append(cur)
            cur = {"left": (ri, rj, op), "items": []}
        else:
            cur["items"].append(t)
    if "right" not in cur:
        cur["right"] = None
        blocks.append(cur)

    def donor_segments_from_deletes(dels: List[int]) -> List[Tuple[float,float]]:
        segs = []
        for ri in dels:
            d,s,e = rdur(ri)
            if isinstance(s,(int,float)) and isinstance(e,(int,float)) and e >= s:
                segs.append((s,e))
        return segs

    def carve_from_match(ref_idx: int, amount: float, prefer_head: bool) -> Optional[Tuple[float,float]]:
        info = anchor_map.get(ref_idx)
        if not info or info["op"] != "M":
            return None
        j = info["new_idx"]
        s = out[j]["start"]; e = out[j]["end"]
        if not isinstance(s,(int,float)) or not isinstance(e,(int,float)) or e <= s or amount <= 0:
            return None
        take = min(amount, (e - s) * 0.9)
        if take <= 0: return None
        if prefer_head:
            seg = (s, s + take)
            out[j]["start"] = s + take
        else:
            seg = (e - take, e)
            out[j]["end"] = e - take
        return seg

    def pop_from_segments(pool: List[Tuple[float,float]], amount: float) -> Optional[Tuple[float,float]]:
        while pool and amount > 1e-9:
            s,e = pool[0]
            avail = max(0.0, e - s)
            if avail <= 1e-9:
                pool.pop(0); continue
            take = min(avail, amount)
            seg = (s, s + take)
            if s + take >= e - 1e-9:
                pool.pop(0)
            else:
                pool[0] = (s + take, e)
            return seg
        return None

    for b in blocks:
        la = b["left"]
        ra = b["right"]
        items = b["items"]
        dels = [ri for (op,ri,rj) in items if op == "D"]
        ins  = [rj for (op,ri,rj) in items if op == "I"]

        donor_pool = donor_segments_from_deletes(dels)

        i_ptr = 0
        while i_ptr < len(ins):
            new_j = ins[i_ptr]
            seg = pop_from_segments(donor_pool, amount= (rdur(dels[0])[0] if dels else 0.2))
            if seg:
                out[new_j]["start"], out[new_j]["end"] = seg
                i_ptr += 1
            else:
                break

        remain = ins[i_ptr:]
        if remain:
            left_ref  = la[0] if la else None
            right_ref = ra[0] if ra else None
            cands = []
            if la and la[2] == "M": cands.append(("L", left_ref))
            if ra and ra[2] == "M": cands.append(("R", right_ref))
            for idx, new_j in enumerate(remain):
                chosen = cands[idx % len(cands)] if cands else None
                seg = None
                if chosen:
                    side, r_idx = chosen
                    seg = carve_from_match(r_idx, amount=0.25 * rdur(r_idx)[0], prefer_head=(side=="R"))
                if seg is None:
                    if la and out[la[1]]["end"] is not None:
                        t = out[la[1]]["end"]
                    elif ra and out[ra[1]]["start"] is not None:
                        t = out[ra[1]]["start"]
                    else:
                        t = seg_start
                    out[new_j]["start"] = t
                    out[new_j]["end"] = t
                else:
                    out[new_j]["start"], out[new_j]["end"] = seg

        if len(dels) > len(ins):
            leftover = sum(max(0.0, e-s) for (s,e) in donor_pool)
            if leftover > 0 and la:
                lj = la[1]
                if lj is not None:
                    if out[lj]["end"] is None:
                        out[lj]["end"] = out[lj]["start"]
                    out[lj]["end"] = (out[lj]["end"] or out[lj]["start"]) + leftover

    last_end = seg_start
    for j in range(len(out)):
        s = out[j]["start"]; e = out[j]["end"]
        if s is None and e is None:
            s = last_end; e = last_end
        elif s is None:
            s = min(e, last_end)
        elif e is None:
            e = max(s, last_end)
        if s < last_end:
            s = last_end
            if e < s: e = s
        out[j]["start"] = s
        out[j]["end"] = e
        last_end = e
    if out:
        out[-1]["end"] = max(out[-1]["end"], out[-1]["start"])
        if seg_end is not None and out[-1]["end"] > seg_end:
            out[-1]["end"] = seg_end
    return out

def _detect_reference_initial_pause(reference_json: Dict[str, Any], tol: float = 0.05) -> Tuple[bool, Optional[float]]:
    ref_pauses = reference_json.get("pauses", []) or []
    ref_words = reference_json.get("words", []) or []
    seg_start = reference_json.get("start")
    fw_start = ref_words[0].get("start") if ref_words and isinstance(ref_words[0].get("start"), (int, float)) else None
    for p in ref_pauses:
        ps, pe = p.get("start"), p.get("end")
        if isinstance(pe,(int,float)) and fw_start is not None and abs(pe - fw_start) <= tol:
            return True, (ps if isinstance(ps,(int,float)) else None)
        if isinstance(ps,(int,float)) and isinstance(seg_start,(int,float)) and ps < seg_start:
            return True, ps
    return False, None

def _materialize_pauses_align_to_gaps(
    pauses_with_gap: List[Tuple[int, float]],
    word_times: List[Dict[str, Any]],
    seg_start: float, seg_end: float,
    allow_initial_overflow: bool = False,
    initial_start_override: Optional[float] = None
) -> List[Dict[str, Any]]:
    n = len(word_times)
    def gap_bounds(g) -> Tuple[float,float]:
        if n == 0:
            if g == -1 and allow_initial_overflow and (initial_start_override is not None):
                return (initial_start_override, seg_end)
            return (seg_start, seg_end)
        if g == -1:
            first_s = word_times[0]["start"]
            base = initial_start_override if (allow_initial_overflow and initial_start_override is not None) else seg_start
            return (base, first_s if isinstance(first_s,(int,float)) else seg_start)
        if 0 <= g < n-1:
            a_end = word_times[g]["end"]
            b_start = word_times[g+1]["start"]
            return ((seg_start if a_end is None else a_end),
                    (seg_end if b_start is None else b_start))
        last_e = word_times[-1]["end"]
        return ((seg_end if last_e is None else last_e), seg_end)

    order, buckets = [], {}
    for g, d in pauses_with_gap:
        if g not in buckets:
            buckets[g] = []
            order.append(g)
        buckets[g].append(float(d))

    out = []
    for g in order:
        gs, ge = gap_bounds(g)
        gap_len = max(0.0, ge - gs)
        durs = [max(0.0, d) for d in buckets[g]]
        total = sum(durs)

        if total <= 1e-9:
            for _ in durs:
                out.append({"start": round(gs,3), "end": round(gs,3), "duration": 0.0})
            continue
        scale = gap_len / total if abs(total - gap_len) > 1e-9 else 1.0
        cur = gs
        for k, d in enumerate(durs):
            dur = d * scale
            if k == len(durs)-1:
                s = max(cur, gs); e = ge
            else:
                s = cur; e = min(cur + dur, ge)
            if e < s: e = s
            out.append({"start": round(s,3), "end": round(e,3), "duration": round(e - s,3)})
            cur = e
    return out

def _enforce_pauses_exact_and_rescale_words(
    pauses_with_gap: List[Tuple[int, float]],
    word_times: List[Dict[str, Any]],
    seg_start: float,
    seg_end: float,
    allow_initial_overflow: bool = False,
    initial_start_override: Optional[float] = None
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    
    n = len(word_times)

    gap_durs: Dict[int, List[float]] = {}
    gap_order: List[int] = []
    for g, d in pauses_with_gap:
        if g not in gap_durs:
            gap_durs[g] = []
            gap_order.append(g)
        gap_durs[g].append(float(d))

    def sum_gap(g: int) -> float:
        return sum(gap_durs.get(g, []))

    total_pause = sum(sum_gap(g) for g in set(gap_order))

    base_start = initial_start_override if (allow_initial_overflow and initial_start_override is not None) else seg_start

    total_available_for_words = max(0.0, (seg_end - base_start) - total_pause)

    orig_word_total = 0.0
    orig_word_durs = []
    for w in word_times:
        s, e = w.get("start"), w.get("end")
        d = max(0.0, (e - s) if isinstance(s, (int, float)) and isinstance(e, (int, float)) else 0.0)
        orig_word_durs.append(d)
        orig_word_total += d

    scale = (total_available_for_words / orig_word_total) if orig_word_total > 1e-9 else 0.0

    new_words = [{"word": w["word"], "start": None, "end": None} for w in word_times]
    new_pauses: List[Dict[str, Any]] = []

    pre_gap = sum_gap(-1) if n >= 0 else 0.0
    t = base_start + pre_gap

    if pre_gap > 0:
        cur = base_start
        for idx, dur in enumerate(gap_durs.get(-1, [])):
            s = cur
            e = t if idx == len(gap_durs[-1]) - 1 else min(cur + dur, t)
            if e < s: e = s
            new_pauses.append({"start": round(s, 3), "end": round(e, 3), "duration": round(e - s, 3)})
            cur = e

    for i in range(n):
        d_new = orig_word_durs[i] * scale
        s = t
        e = s + d_new
        if e < s: e = s
        new_words[i]["start"] = s
        new_words[i]["end"] = e

        g = i  
        g_sum = sum_gap(g)
        if g_sum > 0:
            cur = e
            end_of_gap = e + g_sum
            dlist = gap_durs.get(g, [])
            for k, dur in enumerate(dlist):
                ps = cur
                pe = end_of_gap if k == len(dlist) - 1 else min(cur + dur, end_of_gap)
                if pe < ps: pe = ps
                new_pauses.append({"start": round(ps, 3), "end": round(pe, 3), "duration": round(pe - ps, 3)})
                cur = pe
            t = end_of_gap
        else:
            t = e

    tail_gap = sum_gap(n - 1) if n > 0 else sum_gap(-1)
    drift = seg_end - t
    if abs(drift) > 1e-6:
        if new_pauses:
            new_pauses[-1]["end"] = round(new_pauses[-1]["end"] + drift, 3)
            new_pauses[-1]["duration"] = round(new_pauses[-1]["end"] - new_pauses[-1]["start"], 3)
            t = seg_end
        elif new_words:
            new_words[-1]["end"] = new_words[-1]["end"] + drift
            t = seg_end

    last = base_start + pre_gap
    for i in range(n):
        s = new_words[i]["start"]; e = new_words[i]["end"]
        if s < last: s = last
        if e < s: e = s
        new_words[i]["start"] = round(s, 3)
        new_words[i]["end"]   = round(e, 3)
        last = e

    return new_words, new_pauses


def salt_to_json(salt_text: str, reference_json: Dict[str, Any]) -> Dict[str, Any]:
    parsed = _parse_salt(salt_text)
    ref = reference_json or {}
    seg_start = ref.get("start", 0.0)
    seg_end   = ref.get("end", seg_start)

    word_times_draft = _restore_word_times_edit(ref.get("words", []), parsed["words"], seg_start, seg_end)

    has_init, init_start = _detect_reference_initial_pause(ref)
    allow_initial_overflow = bool(parsed["first_token_is_pause"] and has_init)
    initial_start_override = init_start if allow_initial_overflow else None

    word_times, pauses = _enforce_pauses_exact_and_rescale_words(
        pauses_with_gap = parsed["pauses_with_gap"],
        word_times      = word_times_draft,
        seg_start       = seg_start,
        seg_end         = seg_end,
        allow_initial_overflow = allow_initial_overflow,
        initial_start_override = initial_start_override
    )

    return {
        "start": ref.get("start"),
        "end": ref.get("end"),
        "speaker": ref.get("speaker"),
        "text_token": ref.get("text_token"),
        "text_clean": ref.get("text_clean"),
        "text": " ".join(parsed["words"]),
        "words": word_times,
        "mazes": parsed["mazes"],
        "pauses": pauses,
        "morphemes": parsed["morphemes"]
    }



if __name__ == "__main__":
    ref = {
      "start": 174.518,
      "end": 183.043,
      "speaker": "Child",
      "text_token": "and then and the baby got one too",
      "text": "and then and the baby got one too",
      "words": [
        {
          "word": "and",
          "start": 174.518,
          "end": 174.919
        },
        {
          "word": "then",
          "start": 177.286,
          "end": 177.366
        },
        {
          "word": "and",
          "start": 177.386,
          "end": 177.447
        },
        {
          "word": "the",
          "start": 177.828,
          "end": 177.988
        },
        {
          "word": "baby",
          "start": 178.45,
          "end": 179.132
        },
        {
          "word": "got",
          "start": 179.874,
          "end": 180.195
        },
        {
          "word": "one",
          "start": 180.435,
          "end": 181.057
        },
        {
          "word": "too",
          "start": 181.077,
          "end": 183.043
        }
      ],
      "revisions": [
        {
          "content": "and",
          "words": [
            0
          ],
          "mark_location": 0
        },
        {
          "content": "then",
          "words": [
            1
          ],
          "mark_location": 1
        }
      ],
      "pauses": [
        {
          "start": 173.205,
          "end": 174.518,
          "duration": 1.313
        },
        {
          "start": 174.919,
          "end": 177.286,
          "duration": 2.367
        },
        {
          "start": 177.447,
          "end": 177.828,
          "duration": 0.381
        },
        {
          "start": 177.988,
          "end": 178.45,
          "duration": 0.462
        },
        {
          "start": 179.132,
          "end": 179.874,
          "duration": 0.742
        }
      ],
      "text_clean": "and then and the baby got one too",
      "morphemes": [
        {
          "word": "got",
          "lemma": "get",
          "index": 5,
          "inflectional_morpheme": "Past Tense",
          "morpheme_form": "<IRR>"
        }
      ]
    }

    salt = json_to_salt(json.dumps(ref))
    print(salt)
    # :1.3 (and :2.4 then) and :0.4 the :0.5 baby :0.7 got one too
    result = salt_to_json(':1.3 (then) and :0.4 the eh :0.5 haha (got got got) but :0.1 one too', ref)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print(json_to_salt(json.dumps(result)))