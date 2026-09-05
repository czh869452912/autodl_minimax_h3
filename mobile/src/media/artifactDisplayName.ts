import CryptoJS from 'crypto-js';
export function artifactExportDisplayName(jobId: string, artifactId: string): string {
  const safeJobId = jobId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[_\.]+|[_\.]+$/g, '').slice(0, 48) || 'job';
  const identity = CryptoJS.SHA256(`${jobId}\u0000${artifactId}`).toString(CryptoJS.enc.Hex).slice(0, 16);
  return `${safeJobId}-${identity}.mp4`;
}
