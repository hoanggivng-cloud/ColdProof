import Link from 'next/link';
import type { ReactNode } from 'react';
export interface Crumb { href?: string; label: string }
export function PageHeader({ title, description, breadcrumb, meta, children }: { title: string; description?: string; breadcrumb?: Crumb[]; meta?: ReactNode[]; children?: ReactNode }) {
  return <header className="page-header"><div>
    {breadcrumb?.length ? <nav className="breadcrumb" aria-label="Đường dẫn"><ol>{breadcrumb.map(item => <li key={item.label}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav> : null}
    <h1>{title}</h1>
    {description && <p>{description}</p>}
    {meta?.length ? <ul className="page-meta">{meta.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
  </div>{children && <div className="actions">{children}</div>}</header>;
}
