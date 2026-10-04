'use client';

import { Box, type BoxProps } from '@mui/material';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough/parseOnly';
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly';
import remarkGfm from 'remark-gfm';

import { designTokens } from '../../theme';
import { rehypeCheckboxKey } from './rehype-plugins/checkbox-key';
import { Checkbox } from './checkbox';

const { color, focusRing, radius, typography } = designTokens;

const markdownComponents = {
  table: ({ children, className, node: _, ...props }) => {
    return (
      <Box sx={{ overflowX: 'auto', my: '16px' }}>
        <table className={className} {...props}>
          {children}
        </table>
      </Box>
    );
  },
} satisfies Components;

export interface MarkdownProps {
  source: string;
  articleId?: string;
  components?: Components;
  className?: string;
  sx?: BoxProps['sx'];
}

export function Markdown({
  source,
  articleId,
  components,
  className,
  sx = [],
}: MarkdownProps) {
  return (
    <Box
      className={className}
      sx={[
        {
          ...typography.body[400],
          fontSize: 15,
          lineHeight: 1.85,
          color: color.fg.neutral.default,
          minWidth: 0,
          overflowWrap: 'anywhere',
          '& h1, & h2, & h3, & h4, & h5, & h6': {
            fontFamily: typography.heading[600].fontFamily,
            fontWeight: 700,
            lineHeight: 1.4,
            mt: '26px',
            mb: '10px',
            scrollMarginTop: '16px',
          },
          '& h1': { fontSize: 24 },
          '& h2': { fontSize: 21 },
          '& h3': { fontSize: 17, lineHeight: 1.5, mt: '18px', mb: '8px' },
          '& h4, & h5, & h6': {
            fontSize: 15,
            lineHeight: 1.5,
            mt: '14px',
            mb: '6px',
          },
          '& strong, & b': { fontWeight: 700 },
          '& p, & ul, & ol': { mt: 0, mb: '10px' },
          '& ul, & ol': { pl: '22px' },
          '& li': { my: '3px' },
          '& a': {
            color: color.brand.secondary.subtle,
            textDecoration: 'underline',
          },
          '& a:focus-visible, & input:focus-visible': {
            outline: `${focusRing.width}px solid ${focusRing.color}`,
            outlineOffset: `${focusRing.offset}px`,
          },
          '& blockquote': {
            m: '10px 0',
            p: '8px 14px',
            borderLeft: `3px solid ${color.border.default}`,
            borderRadius: `0 ${radius.md}px ${radius.md}px 0`,
            bgcolor: color.bg.neutral.subtle,
          },
          '& hr': {
            my: '16px',
            border: 0,
            borderTop: `1px solid ${color.border.default}`,
          },
          '& img': {
            display: 'block',
            maxWidth: '100%',
            height: 'auto',
            borderRadius: `${radius.md}px`,
            my: '8px',
          },
          '& code': {
            fontFamily: 'monospace',
            fontSize: '0.9em',
            bgcolor: color.bg.neutral.sunken,
            borderRadius: `${radius.sm}px`,
            p: '2px 5px',
          },
          '& pre': {
            m: '16px 0',
            p: '16px',
            overflowX: 'auto',
            bgcolor: color.bg.neutral.subtle,
            border: `1px solid ${color.border.subtle}`,
            borderRadius: `${radius.md}px`,
            '& code': { p: 0, bgcolor: 'transparent' },
          },
          '& table': {
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
          },
          '& th, & td': {
            p: '10px 12px',
            border: `1px solid ${color.border.subtle}`,
          },
          '& th': { bgcolor: color.bg.neutral.subtle, fontWeight: 700 },
          '& .task-list-item': {
            position: 'relative',
            listStyle: 'none',
            ml: '-1.15em',
            my: 0,
            pl: '34px',
            py: '14px',
            minHeight: 44,
            fontSize: 16,
          },
          '& .task-list-item > ul, & .task-list-item > ol': {
            mt: '8px',
          },
          '& .task-list-item input[type="checkbox"]': {
            appearance: 'none',
            WebkitAppearance: 'none',
            position: 'absolute',
            left: 0,
            top: 'calc(14px + (1.85em - 22px) / 2)',
            m: 0,
            width: 22,
            height: 22,
            boxSizing: 'border-box',
            font: 'inherit',
            borderRadius: '6px',
            border: `1.5px solid ${color.border.default}`,
            bgcolor: color.bg.neutral.default,
            cursor: 'pointer',
          },
          '& .task-list-item input[type="checkbox"]:checked': {
            bgcolor: color.brand.secondary.default,
            borderColor: color.brand.secondary.default,
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 7,
              top: 3,
              width: 5,
              height: 10,
              border: `solid ${color.fg.inverse}`,
              borderWidth: '0 2px 2px 0',
              transform: 'rotate(45deg)',
            },
          },
          '& > :first-child': { mt: 0 },
          '& > :last-child': { mb: 0 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <ReactMarkdown
        key={source}
        remarkPlugins={[
          remarkGfm,
          remarkCjkFriendly,
          remarkCjkFriendlyGfmStrikethrough,
        ]}
        rehypePlugins={[rehypeSlug, rehypeCheckboxKey]}
        skipHtml
        components={{
          ...markdownComponents,
          input: ({ node, checked: markdownChecked, ...props }) => {
            const checkboxId = String(node?.properties['data-task-key']);
            if (props.type !== 'checkbox' || !articleId || !checkboxId)
              return <input {...props} />;

            return (
              <Checkbox
                articleId={articleId}
                checkboxId={checkboxId}
                {...props}
              />
            );
          },
          ...components,
        }}
      >
        {source}
      </ReactMarkdown>
    </Box>
  );
}
