import type { ReactNode } from 'react';

export function DataTable({ headers, children, footer }: { headers: string[]; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <table className="min-w-full text-left text-[15px] text-slate-700">
        <thead className="border-b border-slate-200 bg-white text-sm text-slate-500">
          <tr>
            {headers.map((header) => <th key={header} className="px-4 py-4 font-medium">{header}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {footer ? <div className="border-t border-slate-200 px-5 py-4">{footer}</div> : null}
    </div>
  );
}
