/**
 * Pagination Component
 * 
 * Reusable pagination UI with:
 * - Previous/Next buttons
 * - Page numbers with ellipsis for large page counts
 * - Optional item count display
 */

'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  limit?: number;
  onPageChange: (page: number) => void;
  className?: string;
  showItemCount?: boolean;
}

export default function Pagination({
  page,
  totalPages,
  total,
  limit = 20,
  onPageChange,
  className = '',
  showItemCount = false,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build page numbers with ellipsis
  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (page <= 3) {
      pages.push(1, 2, 3, 4, '...', totalPages);
    } else if (page >= totalPages - 2) {
      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
    }
  }

  return (
    <div className={`flex items-center justify-between pt-4 border-t border-gray-100 ${className}`}>
      {showItemCount && total !== undefined ? (
        <span className="text-sm text-gray-500">
          Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total} items
        </span>
      ) : (
        <span className="text-sm text-gray-500">
          Page {page} of {totalPages}
        </span>
      )}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          aria-label="Previous page"
        >
          ←
        </button>
        {pages.map((p, i) => (
          typeof p === 'number' ? (
            <button
              key={i}
              onClick={() => onPageChange(p)}
              className={`px-3 py-1 text-sm rounded border transition-colors ${
                p === page
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          ) : (
            <span key={i} className="px-2 text-gray-400" aria-hidden="true">
              ...
            </span>
          )
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
}

/**
 * Simple pagination with just Previous/Next
 */
export function SimplePagination({
  page,
  totalPages,
  onPageChange,
  className = '',
}: Omit<PaginationProps, 'total' | 'limit' | 'showItemCount'>) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-center gap-2 pt-4 border-t border-gray-100 ${className}`}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
      >
        ← Previous
      </button>
      <span className="text-sm text-gray-500 px-2">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
      >
        Next →
      </button>
    </div>
  );
}
