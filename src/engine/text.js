// Tokenising, light stemming and edit distance. No dependencies.

export const STOP = new Set(`a an the and or nor but of for to in on at by with from as is are was were be been it its this that these those
my our your his her their me i we you they he she them us who whom whose what which when where how why do does did done doing have has had
can could would should will shall may might must just really very quite also too so some any all more most much many few lot lots bit
about around into out up down over under below above than then there here get got give gift gifts present presents idea ideas something
someone anything looking look need needs want wants buy find suggest suggestions recommend please help thing things stuff kind sort type
nice good great best cool lovely thoughtful special perfect unique fun cute pretty decent okay ok like likes love loves loved enjoy enjoys
enjoying into totally always maybe`.split(/\s+/));

export function normalize(s) {
  return s.toLowerCase().replace(/[’`]/g, "'").replace(/\b(do|does|did|is|are|was|can|could|would|should|wo|ca)nt\b/g, "$1 not").replace(/\bwont\b/g, "will not").replace(/\bcant\b/g, "can not").replace(/'s\b/g, "").replace(/n't\b/g, " not").replace(/[^a-z0-9$€£.\-' ]+/g, " ");
}

export function tokenize(s) {
  return normalize(s).replace(/[$€£]/g, " ").replace(/(?<![0-9])\.|\.(?![0-9])/g, " ").split(/[\s\-']+/).filter(Boolean);
}

// Conflates hike/hiking/hikes, bake/baking, game/games/gaming, runner/running.
export function stem(w) {
  if (w.length <= 3 || /^\d+$/.test(w)) return w;
  let s = w;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (/(ches|shes|sses|xes|zes)$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 5 && s.endsWith("ers")) s = s.slice(0, -3);
  else if (s.length > 5 && s.endsWith("er")) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  if (s.endsWith("e") && s.length > 3) s = s.slice(0, -1);
  if (/([b-df-hj-np-tv-z])\1$/.test(s) && s.length > 3 && !/(ll|ss|ff|zz)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith("y") && s.length > 4) s = s.slice(0, -1) + "i";
  return s;
}

// Damerau-Levenshtein (optimal string alignment) with early exit.
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
