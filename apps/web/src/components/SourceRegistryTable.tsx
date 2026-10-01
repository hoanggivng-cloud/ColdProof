import type { SourceSummary } from '../services/data-service';
import { OriginBadge } from './OriginBadge';
export function SourceRegistryTable({ sources }: { sources: SourceSummary[] }) {
  return <table><thead><tr><th>Source</th><th>Dataset</th><th>File</th><th>Origin</th></tr></thead><tbody>{sources.length ? sources.map(s => <tr key={s.id}><td>{s.id}</td><td>{s.dataset}</td><td>{s.file}</td><td><OriginBadge origin={s.origin} /></td></tr>) : <tr><td colSpan={4}>Chưa có dữ liệu.</td></tr>}</tbody></table>;
}
