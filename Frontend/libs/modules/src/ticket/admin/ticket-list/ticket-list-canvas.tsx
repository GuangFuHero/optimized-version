'use client';

import { Stack, Typography } from '@mui/material';

import { ListPagination } from '@rescue-frontend/ui';

import { AdminListPageLayout } from '../../../admin/shared/admin-list-page-layout';
import { TicketListFilterBar } from './ticket-list-filter-bar';
import { TicketListHeader } from './ticket-list-header';
import { ticketListPalette } from './ticket-list-primitives';
import { TicketTable } from './ticket-table';
import type { TicketListCanvasProps } from './types';

export function TicketListCanvas({
  headerTitle,
  headerActions,
  filters,
  filterPanels,
  selectedFilterValues,
  onFilterChange,
  clearFiltersLabel,
  onClearFilters,
  aiReviewIndicator,
  rows,
  totalCountLabel,
  pagination,
  minHeight = '100%',
  tableMinWidth = 1342,
}: TicketListCanvasProps) {
  return (
    <AdminListPageLayout
      minHeight={minHeight}
      canvasColor={ticketListPalette.canvas}
      header={<TicketListHeader title={headerTitle} actions={headerActions} />}
      filterPanel={
        <TicketListFilterBar
          items={filters}
          panels={filterPanels}
          selectedValues={selectedFilterValues}
          onFilterChange={onFilterChange}
          clearLabel={clearFiltersLabel}
          onClear={onClearFilters}
          aiReviewIndicator={aiReviewIndicator}
        />
      }
      filterPanelSx={{ display: { mobile: 'none', tablet: 'block' } }}
      list={<TicketTable rows={rows} minWidth={tableMinWidth} />}
      listContainerSx={{ m: 2 }}
      footer={
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
            px: 3,
            py: '10px',
            borderTop: `1px solid ${ticketListPalette.frameBorder}`,
            bgcolor: ticketListPalette.canvas,
          }}
        >
          <Typography
            sx={{
              color: ticketListPalette.bodyText,
              fontSize: 12,
              lineHeight: '16px',
              fontWeight: 400,
              whiteSpace: 'nowrap',
            }}
          >
            {totalCountLabel}
          </Typography>

          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: 'center', flexShrink: 0 }}
          >
            <Typography
              sx={{
                color: ticketListPalette.bodyText,
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 400,
                whiteSpace: 'nowrap',
              }}
            >
              {pagination?.rowsPerPageLabel} {pagination?.rowsPerPageValue}
            </Typography>
            <Typography
              sx={{
                color: ticketListPalette.bodyText,
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 400,
                whiteSpace: 'nowrap',
              }}
            >
              {pagination?.visibleRangeLabel}
            </Typography>
            <ListPagination
              page={pagination?.page}
              pageCount={pagination?.pageCount}
              previousAriaLabel={pagination?.previousAriaLabel}
              nextAriaLabel={pagination?.nextAriaLabel}
              onPageChange={pagination?.onPageChange}
              onPrevious={pagination?.onPrevious}
              onNext={pagination?.onNext}
              sx={{
                '& .MuiPaginationItem-root': {
                  color: ticketListPalette.paginationIcon,
                },
              }}
            />
          </Stack>
        </Stack>
      }
    />
  );
}
