import { KANA_TO_ROMAJI } from './config.js';

export function todayISO(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
export function addDaysISO(days){
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}
export function isDue(cardState){
  // cardState.due is a Date object from FSRS
  return cardState.due.getTime() <= Date.now();
}
export function formatTimeDiff(diffMs) {
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear}y`;
}
export function renderFurigana(card, withFurigana){
  if(!withFurigana){
    return escapeHtml(card.kanji);
  }
  let html = '';
  for(const seg of card.furigana){
    if(seg.reading){
      html += `<ruby>${escapeHtml(seg.text)}<rt>${escapeHtml(seg.reading)}</rt></ruby>`;
    } else {
      html += escapeHtml(seg.text);
    }
  }
  return html;
}
export function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
export function titleCase(s){
  return s.split(' ').map(w => w.length>2 ? w.charAt(0)+w.slice(1).toLowerCase() : w).join(' ');
}
export function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}
export function toRomaji(kana){
  let out = '';
  const chars = [...kana];
  for(let i=0;i<chars.length;i++){
    const ch = chars[i];
    const next = chars[i+1];
    if(ch==='っ' && next && KANA_TO_ROMAJI[next]){
      out += KANA_TO_ROMAJI[next][0];
      continue;
    }
    out += (KANA_TO_ROMAJI[ch] !== undefined ? KANA_TO_ROMAJI[ch] : ch);
  }
  return out;
}
