'use client';

import { Pagination } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export interface ListPaginationProps {
  page?: number;
  pageCount?: number;
  showPageNumbers?: boolean;
  previousAriaLabel?: string;
  nextAriaLabel?: string;
  getPageAriaLabel?: (page: number) => string;
  onPageChange?: (page: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  sx?: SxProps<Theme>;
}

function mergeSx(base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> {
  if (!sx) {
    return base;
  }

  return (Array.isArray(sx) ? [base, ...sx] : [base, sx]) as SxProps<Theme>;
}

export function ListPagination({
  page = 1,
  pageCount = 1,
  showPageNumbers = false,
  previousAriaLabel = '前往上一頁',
  nextAriaLabel = '前往下一頁',
  getPageAriaLabel,
  onPageChange,
  onPrevious,
  onNext,
  sx,
}: ListPaginationProps) {
  const normalizedPageCount = Math.max(pageCount, 1);
  const normalizedPage = Math.min(Math.max(page, 1), normalizedPageCount);

  return (
    <Pagination
      count={normalizedPageCount}
      page={normalizedPage}
      siblingCount={showPageNumbers ? 1 : 0}
      boundaryCount={showPageNumbers ? 1 : 0}
      onChange={(_, nextPage) => {
        onPageChange?.(nextPage);

        if (nextPage < normalizedPage) {
          onPrevious?.();
          return;
        }

        if (nextPage > normalizedPage) {
          onNext?.();
        }
      }}
      getItemAriaLabel={(type, itemPage) => {
        if (type === 'previous') {
          return previousAriaLabel;
        }

        if (type === 'next') {
          return nextAriaLabel;
        }

        const pageLabel = itemPage ?? normalizedPage;

        return getPageAriaLabel?.(pageLabel) ?? `前往第 ${pageLabel} 頁`;
      }}
      sx={mergeSx(
        {
          '& .MuiPagination-ul': {
            flexWrap: 'nowrap',
            gap: 0.5,
          },
          '& .MuiPaginationItem-root': {
            minWidth: 18,
            height: 18,
            m: 0,
            p: 0,
            fontSize: 12,
          },
          ...(showPageNumbers
            ? {}
            : {
                '& .MuiPaginationItem-page': {
                  display: 'none',
                },
              }),
        },
        sx,
      )}
    />
  );
}
