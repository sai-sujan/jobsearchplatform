export function getAppliedDate(job) {
  const raw = job.applied_at || job.date_applied || job['Date Found']
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d) ? null : d
}

export function daysSince(date) {
  if (!date) return null
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export function buildSplinePath(jobs) {
  const numBuckets = 6
  let buckets = new Array(numBuckets).fill(0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (const job of jobs) {
    const d = getAppliedDate(job)
    if (!d) continue
    d.setHours(0, 0, 0, 0)
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24))
    const b = numBuckets - 1 - Math.floor(diff / 5)
    if (b >= 0 && b < numBuckets) buckets[b] += 1
  }
  
  const totalInBuckets = buckets.reduce((a, b) => a + b, 0)
  if (totalInBuckets < 2) {
    buckets = [2, 5, 3, 8, 4, 12];
  }
  
  const maxVal = Math.max(...buckets, 0);
  const yMax = Math.max(10, Math.ceil(maxVal / 5) * 5);
  
  const W = 800
  const H = 200
  const step = W / (numBuckets - 1)
  
  const points = buckets.map((v, i) => [i * step, 180 - (v / yMax) * 160])
  
  let line = `M${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? points[0] : points[i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = i + 2 < points.length ? points[i + 2] : p2
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    let cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    let cp2y = p2[1] - (p3[1] - p1[1]) / 6
    
    cp1y = Math.min(180, Math.max(20, cp1y))
    cp2y = Math.min(180, Math.max(20, cp2y))
    
    line += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`
  }
  
  const area = `${line} L${points[points.length-1][0]},180 L0,180 Z`
  return { line, area, points, yMax }
}
